# Playbook: Incident Recovery

## Overview
This playbook provides step-by-step recovery procedures for critical HiveControl incidents: gateway crash, API limit breach, agent stuck in loop, and data corruption. Use this playbook to diagnose issues and restore system stability with minimal downtime.

---

## Incident Type 1: Gateway Crash

### Symptoms
- All agents unable to connect
- WebSocket disconnections for all clients
- Dashboard shows "Gateway Offline"
- Network requests timeout

### 1.1 Immediate Assessment (2 minutes)

**Check gateway process:**
```bash
ps aux | grep hivecontrol-gateway
# Should see: hivecontrol-gateway process running
```

If process running:
→ Move to 1.2 (Gateway Unresponsive)

If process NOT running:
→ Move to 1.3 (Gateway Restart)

**Check logs:**
```bash
tail -100 /var/log/hivecontrol/gateway.log
# Look for: crash messages, out of memory, segfaults
```

**Check system resources:**
```bash
free -h  # Memory available?
df -h   # Disk space available?
ps aux | grep -E "hivecontrol|node" # High CPU?
```

Document findings in incident log:
```
incident:gateway-crash:{timestamp}
{
  "time_detected": now,
  "process_running": true|false,
  "recent_logs": [...],
  "system_resources": { memory, disk, cpu }
}
```

### 1.2 Gateway Unresponsive (still running)

**Attempt graceful restart:**
```bash
# Send shutdown signal to gateway
kill -TERM $(pgrep hivecontrol-gateway)
# Wait 10 seconds for graceful shutdown
sleep 10

# Verify shutdown
ps aux | grep hivecontrol-gateway
# Should see: no process

# Restart gateway
systemctl start hivecontrol-gateway
# OR: /opt/hivecontrol/start-gateway.sh

# Verify startup
sleep 5
ps aux | grep hivecontrol-gateway
curl -s http://localhost:8080/health | jq .
# Should see: {"status": "operational"}
```

If restart successful:
→ Move to 1.4 (Reconnect Agents)

If restart fails:
→ Move to 1.3 (Force Restart)

### 1.3 Force Restart

**If graceful restart failed:**
```bash
# Kill all hivecontrol processes
pkill -9 hivecontrol-gateway
pkill -9 hivecontrol-agent

# Wait for cleanup
sleep 5

# Check memory and ports
lsof -i :8080  # Should be empty now
free -h

# If memory critically low, reboot system
reboot

# After system stabilizes (or if memory OK):
systemctl start hivecontrol-gateway
sleep 10

# Verify with health check
curl -s http://localhost:8080/health
```

### 1.4 Reconnect Agents

Once gateway is operational:

```javascript
// Each agent reconnects to gateway
const reconnect = async () => {
  const maxRetries = 5;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const connection = await gateway.connect({
        agent_id: currentAgentId,
        timeout: 5000
      });
      console.log("Reconnected to gateway");
      return connection;
    } catch (err) {
      console.warn(`Reconnect attempt ${attempt}/${maxRetries} failed`);
      if (attempt < maxRetries) {
        await wait(retryDelay * attempt); // Exponential backoff
      }
    }
  }

  throw new Error("Failed to reconnect after max retries");
};

await reconnect();
```

### 1.5 Verify Recovery

**Check all screens:**
- Dashboard: loads and displays status
- Workflow: can create and list workflows
- Agent Board: shows all agents connected
- Memory Explorer: can query memory
- Settings: accessible

**Check agent state:**
```javascript
// Each agent self-checks
const agentHealth = await memory.get(`agents:${currentAgentId}:status`);
// Should show: "ready" or "idle"

// Queue any work that was lost
const lostWork = await memory.get(`workflow:in-progress`);
if (lostWork) {
  console.log(`Resuming ${lostWork.length} interrupted workflows`);
  // Resume execution
}
```

**Document recovery:**
```
incident:gateway-crash:{timestamp}
{
  ...assessment data...,
  "recovery_actions": [
    { action: "graceful_restart", status: "failed|success", time: "..." },
    { action: "force_restart", status: "success", time: "..." },
    { action: "agent_reconnect", agents_reconnected: 5, status: "success" }
  ],
  "total_downtime_seconds": 180,
  "workflows_interrupted": 2,
  "workflows_resumed": 2,
  "data_lost": false,
  "recovered_by": "system|manual",
  "time_recovered": now
}
```

