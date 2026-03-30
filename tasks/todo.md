# HiveClaw: Current Task List

Prioritized list of work items for the HiveClaw project. Status marked as: **TODO**, **IN PROGRESS**, **BLOCKED**, **DONE**.

---

## Critical Path (Must Finish Before Production Release)

### Infrastructure and Core Systems

- [ ] **[TESTING]** Deploy Governor Mode skill to staging, validate budget enforcement and offline mode
  - Acceptance criteria: API budget hits limit without exceeding it; system enters offline mode; local execution continues
  - Owner: [TBD]
  - Due: 2026-04-15

- [ ] **[TESTING]** Deploy HiveControl Heartbeat skill to staging, verify all screen checks work
  - Acceptance criteria: Heartbeat runs every 30 min, detects gateway issues within 5s, displays on Dashboard
  - Owner: [TBD]
  - Due: 2026-04-15

- [ ] **[IMPLEMENTATION]** Build Agent Board screen (displays all agents, real-time status, spawn/terminate controls)
  - Acceptance criteria: List shows agent ID, status, CPU, memory, current task; spawn button works; status updates real-time
  - Owner: [TBD]
  - Due: 2026-04-20

- [ ] **[IMPLEMENTATION]** Build Memory Explorer screen (query memory, view key-value pairs, inspect backups)
  - Acceptance criteria: Can list keys, view values, search by pattern, view history; read-only mode for safety
  - Owner: [TBD]
  - Due: 2026-04-22

### Operational Procedures

- [ ] **[DOCUMENTATION]** Test Third-Party Vetting playbook end-to-end with 2 candidate skills
  - Acceptance criteria: Complete vetting on 2 real third-party skills; update playbook based on actual experience
  - Owner: [TBD]
  - Due: 2026-04-30

- [ ] **[TESTING]** Run Incident Recovery drills for all 4 incident types (gateway crash, API limit, agent loop, data corruption)
  - Acceptance criteria: Each drill completes in <15 min without data loss; team familiarized with procedures
  - Owner: [TBD]
  - Due: 2026-04-30

- [ ] **[IMPLEMENTATION]** Automate Agent Spawn cleanup (garbage collection for orphaned agents)
  - Acceptance criteria: Scan for agents >1hr old without status update; terminate and archive; notify ops
  - Owner: [TBD]
  - Due: 2026-04-25

### Security and Hardening

- [ ] **[SECURITY]** Add input validation to all Agent-facing APIs (prevent injection, invalid scope, etc.)
  - Acceptance criteria: Unit tests for 20+ invalid inputs; graceful rejection with clear error messages
  - Owner: [TBD]
  - Due: 2026-04-20

- [ ] **[SECURITY]** Implement memory data validation on write (schema checks, checksum verification)
  - Acceptance criteria: All writes to critical keys validated; read-back verification for high-value data
  - Owner: [TBD]
  - Due: 2026-04-22

---

## High Priority (Ship in Next 30 Days)

- [ ] **[FEATURE]** Implement workflow templates (pre-configured workflows for common tasks)
  - Examples: "Bulk URL Fetch", "Data Validation", "Report Generation"
  - Owner: [TBD]
  - Due: 2026-05-15

- [ ] **[MONITORING]** Add Dashboard alerts panel (display active alerts, auto-dismiss resolved, history)
  - Owner: [TBD]
  - Due: 2026-04-30

- [ ] **[PERFORMANCE]** Optimize gateway message routing (current latency: 200ms, target: <50ms)
  - Owner: [TBD]
  - Due: 2026-05-15

- [ ] **[INTEGRATION]** Add support for async webhooks (allow agents to register callbacks on workflow completion)
  - Owner: [TBD]
  - Due: 2026-05-20

---

## Medium Priority (Ship in 30-60 Days)

- [ ] **[FEATURE]** Multi-workflow coordination (ability to wait for multiple workflows, aggregate results)
  - Owner: [TBD]
  - Due: 2026-06-15

- [ ] **[FEATURE]** Workflow versioning and rollback (save workflow definitions, revert to previous versions)
  - Owner: [TBD]
  - Due: 2026-06-15

