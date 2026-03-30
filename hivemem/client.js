/**
 * HiveMem Client — JavaScript client for HiveMem API
 *
 * Use this to interact with HiveMem from any JavaScript context:
 * Node.js scripts, browser dashboard, or OpenClaw plugins.
 *
 * @module hivemem/client
 * @example
 *   import HiveMemClient from './hivemem/client.js';
 *   const mem = new HiveMemClient();
 *   await mem.store('Remember this fact', ['important']);
 *   const results = await mem.search('fact');
 */

class HiveMemClient {
  constructor(baseUrl = null) {
    const port = process.env.OPENCLAW_GATEWAY_PORT || '18789';
    const host = process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1';
    this.baseUrl = baseUrl || `http://${host}:${port}/api/v1/hivemem`;
  }

  async store(content, tags = [], metadata = {}) {
    const res = await fetch(`${this.baseUrl}/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, tags, metadata }),
    });
    if (!res.ok) throw new Error(`HiveMem store failed: ${res.status}`);
    return await res.json();
  }

  async search(query, { tag, limit = 20 } = {}) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (tag) params.set('tag', tag);
    params.set('limit', limit.toString());

    const res = await fetch(`${this.baseUrl}/memories?${params}`);
    if (!res.ok) throw new Error(`HiveMem search failed: ${res.status}`);
    return await res.json();
  }

  async get(id) {
    const res = await fetch(`${this.baseUrl}/memories/${id}`);
    if (!res.ok) throw new Error(`HiveMem get failed: ${res.status}`);
    return await res.json();
  }

  async update(id, updates) {
    const res = await fetch(`${this.baseUrl}/memories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`HiveMem update failed: ${res.status}`);
    return await res.json();
  }

  async delete(id) {
    const res = await fetch(`${this.baseUrl}/memories/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HiveMem delete failed: ${res.status}`);
    return await res.json();
  }

  async stats() {
    const res = await fetch(`${this.baseUrl}/stats`);
    if (!res.ok) throw new Error(`HiveMem stats failed: ${res.status}`);
    return await res.json();
  }
}

export default HiveMemClient;
