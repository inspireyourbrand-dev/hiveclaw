# Governor Mode

## Purpose
Governor Mode is a resource-aware execution system that manages API call budgets, enforces request throttling, and maintains offline fallback capabilities. It prevents resource exhaustion and enables graceful degradation when external services are unavailable or rate-limited.

## What It Does

### API Budget Tracking
- Monitors cumulative API call usage against configurable monthly/daily budgets
- Tracks per-service call counts, latency, and error rates
- Stores budget state in memory system for cross-agent visibility
- Raises warnings at 70% and 80% thresholds, enforces hard stops at 100%

### Request Throttling
- Enforces maximum 1 concurrent external API call across all agents
- Maintains 2-5 second minimum delay between consecutive calls
- Queues requests when throttle is active
- Prioritizes urgent calls over non-critical operations

### Backoff and Fallback Strategy
- **Level 1 (Initial):** 60-second backoff, retry with exponential jitter
- **Level 2 (Extended):** 15-minute backoff, switch to cached/approximate responses
- **Level 3 (Offline):** Complete local execution, no external calls, graceful degradation

## Rules and Constraints

### Concurrency Limit
```
Max concurrent external calls: 1
Enforced globally across all agents
Violators are queued and retried
```

### Throttling Delays
```
Minimum delay between calls: 2-5 seconds (configurable)
Applies to all external API calls
Exception: critical/security operations (still queued, never rejected)
```

### Backoff Strategy
```
Attempt 1: Immediate call
Attempt 2: 60-second wait (exponential jitter: 50-70s)
Attempt 3: 15-minute wait (exponential jitter: 14-16 min)
Attempt 4+: Offline mode (no retry)
```

## Call Minimization Strategies

Agents MUST apply these in order before making external calls:

1. **Check Memory First**
   - Query memory system for cached results
   - If data is fresh (< 24 hours for most APIs), use cached result
   - Log cache hits for analytics

2. **Batch Requests**
   - Combine multiple queries into single API call when possible
   - Use bulk endpoints where available
   - Group related operations before sending

3. **Local Execution First**
   - Perform computations, transformations, analysis locally
   - Only fetch data if unavailable in memory or local context
   - Use heuristics and approximations when exact data not critical

4. **Defer Non-Urgent Operations**
   - Mark non-critical calls with `:defer` tag
   - Queue for next scheduled batch window
   - Continue execution without blocking on result

## Offline Completion Mode

When API limits are breached or external services unavailable:

### Transition Trigger
- Automatic when Attempt 4 backoff exhausted
- Manual trigger via `:offline` directive
- Time-based: 30+ minutes without successful external call

### Operating Procedures
1. **Stop External Tools:** No new API calls initiated
2. **Continue Local Processing:** All local computations, transformations, logic
3. **Use Available Data:** Query memory for recent results, use cached responses
4. **Produce Hybrid Output:**
   - Report completed work with current data
   - Clearly mark what remains incomplete
   - Provide resume schedule for when connectivity restored

### Output Format
```markdown
## Completed
- [List of finished tasks with local data]
- [Cached results applied]

## Remaining Work
- [Tasks blocked on external APIs]
- [Data pending external fetch]

## Resume Schedule
- When external service recovers, process this queue first
- Estimated resume time: [time]
- Priority order: [critical, then important, then nice-to-have]
```

## Model Escalation

### Default Configuration
- Start with cheapest available model (Haiku for most tasks)
- Use local context and memory heavily
- Batch requests to minimize token usage

### Auto-Escalation Triggers
- **Accuracy Requirement:** Switch to Opus if accuracy must be >95%
- **Complexity:** Multi-step reasoning beyond model capability → escalate
- **Token Pressure:** If approaching context limits → escalate to larger model
- **Error Rate:** If task fails >2 times on current model → escalate once

### Escalation Path
```
Haiku (default) → Sonnet (moderate complexity) → Opus (high complexity/accuracy)
```

Escalation is automatic but logged for analysis.

## Implementation Guidance for Agents

### Before Making External Calls
```javascript
// 1. Check Governor Mode state
const budget = await memory.get('api-budget-state');
if (budget.percentUsed >= 100) {
  enterOfflineMode();
  return;
}

// 2. Check throttle state
const throttleState = await memory.get('throttle-state');
if (throttleState.activeUntil > now) {
  queueCall(request, throttleState.activeUntil);
  return;
}

// 3. Check memory cache
const cached = await memory.get(`api-response:${key}`);
if (cached && cached.freshness < 24h) {
  return cached.data;
}

// 4. Batch with pending calls if possible
const pending = await memory.get('pending-api-calls');
if (canBatch(request, pending)) {
  batchWith(request, pending);
  return;
}

// 5. Make the call with tracking
const result = await makeAPICall(request);
await updateBudgetMetrics(request, result);
await memory.put(`api-response:${key}`, result, ttl: 24h);
```

### In Offline Mode
```javascript
// Only use these:
- Local memory and cached data
- Computational results
- Heuristics and approximations

// Never attempt:
- External API calls
- Network requests
- Tool invocations requiring external services

// Always track:
- What was completed locally
- What remains unresolved
- When to retry
```

### Budget Awareness
- Log all API calls with cost metadata
- Respect daily budget splits (budget / remaining days)
- Signal team when approaching 70% usage
- Automatically enforce :offline at 100%

## Integration Points

- **Memory System:** Stores all state (budget, throttle, cache)
- **Dashboard:** Displays current budget, throttle status, offline mode indicator
- **Agent Runtime:** Automatically applies rules to all external calls
- **Alert System:** Notifies on threshold breaches and mode transitions