---

## Incident Type 2: API Limit Breach

### Symptoms
- Requests return HTTP 429 (Too Many Requests)
- API responses include "Rate Limit Exceeded" message
- Governor Mode shows "API budget exceeded"
- New API calls immediately fail
- Cached responses being served

### 2.1 Immediate Assessment (2 minutes)

**Check current budget state:**
```javascript
const budget = await memory.get('api-budget-state');
console.log({
  usage_percent: budget.percentUsed,
  calls_made_today: budget.callsMadeToday,
  daily_limit: budget.dailyLimit,
  reset_time: budget.resetTime,
  time_until_reset: new Date(budget.resetTime) - Date.now()
});
```

**Check which API(s) are rate limited:**
```javascript
const apiMetrics = await memory.get('api-metrics');
for (const [api, metrics] of Object.entries(apiMetrics)) {
  console.log(`${api}: ${metrics.callsToday}/${metrics.dailyLimit}`);
}
```

**Document the incident:**
```
incident:api-limit:{timestamp}
{
  "time_detected": now,
  "budget_usage_percent": 98,
  "calls_made": 4950,
  "daily_limit": 5000,
  "time_until_reset": "12 hours",
  "affected_apis": ["openai", "stripe", "google-maps"],
  "active_workflows": 3,
  "queued_requests": 12
}
```

### 2.2 Enable Offline Mode

Immediately enter offline execution to prevent further API calls:

```javascript
// Set Governor Mode to offline
await memory.put('governor-mode:state', 'offline');
await memory.put('governor-mode:offline-reason', {
  reason: 'api_budget_exhausted',
  budget_reset_time: resetTime,
  detected_at: now
});

// Alert dashboard
await memory.put('alerts:critical', {
  type: 'api_limit_breach',
  message: 'API budget exhausted, offline mode active',
  action_required: true
});

console.log('Offline mode enabled. No new external API calls will be made.');
```

### 2.3 Graceful Degradation

Notify all active agents to switch to local processing:

```javascript
// Broadcast to all agents
const agents = await memory.get('agents:active');
for (const agentId of agents) {
  await memory.put(`agent:${agentId}:directive`, {
    type: 'switch_to_offline',
    reason: 'api_budget_exhausted',
    timeout: resetTime,
    instructions: [
      'Stop queuing external API calls',
      'Use cached data if available',
      'Use local heuristics and approximations',
      'Complete what you can locally',
      'Mark remaining work as deferred'
    ]
  });
}

// Log directive execution
const offlineResults = await memory.get('workflow:offline-completion');
for (const [agentId, result] of Object.entries(offlineResults)) {
  console.log(`Agent ${agentId}:`);
  console.log(`  - Completed locally: ${result.completed.length}`);
  console.log(`  - Deferred: ${result.deferred.length}`);
}
```

### 2.4 Pause Non-Critical Work

Identify and pause workflows that are not critical:

```javascript
const workflows = await memory.get('workflow:active');

for (const workflow of workflows) {
  const priority = workflow.priority || 'normal'; // low, normal, high, critical

  if (priority === 'low' || priority === 'normal') {
    // Pause workflow
    await memory.put(`workflow:${workflow.id}:status`, 'paused');
    await memory.put(`workflow:${workflow.id}:pause_reason`, 'api_limit_breach');
    console.log(`Paused: ${workflow.name} (priority: ${priority})`);
  }
}
```

### 2.5 Assess API Billing Options

**Check if quota increase is available:**
- Contact API provider (OpenAI, Stripe, etc.)
- Request temporary quota increase (emergency)
- Some providers allow instant increases for paying customers
- Cost: May have premium surcharge

**Check if budget can be reallocated:**
- Do we have monthly budget remaining?
- Can non-critical services be disabled to free up quota?
- Trade-offs: Which features are least critical?

**Document decision:**
```
incident:api-limit:{timestamp}
{
  ...assessment data...,
  "mitigation_strategy": "offline_mode | quota_increase | budget_reallocation",
  "quota_increase_requested": true|false,
  "quota_increase_amount": 1000,
  "estimated_cost": "$50",
  "budget_reallocation": ["service-x", "service-y"],
  "approval_obtained": true|false,
  "approved_by": "team-lead"
}
```

