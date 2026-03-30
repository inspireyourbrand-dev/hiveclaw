/**
 * HiveClaw Gateway — Enhanced OpenClaw Gateway Wrapper
 *
 * Extends the OpenClaw WebSocket gateway with:
 *   - HiveControl OS dashboard (served at /__hiveclaw__/hivecontrol/)
 *   - HiveMem persistent memory (SQLite built-in or external mem9)
 *   - HiveWorkflow engine integration
 *   - Governor Mode API budget protection
 *   - Agent swarm management
 *
 * @module gateway
 * @author HivePowered.AI
 */

import { createServer } from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import express from 'express';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Governor from './middleware/governor.js';
import Auth from './middleware/auth.js';
import HiveMemMiddleware from './middleware/memory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
function loadConfig() {
  const defaults = {
    gateway: {
      port: parseInt(process.env.OPENCLAW_GATEWAY_PORT || '18789'),
      host: process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1',
    },
    hivecontrol: {
      enabled: process.env.HIVECONTROL_ENABLED !== 'false',
      path: process.env.HIVECONTROL_PATH || '/__hiveclaw__/hivecontrol/',
      theme: process.env.HIVECONTROL_THEME || 'dark',
    },
    hivemem: {
      enabled: process.env.HIVEMEM_ENABLED !== 'false',
      port: parseInt(process.env.HIVEMEM_PORT || '8090'),
      storage: process.env.HIVEMEM_STORAGE || 'sqlite',
      sqlitePath: process.env.HIVEMEM_SQLITE_PATH || join(ROOT, 'data', 'hivemem.db'),
    },
    hiveworkflow: {
      enabled: process.env.HIVEWORKFLOW_ENABLED !== 'false',
      maxConcurrent: parseInt(process.env.HIVEWORKFLOW_MAX_CONCURRENT || '5'),
    },
    governor: {
      enabled: process.env.GOVERNOR_ENABLED !== 'false',
      maxConcurrent: parseInt(process.env.GOVERNOR_MAX_CONCURRENT || '1'),
      minDelayMs: parseInt(process.env.GOVERNOR_MIN_DELAY_MS || '2000'),
      backoffTiers: (process.env.GOVERNOR_BACKOFF_TIERS || '60000,900000,offline').split(','),
    },
    agents: {
      orchestrator: process.env.DEFAULT_ORCHESTRATOR || 'orion',
      hardwareCheck: process.env.AGENT_SPAWN_HARDWARE_CHECK !== 'false',
      minFreeRamMb: parseInt(process.env.AGENT_SPAWN_MIN_FREE_RAM_MB || '512'),
      minFreeCpuPct: parseInt(process.env.AGENT_SPAWN_MIN_FREE_CPU_PCT || '20'),
    },
  };

  // Merge with YAML config if exists
  const configPath = join(ROOT, 'hiveclaw.config.yaml');
  if (existsSync(configPath)) {
    try {
      // YAML parsing would go here with a yaml library
      // For now, env vars are the primary config source
    } catch (_) { /* fallback to defaults */ }
  }

  return defaults;
}

const config = loadConfig();

// ---------------------------------------------------------------------------
// Express HTTP Server (serves HiveControl dashboard + API)
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Auth middleware (local trusted by default, X-API-Key for remote)
// ---------------------------------------------------------------------------
const auth = new Auth({
  apiKey: process.env.HIVECLAW_API_KEY || null,
  trustLocal: true,
});
app.use('/api/', auth.middleware());

// ---------------------------------------------------------------------------
// Governor middleware (3-tier circuit breaker for API budget protection)
// ---------------------------------------------------------------------------
let governor = null;
if (config.governor.enabled) {
  governor = new Governor({
    maxConcurrent: config.governor.maxConcurrent,
    minDelayMs: config.governor.minDelayMs,
    backoffTiers: config.governor.backoffTiers,
  });
  app.use(governor.middleware());
}

// ---------------------------------------------------------------------------
// HiveMem SQLite middleware (persistent memory, survives restarts)
// ---------------------------------------------------------------------------
let hivememMiddleware = null;
if (config.hivemem.enabled && config.hivemem.storage === 'sqlite') {
  try {
    hivememMiddleware = new HiveMemMiddleware({
      storage: 'sqlite',
      sqlitePath: config.hivemem.sqlitePath,
    });
    hivememMiddleware.initialize();
    console.log(`  [HiveMem] SQLite initialized at ${config.hivemem.sqlitePath}`);
  } catch (err) {
    console.warn(`  [HiveMem] SQLite init failed, falling back to in-memory: ${err.message}`);
    hivememMiddleware = null;
  }
}

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'hiveclaw-gateway',
    version: '1.0.0',
    uptime: process.uptime(),
    components: {
      gateway: 'running',
      hivecontrol: config.hivecontrol.enabled ? 'enabled' : 'disabled',
      hivemem: config.hivemem.enabled ? 'enabled' : 'disabled',
      hiveworkflow: config.hiveworkflow.enabled ? 'enabled' : 'disabled',
      governor: config.governor.enabled ? 'enabled' : 'disabled',
    },
  });
});

