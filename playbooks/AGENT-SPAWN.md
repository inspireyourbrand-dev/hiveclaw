# Playbook: Agent Spawning via HiveWorkflow

## Overview
This playbook provides step-by-step instructions for dynamically spawning new agents in HiveControl during workflow execution. Agents are spawned to parallelize work, handle specialized subtasks, or provide isolation for high-risk operations.

## Prerequisites
- Agent running HiveControl and authorized to spawn
- Memory system operational
- Workflow script or manual trigger mechanism
- Understanding of task scope and resource requirements

---

## Decision Framework: When to Spawn an Agent

### Spawn an Agent If:
- [ ] Task can be parallelized (multiple independent subtasks)
- [ ] Subtask requires isolation (high risk, quarantine needed)
- [ ] Subtask is specialized (different model, skills, tools)
- [ ] Main agent is resource-constrained (CPU, memory, time budget)
- [ ] Subtask has strict timeout requirements
- [ ] Work exceeds main agent's token budget
- [ ] You need independent error recovery (one agent's failure shouldn't cascade)

### Do NOT Spawn If:
- [ ] Task is sequential and depends on previous result
- [ ] Coordination overhead exceeds performance gains
- [ ] Resource overhead of spawning > work saved
- [ ] Spawned agent would spend >70% time waiting on main agent
- [ ] Task is simple enough for main agent to complete

### Decision Matrix

| Scenario | Spawn? | Reason |
|---|---|---|
| Parallel API calls to 5 endpoints | YES | Independent + parallelizable |
| Sequential workflow with dependencies | NO | Coordination overhead |
| Long-running analysis (>5 min) + main work | YES | Unblock main thread |
| Two tool calls (no parallel benefit) | NO | Not enough work |
| High-risk tool (file deletion) | YES | Isolation + rollback |
| Data validation (low CPU) | NO | Too small to justify spawn |
| Web scrape 100 URLs | YES | Parallelize 10x agents |

---

## Part 1: Define Agent Scope

### 1.1 Identify Task Boundaries
Before spawning, clearly define:

**What the agent WILL do:**
- Specific inputs (data, parameters, context)
- Specific outputs (results to return)
- Tools available (which skills can it call)
- Time limit (hard timeout)
- Resource budget (if applicable)

**What the agent WILL NOT do:**
- Modify shared state (unless explicitly allowed)
- Call tools not listed
- Run indefinitely (always set timeout)
- Access memory outside its namespace

### 1.2 Document Scope in Memory

Create a scope definition:
```
workflow:spawn-request:{agent-id}
{
  "task_name": "Fetch URLs Batch 1",
  "description": "Fetch and parse 25 URLs from provided list",
  "inputs": {
    "urls": ["url1", "url2", ...],
    "timeout_per_url": 10000,
    "parser_type": "html"
  },
  "outputs": {
    "results": [{"url": "...", "status": 200, "title": "...", "content": "..."}],
    "errors": [{"url": "...", "reason": "..."}]
  },
  "tools_allowed": ["web-fetch", "parse-html"],
  "tools_forbidden": ["file-write", "send-email", "delete-file"],
  "memory_namespace": "batch-1",
  "timeout_seconds": 300,
  "resource_budget": {
    "max_api_calls": 50,
    "max_memory_mb": 256,
    "max_cpu_seconds": 120
  }
}
```

### 1.3 Identify Failure Mode
How should parent handle if spawned agent fails?

- **Graceful degradation:** Skip this subtask, continue others
- **Retry:** Spawn again with same task
- **Escalate:** Return error to user, stop workflow
- **Fallback:** Use cached/approximate result
- **Quarantine:** Mark results as unverified, manual review needed

Document in scope: `failure_mode: "graceful_degradation"`

---

## Part 2: Prepare Environment

### 2.1 Set Up Memory Namespace
Each agent gets an isolated memory namespace:

```
memory:agent:{agent-uuid}:*
↳ config (scope, inputs, failure mode)
↳ status (running, completed, failed)
↳ heartbeat (last seen timestamp)
↳ metrics (cpu_time, memory_peak, calls_made)
↳ results (output data)
↳ errors (error log)
```

Initialize:
```
agent:config:{uuid} = {scope definition from 1.2}
agent:status:{uuid} = "pending"
agent:heartbeat:{uuid} = [current timestamp]
```

### 2.2 Provision Skills
Determine which skills the agent needs:

1. **Core skills** (all agents have):
   - Memory access
   - Error handling
   - Heartbeat reporting

2. **Task-specific skills** (add based on scope):
   - If web-fetching: web-fetch skill
   - If parsing: parse-html, parse-json skills
   - If API calls: api-client skill
   - If file ops: file-read skill (NO file-write unless approved)

3. **Restriction list** (skills NOT available):
   - File deletion, modification (file-write, file-delete)
   - Email, messaging (send-email, send-message)
   - Payment/financial tools
   - Dangerous operations per Governor Mode

Document allowed tools in scope definition.

### 2.3 Allocate Resources
Before spawning, verify resources available:

```
Check memory: `system:resources:available`
{
  "agents_running": 3,
  "agents_max": 10,
  "memory_free_mb": 512,
  "cpu_percent_available": 40
}

Verify:
- agents_running < agents_max ✓
- memory_free_mb > spawn_requirement ✓
- cpu_percent_available > 0 ✓

If not met: Queue spawn request, try again in 30 seconds
```

---

## Part 3: Spawn Agent

### 3.1 Build Spawn Command
Use HiveWorkflow's spawn directive:

```javascript
const spawnRequest = {
  type: "spawn",
  agent_id: `agent-batch-${Date.now()}`,
  scope: {
    task_name: "Fetch URLs Batch 1",
    inputs: {
      urls: urlList,
      timeout_per_url: 10000,
      parser_type: "html"
    },
    outputs_schema: {
      results: "array",
      errors: "array"
    },
    tools_allowed: ["web-fetch", "parse-html"],
    timeout_seconds: 300,
    memory_namespace: "batch-1",
    failure_mode: "graceful_degradation"
  },
  parent_id: currentAgentId,
  priority: "normal" // or "high", "low"
};
```

### 3.2 Execute Spawn
Issue spawn command to gateway:

```javascript
const response = await gateway.send({
  type: "workflow:spawn",
  payload: spawnRequest
});

// Response will be:
{
  status: "spawned|queued|rejected",
  agent_id: "agent-batch-12345",
  reason: null, // if rejected, reason here
  estimated_start: "2026-03-29T10:35:00Z"
}
```

### 3.3 Confirm Spawn
Verify agent started:

```javascript
const agentStatus = await memory.get(`agent:status:${agent_id}`);
if (agentStatus === "pending" || "running") {
  console.log(`Agent ${agent_id} spawned successfully`);
} else if (agentStatus === "failed") {
  const error = await memory.get(`agent:errors:${agent_id}`);
  console.error(`Spawn failed: ${error}`);
  // Handle failure per failure_mode
}
```

### 3.4 Log in Workflow History
Record spawn in memory for audit:

```
workflow:history:{workflow-id}
Append event:
{
  timestamp: now,
  event: "agent_spawned",
  agent_id: agent_id,
  scope_summary: "Fetch URLs Batch 1",
  status: "spawned"
}
```

---

## Part 4: Monitor Execution

### 4.1 Set Up Heartbeat Monitoring
Each spawned agent sends heartbeat every 10 seconds:

```javascript
// Parent polls for heartbeat
const pollHeartbeat = async (agent_id) => {
  const heartbeat = await memory.get(`agent:heartbeat:${agent_id}`);
  const lastSeen = new Date(heartbeat);
  const stale = (Date.now() - lastSeen) > 30_000; // 30s threshold

  if (stale) {
    console.warn(`Agent ${agent_id} unresponsive for >30s`);
    // Consider remediation
  }
};
```

Poll at: baseline 30s, more frequent if timeout is short (<2 min)

### 4.2 Track Status Transitions
Agent status progresses:
- `pending` → `running` (initialized, starting work)
- `running` → `completed` (finished successfully)
- `running` → `failed` (error occurred)
- `running` → `timeout` (exceeded time limit)
- Any state → `terminated` (manually killed)

Monitor transitions:

```javascript
const checkStatus = async (agent_id) => {
  const status = await memory.get(`agent:status:${agent_id}`);

  switch(status) {
    case "running":
      return "ongoing"; // Wait
    case "completed":
      return "success"; // Retrieve results
    case "failed":
    case "timeout":
    case "terminated":
      return "error"; // Handle per failure_mode
  }
};
```

### 4.3 Handle Timeouts
If agent exceeds timeout:

