# HiveWorkflow

> Natural-language workflow builder for HiveClaw — describe what you want, agents build it.

## Status: Functional (v0.1)

HiveWorkflow is fully integrated into HiveControl OS v0.1. The system operates in **hybrid mode**: a built-in JavaScript workflow engine handles decomposition, agent matching, and simulated execution standalone, and auto-connects to real OpenClaw gateway agents when a running gateway is detected.

## What It Does

You describe what you want built in plain English. Orion (the master orchestrator) receives your request and:

1. **Decomposes** it into discrete tasks with keyword matching against 14 capability patterns
2. **Matches** each task to the right specialist agents (8 permanent + dynamic spawns)
3. **Checks hardware capacity** — probes CPU, RAM, GPU, disk to determine max concurrent agents
4. **Spawns** additional agents within resource constraints if the workload demands it
5. **Executes** the workflow — in parallel where possible, serialized into waves when capacity-limited
6. **Pauses for human input** when needed — credentials, approvals, file uploads, manual steps
7. **Reports** completion across HiveControl OS — tasks appear on Kanban, agents show in Team/Office

## System Architecture

```
                    ┌─────────────────────────────────┐
                    │       workflow.html (UI)         │
                    │  3-Panel: Swarm | Chat | Steps   │
                    └──────────┬──────────────────────┘
                               │
                    ┌──────────┴──────────────────────┐
                    │    HiveWorkflowEngine            │
                    │    (engine.js)                    │
                    │    Decompose → Match → Execute    │
                    └──┬──────────┬──────────┬────────┘
                       │          │          │
              ┌────────┴──┐  ┌───┴────┐  ┌──┴────────┐
              │ HW Monitor│  │Spawner │  │ HiveBus   │
              │(hw-monitor)│  │(spawner)│  │(hive-bus) │
              │ CPU/RAM/  │  │ Create │  │ Cross-    │
              │ GPU probe │  │ agents │  │ screen    │
              └───────────┘  └────────┘  │ events    │
                                         └──┬────────┘
                                            │
              ┌──────────┬──────────┬───────┴───┬──────────┐
              │Dashboard │ Tasks    │ Team      │ Office   │
              │(alerts)  │(kanban)  │(org chart)│(viz)     │
              └──────────┴──────────┴───────────┴──────────┘
```

## Files

| File | Purpose | Lines |
|------|---------|-------|
| `engine.js` | Core orchestration — decomposition, matching, execution, chat | ~790 |
| `hw-monitor.js` | System profiling — CPU, RAM, GPU, disk, capacity estimation | ~360 |
| `spawner.js` | Dynamic agent creation/retirement within resource constraints | ~405 |
| `../hivecontrol/lib/hive-bus.js` | Cross-screen event bus (BroadcastChannel + postMessage fallback) | ~355 |
| `../hivecontrol/screens/workflow.html` | The full UI — 3-panel design with chat, swarm monitor, steps | ~1630 |

## Hardware Capacity System

The HW Monitor probes the host system and estimates max concurrent agents:

| Agent Type | RAM per Agent | CPU per Agent | GPU Required |
|-----------|---------------|---------------|-------------|
| API-Routed (Claude/GPT) | ~50 MB | 0.1 cores | No |
| Local 7B (Ollama) | ~4 GB | 1 core | No |
| Local 13B (Ollama) | ~8 GB | 2 cores | No |
| Local 70B (Ollama) | ~40 GB | 4 cores | Yes |
| Lightweight Tool Agent | ~25 MB | 0.1 cores | No |

The system reserves 2 slots for permanent agents and a 1GB RAM safety buffer for the OS.

When a workflow exceeds capacity, Orion automatically serializes tasks into execution waves.

## Agent Spawner

Dynamic agents are created from 10 templates: web-scraper, code-writer, content-writer, data-analyst, api-integrator, qa-tester, designer, researcher, monitor, general.

Each spawned agent has:
- Unique ID, name, color, and icon
- Scoped capabilities and tool access
- Automatic retirement on task completion (one-shot mode)
- Gateway registration when connected

## Human-in-the-Loop

When the workflow needs human input, the Steps Panel slides in with:

- **Credentials**: secure input fields for API keys and tokens
- **Approval**: review area with approve/reject/modify options
- **File Upload**: drag-and-drop zone
- **Manual Action**: checklist with checkboxes
- **Configuration**: dynamic form fields

The workflow pauses automatically, resumes when the user completes the step.

## Cross-Screen Integration

The HiveBus event system propagates workflow events to other HiveControl OS screens:

| Event | Target Screen | What Happens |
|-------|--------------|-------------|
| Task created/updated | Tasks (Kanban) | Cards appear and move between columns |
| Agent spawned/retired | Team | New agent cards appear/disappear |
| Agent status change | Office | Agent avatars update in the 2D office |
| Workflow alert | Dashboard | Alert banner shows in system health |
| Document created | Documents | Doc appears in the library |
| Memory created | Memory | Entry appears in the journal |

## Design Principles

- **Orion is the single gateway** — all requests route through the orchestrator
- **Agents are specialists** — narrow roles, scoped permissions, defined output contracts
- **Build incrementally** — plan first, execute in stages, verify at each stage
- **Hardware-aware** — never spawn more agents than the system can handle
- **Human-in-the-loop** — when automation hits a wall, provide clear step-by-step guidance
- **Store learned patterns** — skills and playbooks persist so we don't re-learn

## Roadmap

- [x] Chat interface with Orion
- [x] Workflow decomposition engine (14 patterns)
- [x] Agent matching and assignment
- [x] Hardware capacity monitoring (CPU/RAM/GPU/disk)
- [x] Dynamic agent spawner with 10 templates
- [x] Guided steps panel (5 step types)
- [x] Cross-screen event bus
- [x] 3-panel UI (swarm monitor, chat, steps)
- [x] Hybrid mode (standalone + gateway)
- [ ] Workflow templates and presets
- [ ] Workflow history and replay
- [ ] Persistent workflow state (survives refresh)
- [ ] Workflow sharing and export
- [ ] Custom agent template builder
- [ ] Cost estimation per workflow

## Access

HiveWorkflow is accessible from the HiveControl OS sidebar navigation, or directly at:

```
http://localhost:18789/__hiveclaw__/hivecontrol/screens/workflow.html
```