// HiveControl OS Dashboard
if (config.hivecontrol.enabled) {
  const dashPath = config.hivecontrol.path;
  const dashDir = join(ROOT, 'hivecontrol');

  if (existsSync(dashDir)) {
    app.use(dashPath, express.static(dashDir));
    console.log(`  [HiveControl] Dashboard serving at ${dashPath}`);
  }
}

// HiveMem API routes
if (config.hivemem.enabled) {
  const memRouter = express.Router();

  // Use SQLite middleware if available, otherwise fall back to in-memory Map
  const useSqlite = !!hivememMiddleware;

  memRouter.post('/memories', async (req, res) => {
    try {
      const { content, tags, metadata } = req.body;
      if (!content) return res.status(400).json({ error: 'content is required' });

      if (useSqlite) {
        const memory = hivememMiddleware.store(content, tags || [], metadata || {});
        return res.status(201).json(memory);
      }

      const id = crypto.randomUUID();
      const memory = { id, content, tags: tags || [], metadata: metadata || {}, created: new Date().toISOString() };
      memoryStore.set(id, memory);
      res.status(201).json(memory);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  memRouter.get('/memories', (req, res) => {
    try {
      const { q, tag, limit = 20 } = req.query;

      if (useSqlite) {
        const results = hivememMiddleware.search(q || '', { tag, limit: parseInt(limit) });
        return res.json({ memories: results, total: results.length });
      }

      let results = [...memoryStore.values()];
      if (q) {
        const query = q.toLowerCase();
        results = results.filter(m => m.content.toLowerCase().includes(query));
      }
      if (tag) {
        results = results.filter(m => m.tags && m.tags.includes(tag));
      }
      results = results
        .sort((a, b) => new Date(b.created) - new Date(a.created))
        .slice(0, parseInt(limit));

      res.json({ memories: results, total: results.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  memRouter.get('/memories/:id', (req, res) => {
    try {
      if (useSqlite) {
        const memory = hivememMiddleware.get(req.params.id);
        if (!memory) return res.status(404).json({ error: 'Memory not found' });
        return res.json(memory);
      }
      const memory = memoryStore.get(req.params.id);
      if (!memory) return res.status(404).json({ error: 'Memory not found' });
      res.json(memory);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  memRouter.put('/memories/:id', (req, res) => {
    try {
      if (useSqlite) {
        const updated = hivememMiddleware.update(req.params.id, req.body);
        if (!updated) return res.status(404).json({ error: 'Memory not found' });
        return res.json(updated);
      }
      const existing = memoryStore.get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Memory not found' });
      const updated = { ...existing, ...req.body, id: existing.id, updated: new Date().toISOString() };
      memoryStore.set(req.params.id, updated);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  memRouter.delete('/memories/:id', (req, res) => {
    try {
      if (useSqlite) {
        const deleted = hivememMiddleware.delete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Memory not found' });
        return res.json({ deleted: true });
      }
      if (!memoryStore.delete(req.params.id)) return res.status(404).json({ error: 'Memory not found' });
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  memRouter.get('/stats', (_req, res) => {
    res.json({
      totalMemories: useSqlite ? hivememMiddleware.count() : memoryStore.size,
      storageType: useSqlite ? 'sqlite' : 'memory',
      persistent: useSqlite,
      uptime: process.uptime(),
    });
  });

  app.use('/api/v1/hivemem', memRouter);
  console.log(`  [HiveMem] Memory API at /api/v1/hivemem (${useSqlite ? 'SQLite' : 'in-memory'})`);
}

// Agent status API
app.get('/api/v1/agents', (_req, res) => {
  res.json({
    orchestrator: config.agents.orchestrator,
    agents: agentRegistry,
    swarms: activeSwarms,
  });
});

app.post('/api/v1/agents/spawn', (req, res) => {
  const { agent, task } = req.body;
  if (!agent || !task) return res.status(400).json({ error: 'agent and task required' });

  const id = crypto.randomUUID();
  const spawn = {
    id,
    agent,
    task,
    status: 'spawned',
    spawnedAt: new Date().toISOString(),
  };
  activeSwarms.push(spawn);

  // Broadcast to WebSocket clients
  broadcast({ type: 'agent:spawned', payload: spawn });

  res.status(201).json(spawn);
});

// Workflow API
if (config.hiveworkflow.enabled) {
  app.post('/api/v1/workflows', (req, res) => {
    const { name, steps, trigger } = req.body;
    const id = crypto.randomUUID();
    const workflow = { id, name, steps: steps || [], trigger, status: 'created', createdAt: new Date().toISOString() };
    workflowRegistry.set(id, workflow);
    res.status(201).json(workflow);
  });

  app.get('/api/v1/workflows', (_req, res) => {
    res.json({ workflows: [...workflowRegistry.values()] });
  });

  app.post('/api/v1/workflows/:id/run', (req, res) => {
    const wf = workflowRegistry.get(req.params.id);
    if (!wf) return res.status(404).json({ error: 'Workflow not found' });
    wf.status = 'running';
    wf.startedAt = new Date().toISOString();
    broadcast({ type: 'workflow:started', payload: wf });
    res.json(wf);
  });

  console.log(`  [HiveWorkflow] Workflow API at /api/v1/workflows`);
}

// Governor status & reset
app.get('/api/v1/governor', (_req, res) => {
  res.json({
    enabled: config.governor.enabled,
    ...(governor ? governor.state : governorState),
  });
});

app.post('/api/v1/governor/reset', (_req, res) => {
  if (governor) {
    governor.reset();
    res.json({ status: 'reset', state: governor.state });
  } else {
    res.json({ status: 'governor not active', state: governorState });
  }
});

// ---------------------------------------------------------------------------
// WebSocket Server (real-time agent bus)
// ---------------------------------------------------------------------------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// In-memory stores
const memoryStore = new Map();
const agentRegistry = [
  { name: 'orion', role: 'Sentinel & Entry Point', status: 'ready' },
  { name: 'atlas', role: 'Code Analyzer', status: 'ready' },
  { name: 'forge', role: 'Builder & Deployer', status: 'ready' },
  { name: 'patch', role: 'Bug Fixer', status: 'ready' },
  { name: 'quill', role: 'Documentation Scribe', status: 'ready' },
  { name: 'cipher', role: 'Security Guardian', status: 'ready' },
  { name: 'pixel', role: 'UI/UX Artist', status: 'ready' },
  { name: 'spark', role: 'Performance Igniter', status: 'ready' },
];
const activeSwarms = [];
const workflowRegistry = new Map();
const governorState = {
  activeCalls: 0,
  totalCalls: 0,
  throttled: false,
  backoffTier: 0,
};

function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on('connection', (ws, req) => {
  const clientId = crypto.randomUUID().slice(0, 8);
  console.log(`  [WS] Client connected: ${clientId}`);

  // Send initial state
  ws.send(JSON.stringify({
    type: 'init',
    payload: {
      agents: agentRegistry,
      swarms: activeSwarms,
      governor: governorState,
      config: {
        hivecontrol: config.hivecontrol.enabled,
        hivemem: config.hivemem.enabled,
        hiveworkflow: config.hiveworkflow.enabled,
        governor: config.governor.enabled,
      },
    },
  }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'agent:status':
          ws.send(JSON.stringify({ type: 'agent:status', payload: agentRegistry }));
          break;

        case 'memory:search':
          const query = (msg.payload?.q || '').toLowerCase();
          const results = [...memoryStore.values()]
            .filter(m => m.content.toLowerCase().includes(query))
            .slice(0, 20);
          ws.send(JSON.stringify({ type: 'memory:results', payload: results }));
          break;

        case 'workflow:list':
          ws.send(JSON.stringify({ type: 'workflow:list', payload: [...workflowRegistry.values()] }));
          break;

        case 'governor:status':
          ws.send(JSON.stringify({ type: 'governor:status', payload: governorState }));
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          break;

        default:
          // Forward to all other clients (agent bus)
          broadcast(msg);
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    console.log(`  [WS] Client disconnected: ${clientId}`);
  });
});

// ---------------------------------------------------------------------------
// Heartbeat — periodic agent health broadcast
// ---------------------------------------------------------------------------
setInterval(() => {
  broadcast({
    type: 'heartbeat',
    ts: Date.now(),
    agents: agentRegistry.map(a => ({ name: a.name, status: a.status })),
    governor: { activeCalls: governorState.activeCalls, throttled: governorState.throttled },
    memory: { count: memoryStore.size },
    workflows: { active: [...workflowRegistry.values()].filter(w => w.status === 'running').length },
  });
}, 5000);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = config.gateway.port;
const HOST = config.gateway.host;

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ================================================================');
  console.log('  ');
  console.log('     H I V E C L A W   G A T E W A Y   v1.0.0');
  console.log('     by HivePowered.AI');
  console.log('  ');
  console.log('  ================================================================');
  console.log('');
  console.log(`  Gateway:       ws://${HOST}:${PORT}/ws`);
  console.log(`  Health:        http://${HOST}:${PORT}/health`);
  console.log(`  Agents API:    http://${HOST}:${PORT}/api/v1/agents`);

  if (config.hivecontrol.enabled)
    console.log(`  Dashboard:     http://${HOST}:${PORT}${config.hivecontrol.path}`);
  if (config.hivemem.enabled)
    console.log(`  Memory API:    http://${HOST}:${PORT}/api/v1/hivemem/memories`);
  if (config.hiveworkflow.enabled)
    console.log(`  Workflows:     http://${HOST}:${PORT}/api/v1/workflows`);
  if (config.governor.enabled)
    console.log(`  Governor:      http://${HOST}:${PORT}/api/v1/governor`);

  console.log('');
  console.log(`  Agents online: ${agentRegistry.length} (orchestrator: ${config.agents.orchestrator})`);
  console.log('');
});

export { app, server, wss, config };
