# HiveMem — Persistent Memory Skill

## Overview

This skill provides persistent memory capabilities to any HiveClaw agent.
Memories survive restarts, are shared across agents, and support keyword search.

## When to Use

- You need to remember something for future sessions
- You want to search for previously stored knowledge
- You need to share information between agents
- You're starting a new session and need context from previous work

## Tools

### memory_store
Store a new memory with optional tags.

```json
{
  "content": "The production deploy uses blue-green strategy with 5-minute canary window",
  "tags": ["devops", "deployment", "production"],
  "agent": "forge"
}
```

### memory_search
Search stored memories by keyword or tag.

```json
{
  "query": "deploy strategy",
  "tag": "devops",
  "limit": 10
}
```

### memory_get
Retrieve a specific memory by ID.

### memory_update
Update an existing memory's content or tags.

### memory_delete
Remove a memory that is no longer relevant.

## Best Practices

1. **Tag everything** — Use consistent tags for easy retrieval
2. **Be specific** — Store concrete facts, not vague summaries
3. **Include context** — Who, what, when, why
4. **Clean up** — Delete outdated memories to keep search relevant
5. **Agent attribution** — Always include which agent stored the memory

## Storage Backends

- **SQLite** (default) — Zero-config local storage
- **TiDB Cloud** — Cloud-persistent with vector search (configure in `.env`)

## API Endpoint

`http://localhost:18789/api/v1/hivemem/memories`

## CLI

```bash
hiveclaw memory search "query"
hiveclaw memory stats
hiveclaw memory store "content"
```
