# HiveMem — Persistent Memory for HiveClaw

HiveMem gives your agent swarm a **shared, persistent memory** that survives restarts, spans sessions, and enables cross-agent knowledge sharing. Inspired by [mem9](https://github.com/mem9-ai/mem9), rebuilt for zero-config local-first operation.

## How It Works

By default, HiveMem uses a **SQLite database** stored locally — no cloud services, no external dependencies. Just install HiveClaw and memories persist automatically.

When you're ready to scale, switch to an external **mem9-compatible server** backed by TiDB for cloud-persistent, multi-tenant memory with vector search.

## Architecture

```
Agent (Orion, Atlas, Forge...)
  |
  v
HiveMem Plugin (gateway/plugins/hivemem.js)
  |
  v
HiveMem API (gateway → /api/v1/hivemem/*)
  |
  v
Storage Backend
  ├── SQLite (default, local, zero-config)
  └── mem9/TiDB (optional, cloud, vector search)
```

## API

All endpoints live under `/api/v1/hivemem`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/memories` | Store a new memory |
| GET | `/memories` | Search memories (`?q=query&tag=tag&limit=20`) |
| GET | `/memories/:id` | Get a specific memory |
| PUT | `/memories/:id` | Update a memory |
| DELETE | `/memories/:id` | Delete a memory |
| GET | `/stats` | Memory store statistics |

## Agent Tools

When running inside the OpenClaw agent runtime, these tools are available to all agents:

- `memory_store` — Save a memory with content and tags
- `memory_search` — Search by keyword or tag
- `memory_get` — Retrieve by ID
- `memory_update` — Update existing memory
- `memory_delete` — Remove a memory

## CLI

```bash
hiveclaw memory search "project decisions"
hiveclaw memory stats
hiveclaw memory store "The deployment uses blue-green strategy"
```

## Upgrading to Cloud Memory

To switch from local SQLite to cloud-persistent TiDB:

1. Sign up at [TiDB Cloud Starter](https://tidbcloud.com) (free tier: 25GB)
2. Update `.env`:
   ```
   HIVEMEM_STORAGE=tidb
   HIVEMEM_DSN=mysql://user:pass@host:4000/hivemem
   ```
3. Restart HiveClaw

Your existing memories stay in the local SQLite. New memories go to TiDB.