```javascript
const timeout = scopeDefinition.timeout_seconds * 1000;
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error("Agent timeout")), timeout)
);

try {
  const result = await Promise.race([
    waitForAgentCompletion(agent_id),
    timeoutPromise
  ]);
} catch (err) {
  if (err.message === "Agent timeout") {
    // Terminate agent
    await gateway.send({ type: "workflow:terminate", agent_id });
    // Handle per failure_mode
  }
}
```

### 4.4 Log Metrics
As agent runs, track:

```
agent:metrics:{agent_id}
{
  "cpu_time_seconds": [updated every 30s],
  "memory_peak_mb": [updated every 30s],
  "api_calls_made": [running count],
  "errors_count": [running count],
  "last_update": [timestamp]
}
```

Use for diagnostics and resource planning.

---

## Part 5: Retrieve Results

### 5.1 Wait for Completion
Block parent until agent signals done:

```javascript
const waitForCompletion = async (agent_id, timeout_ms) => {
  const start = Date.now();

  while (Date.now() - start < timeout_ms) {
    const status = await memory.get(`agent:status:${agent_id}`);

    if (status === "completed") {
      return "success";
    }
    if (status === "failed" || status === "timeout") {
      return "error";
    }

    // Not done yet, wait 1 second
    await new Promise(r => setTimeout(r, 1000));
  }

  // Parent timeout exceeded
  return "timeout";
};
```

### 5.2 Retrieve Results
Once agent is done, get output:

```javascript
const results = await memory.get(`agent:results:${agent_id}`);
// Results match outputs_schema from spawn request

// Example:
{
  results: [
    { url: "...", status: 200, title: "...", content: "..." },
    ...
  ],
  errors: [
    { url: "...", reason: "timeout" },
    ...
  ]
}
```

### 5.3 Retrieve Error Log (if failed)
If agent failed, get diagnostics:

```javascript
const errorLog = await memory.get(`agent:errors:${agent_id}`);
// Contains:
{
  error_type: "tool_failure|timeout|out_of_memory|...",
  message: "specific error message",
  stack_trace: "...",
  last_action: "description of what was being done",
  recovery_suggested: "what to try next"
}
```

### 5.4 Validate Results
Before using results, validate against schema:

```javascript
const validateResults = (results, expectedSchema) => {
  const errors = [];

  // Check required fields present
  for (const field of Object.keys(expectedSchema)) {
    if (!(field in results)) {
      errors.push(`Missing field: ${field}`);
    }
  }

  // Check types match
  for (const [field, expectedType] of Object.entries(expectedSchema)) {
    const actual = typeof results[field];
    if (actual !== expectedType) {
      errors.push(`Field ${field}: expected ${expectedType}, got ${actual}`);
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
};

const validation = validateResults(results, outputsSchema);
if (!validation.valid) {
  // Partial or corrupt results, handle gracefully
}
```

---

## Part 6: Handle Results Integration

### 6.1 Merge Results into Parent State
If multiple agents spawned, combine results:

```javascript
const allResults = {};

for (const agent_id of spawnedAgents) {
  const batch = await memory.get(`agent:results:${agent_id}`);
  allResults[agent_id] = batch;
}

// Merge batches (example: combining URL fetch results)
const mergedResults = {
  results: allResults.flatMap(batch => batch.results),
  errors: allResults.flatMap(batch => batch.errors)
};
```

### 6.2 Handle Partial Failures
Per failure_mode, decide what to do:

**graceful_degradation:**
```javascript
// Use available results, skip failed batches
const validResults = mergedResults.results.filter(r => r !== null);
const failedCount = mergedResults.errors.length;
console.log(`Processed ${validResults.length}, ${failedCount} failed (continuing)`);
```

**escalate:**
```javascript
// If ANY agent failed, stop and report error
if (mergedResults.errors.length > 0) {
  throw new Error(`Agent spawn failed: ${mergedResults.errors[0].reason}`);
}
```

**retry:**
```javascript
// Spawn new agent with failed subtasks only
const failedUrls = mergedResults.errors.map(e => e.url);
const retryAgent = await spawn({
  ...originalScope,
  inputs: { urls: failedUrls },
  task_name: "Retry failed URLs"
});
```

### 6.3 Update Workflow State
Record results in workflow context:

```
workflow:results:{workflow-id}:batch-1 = mergedResults
workflow:status:{workflow-id} = "in_progress"

Append to workflow:history:
{
  timestamp: now,
  event: "agent_completed",
  agent_id: agent_id,
  status: "success|partial_failure|failure",
  items_processed: validResults.length,
  items_failed: failedCount
}
```