- [ ] **[MONITORING]** Cost tracking dashboard (visualize API spend by service, by workflow type, trends)
  - Owner: [TBD]
  - Due: 2026-06-01

- [ ] **[DOCUMENTATION]** Create video tutorials for common tasks (spawn agent, debug workflow, handle incident)
  - Owner: [TBD]
  - Due: 2026-05-30

- [ ] **[TESTING]** Performance testing at scale (10+ concurrent agents, 1000+ queued workflows)
  - Acceptance criteria: System handles load without crashes; identify bottlenecks; document limits
  - Owner: [TBD]
  - Due: 2026-06-15

---

## Low Priority (Nice-to-Have, Ship When Time Allows)

- [ ] **[FEATURE]** Scheduled workflows (cron-like triggering of workflows at specific times)
  - Owner: [TBD]
  - Due: TBD

- [ ] **[FEATURE]** Workflow approval gates (require human sign-off before dangerous operations)
  - Owner: [TBD]
  - Due: TBD

- [ ] **[FEATURE]** Custom skill development kit (SDK, templates, testing framework)
  - Owner: [TBD]
  - Due: TBD

- [ ] **[FEATURE]** Multi-tenant isolation (allow multiple teams to use same HiveControl instance safely)
  - Owner: [TBD]
  - Due: TBD

- [ ] **[DOCUMENTATION]** Architecture decision records (ADRs) for key design choices
  - Owner: [TBD]
  - Due: TBD

---

## Recently Completed

- [x] **[SKILL]** Governor Mode skill (API budget management, throttling, offline fallback)
- [x] **[SKILL]** HiveControl Heartbeat skill (periodic system health checks)
- [x] **[SKILL]** Third-Party Vetting skill (evaluate external skills before install)
- [x] **[PLAYBOOK]** Third-Party Vetting playbook (step-by-step evaluation process)
- [x] **[PLAYBOOK]** Agent Spawn playbook (dynamic agent spawning, lifecycle management)
- [x] **[PLAYBOOK]** Incident Recovery playbook (procedures for 4 critical incident types)
- [x] **[DOCUMENTATION]** Lessons Learned document (foundational lessons from project)

---

## Known Issues / Tech Debt

### High Priority (Fix Before Release)

- **Memory system backup reliability:** Current backup mechanism occasionally misses recent writes. Need to implement write-ahead logging (WAL) or similar.
  - Impact: Data loss risk on crash
  - Owner: [TBD]
  - Effort: 3 days

- **Gateway connection handling:** Gateway doesn't gracefully handle rapid reconnections (thundering herd). Implement exponential backoff with jitter.
  - Impact: Cascade failures during transient network issues
  - Owner: [TBD]
  - Effort: 1 day

### Medium Priority (Fix in Next Release)

- **Agent timeout precision:** Timeouts are approximate (±5 seconds). Some workflows need <1 second precision.
  - Impact: Difficulty with time-critical operations
  - Owner: [TBD]
  - Effort: 2 days

- **Tool error messages:** Many tool errors are cryptic. Need better error messages and recovery suggestions.
  - Impact: Difficult debugging for users
  - Owner: [TBD]
  - Effort: 3 days

### Low Priority (Fix When Convenient)

- **Dashboard performance:** Dashboard becomes sluggish with >50 active workflows. Need virtualization.
  - Owner: [TBD]
  - Effort: 2 days

---

## Team Capacity and Assignments

### Available Team Members
- [Name/Role]: [Current assignment or AVAILABLE]
- [Name/Role]: [Current assignment or AVAILABLE]
- [Name/Role]: [Current assignment or AVAILABLE]

### Blockers
- Waiting for: [Service/Person/Decision]
- Unresolved question: [Issue]
- External dependency: [Service/API/Resource]

---

## Weekly Check-In Template

**Week of [DATE]:**
- Completed this week: [Tasks marked DONE]
- In progress: [Tasks marked IN PROGRESS]
- Blocked: [Tasks marked BLOCKED with reason]
- On track for release? [YES/NO + explanation]

---

**Last Updated:** 2026-03-29
**Maintained By:** [TBD]
**Next Review:** 2026-04-05 (weekly)
