# HiveControl Heartbeat

## Purpose
The Heartbeat skill performs periodic health verification of the HiveControl system. It ensures all screens are accessible, the gateway is responsive, agents are operational, and the memory system is functioning correctly. Heartbeat serves as an early warning system for infrastructure failures.

## What It Does

### System Health Verification
- Tests connectivity to all HiveControl screens
- Verifies gateway WebSocket is responsive
- Confirms agent processes are alive and responding
- Validates memory system read/write operations
- Tracks response times and error rates

### Check Sequence

The heartbeat follows this ordered sequence:

1. **Gateway Ping (WebSocket)**
   - Send: `{ type: "ping", timestamp: now, from: "heartbeat" }`
   - Expect: `{ type: "pong", timestamp, latency }` within 5 seconds
   - Failure: Log error, escalate to alert

2. **Screen Accessibility Verification**
   - Loop through: Dashboard, Workflow, Agent Board, Memory Explorer, Settings
   - Test: Load screen assets, verify key UI elements present
   - Timeout: 10 seconds per screen
   - Failure: Mark screen as degraded, log HTTP status

3. **Agent Presence Check**
   - Query memory: `agents:active`
   - Verify: Each agent has recent heartbeat (< 5 min old)
   - Count: Total active agents, agents in ready state
   - Failure: List unresponsive agents by ID

4. **Memory System Validation**
   - Write test: Create temporary key, verify stored
   - Read test: Retrieve key, compare value
   - Delete test: Remove key, confirm deletion
   - Metrics: Check memory usage percentage, free space
   - Failure: Memory system degraded or full

### Output and Reporting

After each check sequence, generate a **Health Report**:

```markdown
## HiveControl Health Report
**Timestamp:** [ISO-8601]
**Overall Status:** [HEALTHY | DEGRADED | CRITICAL]

### Gateway Status
- WebSocket: [OPERATIONAL | TIMEOUT | ERROR]
- Latency: [ms]
- Last Response: [timestamp]

### Screen Accessibility
- Dashboard: [OK | TIMEOUT | ERROR]
- Workflow: [OK | TIMEOUT | ERROR]
- Agent Board: [OK | TIMEOUT | ERROR]
- Memory Explorer: [OK | TIMEOUT | ERROR]
- Settings: [OK | TIMEOUT | ERROR]

### Agent Health
- Total Active: [count]
- Ready: [count]
- Busy: [count]
- Unresponsive: [count]
- Unresponsive IDs: [list]

### Memory System
- Status: [OK | DEGRADED | FULL | ERROR]
- Usage: [percentage]
- Free Space: [MB]
- Last Write Test: [timestamp]
- Last Read Test: [timestamp]

### Alerts
[List of any failures or anomalies]

### Next Check
Scheduled: [timestamp + 30 minutes]
```

Write report to memory at: `heartbeat:latest-report`

### Failure Detection and Alerts

| Failure Type | Severity | Action |
|---|---|---|
| Gateway timeout (>5s) | HIGH | Alert, retry in 10s, escalate if 2+ failures |
| Screen timeout (>10s) | MEDIUM | Log, check network, no escalation |
| Agent unresponsive (>5 min) | MEDIUM | Log agent ID, mark degraded, alert on 3+ |
| Memory full (>90%) | CRITICAL | Immediate alert, pause non-essential operations |
| Memory corrupted (write/read mismatch) | CRITICAL | Immediate alert, halt all writes, diagnostic mode |

## Execution Frequency

- **Default:** Every 30 minutes
- **Degraded Mode:** Every 5 minutes (if previous check showed issues)
- **Critical Mode:** Every 1 minute (if memory or gateway critical)
- **Manual Trigger:** Always available on-demand via Dashboard button

## Integration with Dashboard

The Dashboard Screen displays real-time status indicators:

### Status Panel
- **Gateway:** Green (healthy), Yellow (slow >3s), Red (timeout/error)
- **Screens:** Count of accessible screens (5/5 = green, <5 = yellow)
- **Agents:** Count of active agents, red if >1 unresponsive
- **Memory:** Green (<80%), Yellow (80-90%), Red (>90%)

### Latest Report Display
- Show most recent heartbeat report in expandable panel
- Color-code status: Green/Yellow/Red
- Display last check timestamp and next scheduled check
- One-click manual heartbeat trigger

### Alert Notifications
- Toast notifications on status changes
- Persistent banner if any component CRITICAL
- Bell icon with count of unresolved alerts
- Clear button to dismiss resolved alerts

## Data Retention

Store all heartbeat reports in memory:
- `heartbeat:latest-report` — most recent (always updated)
- `heartbeat:history` — rolling 24-hour archive
- Clean up reports >24h old automatically

Access pattern: `GET heartbeat:latest-report` for display, `GET heartbeat:history` for trending/debugging.

## Manual Trigger

Users can trigger heartbeat manually via:
1. Dashboard → Health panel → "Check Now" button
2. Keyboard shortcut: `Ctrl+Shift+H`
3. CLI: `hivecontrol heartbeat --force`

Manual runs ignore frequency throttle and return immediately when complete.