---

## Part 7: Cleanup

### 7.1 Terminate Agent Process
After results retrieved, cleanly terminate:

```javascript
await gateway.send({
  type: "workflow:terminate",
  agent_id: agent_id,
  reason: "workflow_complete"
});
```

### 7.2 Archive Agent Memory
Don't immediately delete memory; keep for debugging 24 hours:

```
agent:archived:2026-03-29T10:35:00Z:{agent_id}
{
  agent_id,
  scope: originalScope,
  status: finalStatus,
  metrics: finalMetrics,
  results: results,
  errors: errorLog,
  archived_at: now
}

// Clean up working memory
delete agent:config:{agent_id}
delete agent:status:{agent_id}
delete agent:heartbeat:{agent_id}
delete agent:results:{agent_id}
delete agent:errors:{agent_id}
delete agent:metrics:{agent_id}
```

### 7.3 Resource Cleanup
Release allocated resources:

```
system:resources:available
decrement agents_running count
free memory_mb back to pool
```

### 7.4 Log Lifecycle
In workflow history, record completion:

```
workflow:history:{workflow-id}
Append:
{
  timestamp: now,
  event: "agent_lifecycle_complete",
  agent_id: agent_id,
  duration_seconds: totalTime,
  cpu_time_seconds: metrics.cpu_time,
  memory_peak_mb: metrics.memory_peak,
  success_rate: validResults.length / (validResults.length + failedCount)
}
```

---

## Part 8: Escalation and Debugging

### 8.1 Agent Won't Start
If spawn response is "rejected":

1. Check reason from gateway
2. Likely causes:
   - `agents_max_reached`: Too many agents running, wait for some to finish
   - `insufficient_memory`: Free up memory, reduce agent count
   - `invalid_scope`: Check scope definition for errors
   - `tools_not_available`: Requested tools not installed

Action: Fix and retry spawn after 30s

### 8.2 Agent Unresponsive (No Heartbeat)
If heartbeat stale >30s:

1. Check agent status in memory
2. If `running`: Agent may be stuck
   - Try sending "ping" request to agent
   - If no response after 10s: Terminate and retry

3. If status shows error: Retrieve error log for diagnostics

### 8.3 Agent Timeout
If agent exceeds timeout:

1. Retrieve partial results (if any) from memory
2. Retrieve error log to see what was being done
3. Decide: Retry with more time? Escalate? Use partial results?
4. Terminate agent cleanly

### 8.4 Memory Corruption
If agent results don't match schema:

1. Retrieve raw results from memory
2. Check error log for data corruption clues
3. Options:
   - Retry agent (may be transient)
   - Mark as failed and skip
   - Manually inspect and repair if feasible
   - Escalate to human review

---

## Example Workflow: Parallel URL Fetching

```javascript
async function fetchURLsParallel(urlList) {
  const BATCH_SIZE = 25;
  const batches = chunkArray(urlList, BATCH_SIZE);
  const spawnedAgents = [];

  // 1. Spawn agents for each batch
  for (let i = 0; i < batches.length; i++) {
    const agent_id = `url-fetch-${i}`;
    const spawned = await spawnAgent({
      task_name: `Fetch URLs Batch ${i}`,
      inputs: { urls: batches[i] },
      outputs_schema: { results: "array", errors: "array" },
      tools_allowed: ["web-fetch", "parse-html"],
      timeout_seconds: 300,
      failure_mode: "graceful_degradation"
    });
    spawnedAgents.push(agent_id);
  }

  // 2. Wait for all agents
  const allPromises = spawnedAgents.map(id => waitForCompletion(id, 400_000));
  await Promise.all(allPromises);

  // 3. Retrieve and merge results
  const allResults = { results: [], errors: [] };
  for (const agent_id of spawnedAgents) {
    const batch = await memory.get(`agent:results:${agent_id}`);
    allResults.results.push(...batch.results);
    allResults.errors.push(...batch.errors);
  }

  // 4. Cleanup
  for (const agent_id of spawnedAgents) {
    await terminateAgent(agent_id);
    await archiveAgentMemory(agent_id);
  }

  return allResults;
}
```

This pattern parallelizes 25 URLs per agent, allowing 4 agents to process 100 URLs in ~30-60 seconds instead of sequential 300+ seconds.
