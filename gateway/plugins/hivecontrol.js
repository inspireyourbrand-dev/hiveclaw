/**
 * HiveControl Plugin — Dashboard Integration for OpenClaw
 *
 * Registers the HiveControl OS dashboard as an OpenClaw skill/canvas,
 * enabling the agent to reference dashboard state and provide users
 * with visual feedback through the control panel.
 *
 * @module gateway/plugins/hivecontrol
 */

const PLUGIN_NAME = 'hivecontrol';
const PLUGIN_VERSION = '1.0.0';

export default {
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  description: 'HiveControl OS dashboard plugin for OpenClaw — provides agent swarm visibility',

  tools: [
    {
      name: 'dashboard_status',
      description: 'Get the current state of the HiveControl dashboard including active agents, running workflows, and system health.',
      parameters: { type: 'object', properties: {} },
      handler: async (_params, ctx) => {
        try {
          const res = await fetch(`${ctx.gatewayUrl}/health`);
          if (!res.ok) return { error: `Gateway responded with ${res.status}` };
          return await res.json();
        } catch (err) {
          return { error: `Gateway unavailable: ${err.message}`, offline: true };
        }
      },
    },
    {
      name: 'dashboard_agents',
      description: 'List all registered agents and their current status.',
      parameters: { type: 'object', properties: {} },
      handler: async (_params, ctx) => {
        try {
          const res = await fetch(`${ctx.gatewayUrl}/api/v1/agents`);
          if (!res.ok) return { error: `Gateway responded with ${res.status}`, agents: [] };
          return await res.json();
        } catch (err) {
          return { error: `Gateway unavailable: ${err.message}`, agents: [], offline: true };
        }
      },
    },
    {
      name: 'dashboard_spawn_agent',
      description: 'Spawn a new agent task through the HiveControl dashboard.',
      parameters: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: 'Agent name (orion, atlas, forge, patch, quill, cipher, pixel, spark)' },
          task: { type: 'string', description: 'Task description for the agent' },
        },
        required: ['agent', 'task'],
      },
      handler: async ({ agent, task }, ctx) => {
        try {
          const res = await fetch(`${ctx.gatewayUrl}/api/v1/agents/spawn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent, task }),
          });
          if (!res.ok) return { error: `Spawn failed (${res.status})` };
          return await res.json();
        } catch (err) {
          return { error: `Gateway unavailable: ${err.message}`, offline: true };
        }
      },
    },
    {
      name: 'dashboard_governor',
      description: 'Check the Governor Mode status — API budget protection state.',
      parameters: { type: 'object', properties: {} },
      handler: async (_params, ctx) => {
        try {
          const res = await fetch(`${ctx.gatewayUrl}/api/v1/governor`);
          if (!res.ok) return { error: `Gateway responded with ${res.status}` };
          return await res.json();
        } catch (err) {
          return { error: `Gateway unavailable: ${err.message}`, offline: true };
        }
      },
    },
  ],

  async init(config) {
    const port = config?.port || process.env.OPENCLAW_GATEWAY_PORT || 18789;
    const host = config?.host || '127.0.0.1';

    return {
      gatewayUrl: `http://${host}:${port}`,
    };
  },
};
