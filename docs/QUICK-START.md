# HiveClaw Quick Start Guide

Get HiveClaw running in under 5 minutes on any platform.

## Prerequisites

- **Node.js v22+** — [Download](https://nodejs.org)
- **Git** — [Download](https://git-scm.com)
- **OpenClaw** (optional) — `npm install -g openclaw@latest`

## Install

### Linux / macOS

```bash
git clone https://github.com/inspireyourbrand-dev/hiveclaw.git
cd hiveclaw
bash scripts/install.sh
```

### Windows

```powershell
git clone https://github.com/inspireyourbrand-dev/hiveclaw.git
cd hiveclaw
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

### Docker

```bash
git clone https://github.com/inspireyourbrand-dev/hiveclaw.git
cd hiveclaw
cp .env.example .env
docker compose up -d
```

## Start

```bash
hiveclaw start
```

Or manually:

```bash
node gateway/index.js
```

## Access

Once running, you have access to:

- **Dashboard**: http://localhost:18789/__hiveclaw__/hivecontrol/
- **Health**: http://localhost:18789/health
- **Agents API**: http://localhost:18789/api/v1/agents
- **Memory API**: http://localhost:18789/api/v1/hivemem/memories
- **WebSocket**: ws://localhost:18789/ws

## First Steps

1. Open the dashboard and check agent status
2. Store your first memory:
   ```bash
   hiveclaw memory store "HiveClaw is running on my machine"
   ```
3. Search it back:
   ```bash
   hiveclaw memory search "running"
   ```
4. Check system health:
   ```bash
   hiveclaw doctor
   ```

## What's Next

- Read the [Architecture Guide](ARCHITECTURE.md) to understand how components connect
- Check [Agent Specifications](../agents/AGENTS.md) for the full agent hierarchy
- Set up [HiveMem](../hivemem/README.md) cloud storage for persistent cross-device memory
- Join the conversation at [HivePowered.AI](https://hivepowered.ai)