### 2.6 Wait for Reset

Once API limit reset occurs (typically daily):

```javascript
// Monitor reset time
const resetTime = await memory.get('api-budget-state').resetTime;

const waitForReset = async () => {
  const now = Date.now();
  const waitTime = new Date(resetTime) - now;

  console.log(`Waiting ${Math.round(waitTime / 1000 / 60)} minutes for API reset...`);

  await new Promise(resolve => setTimeout(resolve, waitTime));

  // Verify reset occurred
  const newBudget = await memory.get('api-budget-state');
  if (newBudget.percentUsed < 10) {
    console.log('API budget reset successfully');
    return true;
  } else {
    console.warn('API budget did not reset as expected');
    return false;
  }
};

await waitForReset();
```

### 2.7 Resume Operations

Exit offline mode and resume normal operation:

```javascript
// Disable offline mode
await memory.put('governor-mode:state', 'normal');
console.log('Governor Mode: Offline → Normal');

// Resume paused workflows
const pausedWorkflows = await memory.get('workflow:paused-by-incident');
for (const workflowId of pausedWorkflows) {
  await memory.put(`workflow:${workflowId}:status`, 'resumed');
  console.log(`Resumed: ${workflowId}`);
}

// Process deferred requests
const deferredRequests = await memory.get('api:deferred-requests');
console.log(`Processing ${deferredRequests.length} deferred requests`);

// Gradually resume (don't spike immediately)
for (const request of deferredRequests) {
  await processRequest(request);
  await wait(1000); // 1 second between requests
}

console.log('All operations resumed');
```

---

## Incident Type 3: Agent Stuck in Loop

### Symptoms
- Agent CPU usage at 100% for extended period
- Same error message repeated in logs
- Agent not making progress on task
- Watchdog timer triggers repeatedly
- Memory usage stable (not growing)

### 3.1 Immediate Detection (1 minute)

**Watchdog detection:**
```javascript
// Watchdog monitors for looping agents
const checkForLoops = async () => {
  const agents = await memory.get('agents:active');

  for (const agentId of agents) {
    const metrics = await memory.get(`agent:${agentId}:metrics`);
    const logs = await memory.get(`agent:${agentId}:logs:recent`);

    // Check: CPU high, memory stable, same error repeating
    if (metrics.cpu_percent > 90 && metrics.memory_mb < (metrics.memory_baseline * 1.1)) {
      // Check if error repeating
      const errors = logs
        .filter(l => l.level === 'error')
        .slice(-10)
        .map(l => l.message);

      const uniqueErrors = new Set(errors);
      if (uniqueErrors.size <= 2) {
        // Same error repeating → likely a loop
        return {
          detected: true,
          agentId,
          repeatingError: errors[0],
          errorCount: errors.length
        };
      }
    }
  }

  return { detected: false };
};
```

**Document incident:**
```
incident:agent-loop:{timestamp}
{
  "time_detected": now,
  "agent_id": "agent-12345",
  "cpu_percent": 98,
  "memory_mb": 256,
  "memory_baseline_mb": 240,
  "last_n_errors": ["error message", "error message", "error message"],
  "loop_duration_seconds": 120,
  "current_task": "process_batch"
}
```

### 3.2 Diagnose Root Cause

**Inspect agent logs:**
```javascript
const logs = await memory.get(`agent:${agentId}:logs`);
// Print last 50 lines to identify pattern
for (const log of logs.slice(-50)) {
  console.log(`[${log.timestamp}] ${log.level}: ${log.message}`);
}
```

**Common causes:**
| Cause | Signal | Fix |
|---|---|---|
| Infinite retry loop | "Retry #X" increasing | 3.3 Force Stop |
| Deadlock on resource | Same log line repeating | 3.3 Force Stop |
| Bad conditional logic | Same two log lines alternating | 3.3 Force Stop + Code Fix |
| Memory limit too low | Memory near baseline but error "out of memory" | 3.4 Increase Resources |
| Tool timeout causing retry | "Tool X timeout, retrying" | 3.3 Force Stop + Investigate Tool |

