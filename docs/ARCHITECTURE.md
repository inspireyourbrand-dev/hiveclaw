# HiveClaw Architecture

Overview of HiveClaw's system design, data flow, agent communication patterns, and screen routing.

---

## System Overview

HiveClaw is a **distributed agent orchestration platform** with three core layers:

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (Client)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  HiveControl UI (8 Screens)                           │  │
│  │  - Dashboard, Monitor, Agents, Resources, etc.       │  │
│  │  - Responsive HTML/CSS/JS                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                  │
│                      ws-client.js                            │
│                            │                                  │
└────────────────┬───────────┴───────────────────┬────────────┘
                 │                               │
                 │  WebSocket (Binary)          │
                 │  ↔ Duplex               HTTP (Assets)
                 │                              │
┌────────────────▼───────────────────────────────▼────────────┐
│                 OpenClaw Gateway (Node.js)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  WebSocket Server (port 3001)                        │  │
│  │  - Routes messages to agents                          │  │
│  │  - Maintains agent registry                           │  │
│  │  - Handles reconnection                               │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  HTTP Server (port 3000)                             │  │
│  │  - Serves HiveControl UI assets                       │  │
│  │  - Static file serving                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                  │
│    ┌───────────────────────┼───────────────────────┐        │
│    │                       │                       │        │
└────┼───────────────────────┼───────────────────────┼────────┘
     │                       │                       │
     ▼                       ▼                       ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Agent 1    │  │   Agent 2    │  │   Agent N    │
│  fetch-logs  │  │analyze-metrics│  │  deploy...  │
│              │  │              │  │              │
│ handler.js   │  │ handler.js   │  │ handler.js   │
└──────────────┘  └──────────────┘  └──────────────┘
     │                   │                   │
     └───────────────────┼───────────────────┘
                         │
                    External APIs
                    (Logging, Metrics,
                     Deployment Targets)
