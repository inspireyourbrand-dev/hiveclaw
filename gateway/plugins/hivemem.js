/**
 * HiveMem Plugin — OpenClaw Memory Integration
 *
 * Replaces OpenClaw's default memory slots with HiveMem persistent storage.
 * This plugin hooks into the OpenClaw agent runtime to provide:
 *   - Persistent memory across sessions (survives restarts)
 *   - Shared memory between agents (cross-swarm knowledge)
 *   - Hybrid search (keyword + full-text)
 *   - Automatic memory tagging by agent name
 *
 * Compatible with the mem9 API spec (v1alpha2).
 *
 * @module gateway/plugins/hivemem
 */

const PLUGIN_NAME = 'hivemem';
const PLUGIN_VERSION = '1.0.0';

/**
 * OpenClaw plugin interface
 */
export default {
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  description: 'Persistent memory for HiveClaw agents powered by HiveMem',

  /**
   * Tools exposed to the agent runtime
   */
  tools: [
    {
      name: 'memory_store',
      description: 'Store a memory for later retrieval. Use this to remember facts, decisions, context, or anything the agent swarm should retain across sessions.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The memory content to store' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization (e.g., ["project", "decision", "user-preference"])' },
          agent: { type: 'string', description: 'The agent storing this memory' },
        },
        required: ['content'],
      },
      handler: async ({ content, tags = [], agent = 'unknown' }, ctx) => {
        try {
          const url = `${ctx.hivememUrl}/memories`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, tags: [...tags, `agent:${agent}`], metadata: { agent, source: 'plugin' } }),
          });
          if (!res.ok) return { error: `HiveMem responded with ${res.status}`, status: res.status };
          return await res.json();
        } catch (err) {
          return { error: `HiveMem unavailable: ${err.message}`, offline: true };
        }
      },
    },
    {
      name: 'memory_search',
      description: 'Search stored memories by keyword or tag. Returns the most relevant memories matching the query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (keywords or natural language)' },
          tag: { type: 'string', description: 'Filter by tag' },
          limit: { type: 'number', description: 'Maximum results to return (default: 10)' },
        },
      },
      handler: async ({ query, tag, limit = 10 }, ctx) => {
        try {
          const params = new URLSearchParams();
          if (query) params.set('q', query);
          if (tag) params.set('tag', tag);
          params.set('limit', limit.toString());

          const res = await fetch(`${ctx.hivememUrl}/memories?${params}`);
          if (!res.ok) return { error: `HiveMem responded with ${res.status}`, memories: [] };
          return await res.json();
        } catch (err) {
          return { error: `HiveMem unavailable: ${err.message}`, memories: [], offline: true };
        }
      },
    },
    {
      name: 'memory_get',
      description: 'Retrieve a specific memory by its ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The memory ID to retrieve' },
        },
        required: ['id'],
      },
      handler: async ({ id }, ctx) => {
        try {
          const res = await fetch(`${ctx.hivememUrl}/memories/${id}`);
          if (!res.ok) return { error: `Memory not found or server error (${res.status})` };
          return await res.json();
        } catch (err) {
          return { error: `HiveMem unavailable: ${err.message}`, offline: true };
        }
      },
    },
    {
      name: 'memory_update',
      description: 'Update an existing memory.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The memory ID to update' },
          content: { type: 'string', description: 'New content' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Updated tags' },
        },
        required: ['id'],
      },
      handler: async ({ id, content, tags }, ctx) => {
        try {
          const body = {};
          if (content) body.content = content;
          if (tags) body.tags = tags;

          const res = await fetch(`${ctx.hivememUrl}/memories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) return { error: `Update failed (${res.status})` };
          return await res.json();
        } catch (err) {
          return { error: `HiveMem unavailable: ${err.message}`, offline: true };
        }
      },
    },
    {
      name: 'memory_delete',
      description: 'Delete a memory by its ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The memory ID to delete' },
        },
        required: ['id'],
      },
      handler: async ({ id }, ctx) => {
        try {
          const res = await fetch(`${ctx.hivememUrl}/memories/${id}`, { method: 'DELETE' });
          if (!res.ok) return { error: `Delete failed (${res.status})` };
          return await res.json();
        } catch (err) {
          return { error: `HiveMem unavailable: ${err.message}`, offline: true };
        }
      },
    },
  ],

  /**
   * Plugin initialization — called when OpenClaw loads the plugin
   */
  async init(config) {
    const port = config?.port || process.env.HIVEMEM_PORT || 8090;
    const host = config?.host || '127.0.0.1';

    return {
      hivememUrl: `http://${host}:${port}/api/v1/hivemem`,
    };
  },
};