### 3.3 Force Stop Agent

Gracefully terminate the looping agent:

```javascript
// Send termination signal
await gateway.send({
  type: 'agent:terminate',
  agent_id: agentId,
  signal: 'SIGTERM', // Graceful
  timeout: 5000
});

// If graceful fails, force kill
setTimeout(async () => {
  const still_running = await memory.get(`agent:${agentId}:status`);
  if (still_running !== 'terminated') {
    await gateway.send({
      type: 'agent:terminate',
      agent_id: agentId,
      signal: 'SIGKILL', // Force
      timeout: 1000
    });
  }
}, 5000);

console.log(`Termination signal sent to ${agentId}`);
```

### 3.4 Investigate and Decide

**Review the task the agent was running:**
```javascript
const task = await memory.get(`workflow:${workflow_id}:current_task`);
console.log({
  task_name: task.name,
  input: task.input,
  expected_output: task.expected_output,
  retry_count: task.retry_count,
  last_error: task.last_error
});
```

**Decide path forward:**

Option A: **Retry with same agent (if root cause fixed)**
```javascript
// Spawn replacement agent with same task
const newAgent = await spawnAgent({
  task_name: task.name,
  inputs: task.input,
  timeout_seconds: Math.min(task.timeout * 2, 600), // Increase timeout
  // ... rest of config
});
```

Option B: **Skip task and continue workflow**
```javascript
// Mark task as failed, continue
await memory.put(`workflow:${workflow_id}:task_status`, 'skipped');
await memory.put(`workflow:${workflow_id}:next_task_index`, task_index + 1);
console.log(`Skipped task "${task.name}", continuing workflow`);
```

Option C: **Manual intervention required**
```javascript
// Escalate to human
await memory.put(`alerts:critical`, {
  type: 'agent_loop_unresolved',
  message: `Agent ${agentId} stuck in loop. Manual intervention required.`,
  task_name: task.name,
  error: task.last_error,
  action_required: true
});
console.log('Escalated to human operator');
```

---

## Incident Type 4: Data Corruption

### Symptoms
- Memory read/write mismatch
- Data validation fails (schema violations)
- Workflow produces invalid results
- Hash/checksum verification fails
- Inconsistent data across memory backups

### 4.1 Detection and Assessment (5 minutes)

**Automated corruption detection:**
```javascript
// Memory system periodically verifies integrity
const detectCorruption = async () => {
  const keys = await memory.list('*');
  const corruptions = [];

  for (const key of keys) {
    // Read data twice, verify consistency
    const read1 = await memory.get(key);
    const read2 = await memory.get(key);

    if (JSON.stringify(read1) !== JSON.stringify(read2)) {
      corruptions.push({
        key,
        reason: 'read_mismatch',
        read1_hash: hash(read1),
        read2_hash: hash(read2)
      });
    }

    // Verify schema if available
    const schema = await memory.get(`_schema:${key}`);
    if (schema && !validateSchema(read1, schema)) {
      corruptions.push({
        key,
        reason: 'schema_violation',
        actual_type: typeof read1,
        expected_schema: schema
      });
    }
  }

  return corruptions;
};

const corruptions = await detectCorruption();
if (corruptions.length > 0) {
  console.error(`Corruption detected in ${corruptions.length} keys`);
  return corruptions;
}
```

**Document incident:**
```
incident:data-corruption:{timestamp}
{
  "time_detected": now,
  "corruption_type": "read_mismatch | schema_violation | hash_mismatch",
  "affected_keys": ["key1", "key2"],
  "corrupted_data": {...},
  "memory_backup_available": true|false,
  "backup_timestamp": "...",
  "scope_of_damage": "estimate affected workflows"
}
```

### 4.2 Quarantine Corrupted Data

Prevent further use of bad data:

```javascript
// Move corrupted keys to quarantine
for (const corruption of corruptions) {
  const key = corruption.key;
  const corrupted_value = await memory.get(key);

  // Backup corrupted data for analysis
  await memory.put(`quarantine:${timestamp}:${key}`, {
    corrupted_value,
    corruption_reason: corruption.reason,
    detected_at: now
  });

  // Delete or mark invalid
  await memory.delete(key);
  console.log(`Quarantined: ${key}`);
}

// Alert system
await memory.put(`alerts:critical`, {
  type: 'data_corruption',
  message: `Corrupted data quarantined. ${corruptions.length} keys affected.`,
  action_required: true
});
```