```

---

## Core Components

### 1. Browser Client (HiveControl UI)

**Location**: `screens/`, `index.html`, `ws-client.js`

**Responsibility**: Render UI and communicate with gateway

**Key Files**:
- `index.html` - Entry point, loads screens
- `ws-client.js` - WebSocket client, message routing
- `screens/dashboard.html` - Main dashboard
- `screens/monitor.html` - System monitoring
- `screens/agents.html` - Agent management
- `screens/resources.html` - Resource allocation
- `screens/logs.html` - Log viewer
- `screens/settings.html` - Configuration
- `screens/help.html` - Documentation
- `screens/about.html` - About/credits

**Responsibilities**:
- Display screens based on URL fragment
- Initialize WebSocket connection
- Send commands to agents
- Display real-time updates from agents
- Handle disconnection gracefully

### 2. OpenClaw Gateway

**Location**: `upstream/` (soft fork of OpenClaw)

**Responsibility**: Message routing, agent discovery, protocol handling

**Key Components**:
- **WebSocket Server** (port 3001)
  - Accepts connections from browser clients
  - Routes messages between client and agents
  - Maintains agent registry
  - Handles heartbeats and reconnection

- **HTTP Server** (port 3000)
  - Serves HiveControl UI assets from `gateway/serve/`
  - Serves static files (CSS, JS, images)
  - Returns 404 for unknown routes (SPA fallback)

- **Message Protocol**
  - Binary WebSocket messages
  - Agent discovery protocol
  - Request/response correlation

### 3. Agent Workers

**Location**: `agents/workspace/active/*/handler.js`

**Responsibility**: Execute tasks, return results

**Structure**:
```
agents/workspace/active/
├── fetch-logs/
│   ├── agent.json          # Manifest: name, version, inputs/outputs
│   ├── handler.js          # Main execution logic
│   ├── config.json         # Agent configuration
│   └── README.md
├── analyze-metrics/
├── deploy-service/
└── [more agents...]
```

**Agent Execution Flow**:
```
Client → Gateway → Agent Registry → handler.js
  │                                     │
  │ Request w/ inputs                  │
  │─────────────────────────────────→  │
  │                                   [Work]
  │ Response w/ outputs               │
  │←─────────────────────────────────  │
```

---

## Data Flow

### Scenario: Client Requests Agent Action

```
1. USER INTERACTION
   [Browser] Dashboard screen
   └─ Click "Fetch Logs" button
      └─ Triggers: ws.send('fetch-logs', { limit: 100 })

2. CLIENT → GATEWAY (WebSocket)
   ws-client.js constructs message:
   {
     "id": "req-123456",
     "agent": "fetch-logs",
     "action": "execute",
     "inputs": { "limit": 100 },
     "timeout": 30000
   }

3. GATEWAY PROCESSES
   OpenClaw WebSocket server receives message
   └─ Look up "fetch-logs" in agent registry
      └─ Create execution context
         └─ Call agent handler

4. AGENT EXECUTES
   handler.js:execute(inputs, context)
   ├─ Parse inputs: { limit: 100 }
   ├─ Do work: fetch logs from storage
   ├─ Return result: { success: true, logs: [...], count: 42 }
   └─ Send response back via context

5. GATEWAY → CLIENT (WebSocket)
   {
     "id": "req-123456",
     "agent": "fetch-logs",
     "action": "response",
     "status": "success",
     "outputs": {
       "success": true,
       "logs": [...],
       "count": 42
     },
     "timestamp": "2026-03-29T14:30:00Z"
   }

6. CLIENT DISPLAYS RESULT
   ws-client.js matches response ID to pending request
   └─ Call callback: onSuccess({ logs, count })
      └─ Update dashboard UI
         └─ Render 42 logs in log viewer
```

### Example: Real-Time Monitoring

```
OpenClaw Gateway (Interval: every 5s)
   └─ Check system metrics
      └─ Broadcast to all connected clients
         {
           "type": "metric-update",
           "cpu": 45.2,
           "memory": 72.1,
           "activeAgents": 3
         }

Browser Client (All connected)
   └─ ws-client.js receives broadcast
      └─ Update dashboard in real-time
         └─ No user action needed
```

---

## Agent Hierarchy & Discovery

### Agent Registry

OpenClaw maintains an in-memory registry:

```javascript
{
  "fetch-logs": {
    "version": "1.0.0",
    "handler": <Function>,
    "manifest": {
      "description": "Fetch recent logs",
      "inputs": { "limit": "number" },
      "outputs": { "logs": "array" },
      "timeout": 30000
    }
  },
  "analyze-metrics": { ... },
  "deploy-service": { ... }
}
```

### Agent Lookup

```
Client sends: { agent: "fetch-logs", ... }
     │
     ▼
Gateway looks up "fetch-logs"
     │
     ├─ Found? → Execute handler
     │
     └─ Not found? → Return 404 error
```

### Hierarchical Agent Organization

Agents can be organized by capability:

```
agents/workspace/
├── active/
│   ├── system-agents/
│   │   ├── fetch-logs/
│   │   ├── analyze-metrics/
│   │   └── ping-gateway/
│   ├── deployment-agents/
│   │   ├── deploy-service/
│   │   ├── rollback-release/
│   │   └── scale-up/
│   └── integration-agents/
│       ├── sync-database/
│       ├── push-to-slack/
│       └── create-incident/
├── archived/
│   └── [old agents, not loaded]
└── templates/
    └── [agent templates for creation]
```

The gateway loads all agents from `agents/workspace/active/**/handler.js`.

---

## Screen Routing

### Navigation Flow

```
Browser URL Fragment (#)
     │
     ├─ /#/ or /#/dashboard → dashboard.html
     ├─ /#/monitor → monitor.html
     ├─ /#/agents → agents.html
     ├─ /#/resources → resources.html
     ├─ /#/logs → logs.html
     ├─ /#/settings → settings.html
     ├─ /#/help → help.html
     └─ /#/about → about.html

index.html:
   window.addEventListener('hashchange', () => {
     const screen = location.hash.slice(2) || 'dashboard';
     load(screen + '.html');
   })
```

### Screen Structure

Each screen follows this template:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Screen Name - HiveControl</title>
  <link rel="stylesheet" href="/branding/hivepowered-theme.css">
</head>
<body>
  <nav id="sidebar">
    <a href="#/dashboard">Dashboard</a>
    <a href="#/monitor">Monitor</a>
    <!-- More links -->
  </nav>

  <main id="content">
    <!-- Screen content -->
  </main>

  <script>
    // Screen-specific logic
    // Communicates via ws-client.js
  </script>
</body>
</html>
```

### Cross-Screen Communication

Screens communicate through shared `ws-client.js`:

```javascript
// dashboard.html
ws.on('fetch-logs', async () => {
  const result = await ws.send('fetch-logs', { limit: 50 });
  display(result.logs);
});

// monitor.html listens to the same events
ws.on('metric-update', (data) => {
  updateChart(data);
});
```

---

## Communication Protocol

### Message Structure

All messages are JSON:

```json
{
  "id": "req-12345678",
  "type": "request|response|event|broadcast",
  "agent": "agent-name",
  "action": "execute|subscribe|unsubscribe",
  "inputs": { "param": "value" },
  "outputs": {},
  "status": "pending|success|error",
  "timestamp": "2026-03-29T14:30:00Z",
  "error": null
}
```

### Request → Response

```
Client Request:
{
  "id": "req-abc123",
  "type": "request",
  "agent": "fetch-logs",
  "action": "execute",
  "inputs": { "limit": 100 },
  "timestamp": "2026-03-29T14:30:00Z"
}

Agent Response:
{
  "id": "req-abc123",
  "type": "response",
  "agent": "fetch-logs",
  "status": "success",
  "outputs": { "logs": [...], "count": 42 },
  "timestamp": "2026-03-29T14:30:01Z"
}
```

### Broadcast Events

```
Gateway → All Clients:
{
  "type": "broadcast",
  "event": "agent-state-changed",
  "data": {
    "agent": "fetch-logs",
    "state": "idle",
    "lastRun": "2026-03-29T14:30:00Z"
  }
}
```

---

## Error Handling

### Agent Errors

```
Client sends request
     │
     ▼
Agent throws: throw new Error("Connection timeout")
     │
     ▼
Gateway catches error
     │
     ▼
Returns to client:
{
  "id": "req-abc123",
  "status": "error",
  "error": {
    "message": "Connection timeout",
    "code": "TIMEOUT",
    "retryable": true
  }
}
     │
     ▼
Client handles:
- If retryable: Retry with backoff
- If not: Show error to user
```

### Connection Loss

```
Client ↔ Gateway (Connected)
     │
     └─ Network fails
        │
        ├─ ws-client.js detects disconnect
        │
        ├─ Pause sending
        │
        ├─ Attempt reconnect (exponential backoff)
        │   - Try 1: 100ms
        │   - Try 2: 200ms
        │   - Try 3: 400ms
        │   - Try 10: 30s (max)
        │
        ├─ On success: Resume sending pending requests
        │
        └─ On failure (after 10 retries): Show "Disconnected" to user
```

---

## Deployment Architecture

### Development

```
localhost:3000 → HiveControl UI (from gateway/serve/)
localhost:3001 → WebSocket Server
                ↓
           Agents in agents/workspace/active/
```

### Production

```
[Load Balancer]
     │
     ├─ gateway-1 (Node.js)
     ├─ gateway-2 (Node.js)
     └─ gateway-N (Node.js)
         │
         └─ [Shared Agent Storage]
             (agents/workspace/ synced across instances)

Clients → Any Gateway Instance (via load balancer)
```

Agent registry must be synchronized across gateway instances (via shared filesystem or sync service).

---

## Configuration

### hiveclaw.config.json

```json
{
  "gateway": {
    "host": "0.0.0.0",
    "port": 3000,
    "wsPort": 3001,
    "serve": "./gateway/serve"
  },
  "agents": {
    "workspace": "./agents/workspace",
    "defaultConfig": {
      "timeout": 30000,
      "retries": 3,
      "logLevel": "info"
    }
  },
  "features": {
    "enableTypeScript": true,
    "enableESLint": false
  }
}
```

### Environment Variables

```bash
# .env or shell environment
HIVE_PORT=3000              # Override gateway port
HIVE_WS_PORT=3001           # Override WebSocket port
HIVE_AGENTS_PATH=./agents   # Override agents directory
HIVE_LOG_LEVEL=debug        # Set log level
```

---

## Performance Considerations

### Message Throughput

- **Typical latency**: 10-100ms (agent execution time varies)
- **Concurrent agents**: Limited by Node.js event loop
- **Connection pool**: Unlimited (limited by memory)

### Optimization Strategies

1. **Batch requests** instead of individual messages
   ```javascript
   // Bad: 100 individual requests
   for (const id of ids) {
     await ws.send('fetch-log', { id });
   }

   // Good: One batch request
   await ws.send('fetch-logs-batch', { ids });
   ```

2. **Subscribe to broadcasts** instead of polling
   ```javascript
   // Bad: Poll every 5 seconds
   setInterval(() => ws.send('get-status'), 5000);

   // Good: Listen to broadcast
   ws.on('status-update', (status) => display(status));
   ```

3. **Cache results** in client
   ```javascript
   const cache = new Map();
   async function getMetrics() {
     if (cache.has('metrics')) return cache.get('metrics');
     const data = await ws.send('get-metrics');
     cache.set('metrics', data);
     return data;
   }
   ```

---

## Testing Architecture

### Unit Tests
- Test agent handlers independently
- Mock WebSocket context
- Verify input/output contracts

### Integration Tests
- Test gateway message routing
- Test client ↔ gateway communication
- Verify screen rendering

### E2E Tests
- Run full system (browser, gateway, agents)
- Test user workflows
- Verify real-time updates

---

## Security Considerations

### WebSocket Authentication

- OpenClaw handles authentication (not in this diagram)
- Each connection must authenticate before sending requests

### Agent Isolation

- Agents run in the same process (no isolation)
- Consider separate gateway instances for untrusted agents
- Implement resource limits per agent (timeout, memory)

### Message Validation

- Gateway validates agent names before routing
- Agents should validate inputs
- Client should validate outputs

---

## Scaling Considerations

### Horizontal Scaling

```
[Multiple Gateway Instances]
    ↓
[Load Balancer]
    ↓
[Shared Agent Storage]
```

Each gateway instance:
- Loads agents from shared storage
- Syncs agent registry
- Communicates with same agent pool

### Vertical Scaling

Optimize single gateway instance:
- Increase Node.js thread pool
- Use clustering (node cluster module)
- Optimize agent handlers

---

## Summary Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    HiveControl UI                        │
│  (8 Screens + ws-client.js)                             │
└────────────────────────┬────────────────────────────────┘
                         │ WebSocket (JSON)
                         │
┌────────────────────────▼────────────────────────────────┐
│            OpenClaw Gateway (upstream/)                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │ WebSocket Server + HTTP Server                  │  │
│  │ Message Router + Agent Registry                 │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                    ┌────┴────┬─────────┬──────┐
                    │          │         │      │
         ┌──────────▼─┐ ┌─────▼──┐ ┌───▼─┐ ┌─▼────┐
         │ Agent 1    │ │ Agent 2│ │ ... │ │Agent N│
         │            │ │        │ │     │ │      │
         │ handler.js │ │handler │ │     │ │      │
         └────────────┘ └────────┘ └─────┘ └──────┘
```

For detailed implementation, see code in respective directories.