### 4.3 Restore from Backup

If memory backup available:

```javascript
// Check backup freshness
const backup = await memory.getBackup('latest');
const backup_age = (Date.now() - new Date(backup.timestamp)) / 1000 / 60;

console.log(`Latest backup: ${backup_age.toFixed(0)} minutes old`);

if (backup_age < 60) {
  // Recent backup, safe to restore
  console.log('Restoring from backup...');

  for (const [key, value] of Object.entries(backup.data)) {
    if (corruptions.find(c => c.key === key)) {
      // Only restore corrupted keys
      await memory.put(key, value);
      console.log(`Restored: ${key}`);
    }
  }

  console.log('Restore complete');
} else {
  // Old backup, may have stale data
  console.warn(`Backup is ${backup_age} minutes old. Stale data possible.`);
  // Manual review required
}
```

### 4.4 Manual Data Repair

If corruption widespread or backup unavailable:

```javascript
// Identify which workflows/agents produced corrupted data
const affectedWorkflows = await memory.list('workflow:*');
const affectedAgents = await memory.list('agent:*');

// For each corrupted key, trace origin
for (const corruption of corruptions) {
  const traces = await memory.get(`trace:${corruption.key}`);
  console.log(`${corruption.key} created by: ${traces.created_by}`);
  console.log(`${corruption.key} modified by: ${traces.last_modified_by}`);
}

// Decide: Regenerate? Approximate? Mark invalid?
// Example: If a workflow result is corrupted, mark it invalid and re-run workflow
```

### 4.5 Prevent Recurrence

After recovery, identify root cause:

**Common causes:**
| Cause | Prevention |
|---|---|
| Concurrent writes without locking | Implement write locks |
| Memory system bug | Update memory system, test thoroughly |
| Bit flip (hardware issue) | Check system RAM health, enable ECC memory |
| Unvalidated external input | Add input validation at all entry points |
| Code bug writing invalid data | Add unit tests, schema validation on write |

**Example prevention:**
```javascript
// Add write-time validation
const safeWrite = async (key, value) => {
  // Validate against schema
  const schema = await memory.get(`_schema:${key}`);
  if (schema && !validateSchema(value, schema)) {
    throw new Error(`Invalid write to ${key}: schema violation`);
  }

  // Write with checksum
  await memory.put(key, value);
  const checksum = hash(value);
  await memory.put(`_checksum:${key}`, checksum);

  // Verify write
  const written = await memory.get(key);
  const written_checksum = hash(written);
  if (checksum !== written_checksum) {
    throw new Error(`Write verification failed for ${key}`);
  }
};
```

**Document remediation:**
```
incident:data-corruption:{timestamp}
{
  ...detection and recovery data...,
  "root_cause": "unvalidated_input | concurrent_write | hardware_issue",
  "prevention_measures": [
    "Added schema validation on all writes",
    "Implemented write locks for shared resources",
    "Enabled checksum verification for critical data"
  ],
  "implemented_by": "...",
  "verification_date": "..."
}
```

---

## Post-Incident Review

After any incident, complete this review within 24 hours:

```
incident:postmortem:{timestamp}
{
  "incident_id": "gateway-crash-2026-03-29-001",
  "incident_type": "gateway_crash | api_limit | agent_loop | data_corruption",
  "detection_time": "2026-03-29T10:15:00Z",
  "resolution_time": "2026-03-29T10:45:00Z",
  "total_duration_minutes": 30,
  "impact": {
    "workflows_interrupted": 3,
    "users_affected": 2,
    "data_lost": false,
    "sla_violated": false
  },
  "root_cause": "description of underlying issue",
  "immediate_fix": "what we did to recover",
  "permanent_fix": "what we'll do to prevent recurrence",
  "lessons_learned": [
    "lesson 1",
    "lesson 2"
  ],
  "action_items": [
    { item: "...", owner: "...", due_date: "..." }
  ]
}
```

Review with team and update documentation if procedures were unclear.
