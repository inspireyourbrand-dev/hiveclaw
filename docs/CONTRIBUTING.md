# Contributing to HiveClaw

Welcome! This guide explains how to set up a development environment, our code standards, the PR process, and naming conventions.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 22.0.0
- **Git** (any recent version)
- **pnpm** (optional, but recommended over npm)

### Development Setup

1. **Clone and Install**

   ```bash
   git clone https://github.com/inspireyourbrand-dev/hiveclaw.git
   cd hiveclaw
   ./scripts/install.sh
   ```

2. **Verify Installation**

   ```bash
   ./scripts/build-hivecontrol.sh
   ```

   You should see all screens validated and a green "PASS" status.

3. **Start Development Servers**

   ```bash
   # Terminal 1: Start OpenClaw gateway
   cd upstream
   npm run dev
   # Gateway runs on localhost:3000
   # WebSocket on localhost:3001

   # Terminal 2: Watch for screen changes (optional)
   # Most development is direct HTML/CSS/JS editing
   ```

4. **Open Browser**

   Navigate to `http://localhost:3000` and you should see the HiveControl dashboard.

---

## Project Structure for Contributors

```
HiveControl OS/
├── screens/                 # ← Modify these for UI changes
│   ├── dashboard.html
│   ├── monitor.html
│   ├── agents.html
│   ├── resources.html
│   ├── logs.html
│   ├── settings.html
│   ├── help.html
│   └── about.html
├── branding/               # ← Modify for theme/styling
│   └── hivepowered-theme.css
├── ws-client.js           # ← Modify for protocol extensions
├── index.html             # ← Modify for entry point changes
├── upstream/              # ← DO NOT MODIFY (OpenClaw)
├── gateway/               # ← Modify for gateway customization
├── agents/                # ← Agent workspace (runtime)
├── scripts/               # ← Maintenance scripts
└── docs/                  # ← Documentation
```

### What You Can Modify

- Any file in `screens/`
- `branding/hivepowered-theme.css`
- `ws-client.js`
- `index.html`
- Configuration in `hiveclaw.config.json`
- Documentation in `docs/`

### What NOT to Modify

- Files in `upstream/` (fork from OpenClaw)
- `scripts/install.sh` and `scripts/sync-upstream.sh` (unless fixing bugs)
- `gateway/` unless extending HiveControl (not OpenClaw core)

---

## Code Standards

### HTML Screens

- **File format**: `lowercase-with-dashes.html`
- **Structure**: Every screen must have:
  ```html
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Screen Name - HiveControl</title>
    <link rel="stylesheet" href="/branding/hivepowered-theme.css">
  </head>
  <body>
    <!-- Content -->
    <script src="/branding/hivepowered-theme.js"></script>
  </body>
  </html>
  ```

- **Styling**: Use CSS custom properties from `hivepowered-theme.css`:
  ```css
  background: var(--hive-bg-primary);
  color: var(--hive-text-primary);
  border: 1px solid var(--hive-border);
  ```

- **No inline styles** (use theme CSS)
- **Semantic HTML** (use proper tags: `<header>`, `<nav>`, `<main>`, `<section>`)
- **ARIA labels** for interactive elements (screen readers)

### JavaScript

- **File naming**: `camelCase.js` or `lowercase-with-dashes.js`
- **Module style**: Use ES6 modules where possible
- **No jQuery** (we don't include it; use vanilla JS or modern browser APIs)
- **Async/await** preferred over callbacks
- **Comments**: Document complex logic, not obvious code
  ```javascript
  // ✓ Good: Explains why
  // Exponential backoff helps reduce thundering herd
  const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);

  // ✗ Bad: Obvious from code
  // Increment the counter
  count++;
  ```

### CSS

- **No inline styles** in HTML
- **Custom properties** for theming:
  ```css
  .button {
    background: var(--hive-accent);
    border: 1px solid var(--hive-border);
    padding: var(--hive-spacing-md);
  }
  ```

- **BEM naming** for component classes:
  ```css
  .card { /* Block */ }
  .card__header { /* Element */ }
  .card--featured { /* Modifier */ }
  ```

- **Mobile-first** (base styles for mobile, then `@media (min-width: ...)`)

### Configuration

All configuration goes in `hiveclaw.config.json`:

```json
{
  "gateway": {
    "host": "localhost",
    "port": 3000
  },
  "agents": {
    "workspace": "./agents/workspace",
    "defaultConfig": {
      "timeout": 30000
    }
  }
}
```

No hardcoded values in code.

---

## Agent Naming Conventions

When creating agents for HiveControl, follow these naming patterns:

### Agent Names

Format: `verb-noun` or `action-target`

```
✓ Good:
  - fetch-logs
  - analyze-metrics
  - deploy-service
  - restart-gateway
  - sync-database

✗ Bad:
  - LogFetcher (use lowercase with dashes)
  - do_work (use dashes, not underscores)
  - agent1 (not descriptive)
```

### Agent Directories

```
agents/workspace/active/
├── fetch-logs/              # Agent name as directory
│   ├── agent.json           # Agent manifest
│   ├── handler.js           # Main agent logic
│   ├── config.json          # Agent-specific config
│   └── README.md            # What it does
├── analyze-metrics/
└── deploy-service/
```

### Agent Manifest (agent.json)

```json
{
  "name": "fetch-logs",
  "version": "1.0.0",
  "description": "Fetches recent logs from HiveControl gateway",
  "author": "Your Name <you@example.com>",
  "triggers": ["on-demand", "on-error"],
  "inputs": {
    "service": "string (optional)",
    "limit": "number (default: 100)"
  },
  "outputs": {
    "logs": "array of log objects",
    "count": "number"
  },
  "timeout": 30000,
  "retries": 3
}
```

### Agent Handler Structure

```javascript
// agents/workspace/active/fetch-logs/handler.js

export async function execute(inputs, context) {
  const { service, limit = 100 } = inputs;
  const { ws, logger } = context;

  try {
    // Your agent logic here
    logger.info(`Fetching ${limit} logs for service: ${service}`);

    const logs = await ws.send('get-logs', {
      service,
      limit
    });

    return {
      success: true,
      logs,
      count: logs.length
    };
  } catch (error) {
    logger.error('Failed to fetch logs:', error);
    throw error;
  }
}
```

---

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/my-feature-name

# Or for bug fixes:
git checkout -b fix/issue-description

# Or for documentation:
git checkout -b docs/topic-name
```

### 2. Make Changes

- Edit files as needed
- Test in browser
- Validate screens: `./scripts/build-hivecontrol.sh`

### 3. Test Your Changes

```bash
# Validate build
./scripts/build-hivecontrol.sh

# Test in browser at http://localhost:3000
# Check console for errors (F12 → Console)
# Test WebSocket connection works
```

### 4. Commit with Clear Messages

```bash
# Use conventional commit format
git add screens/dashboard.html
git commit -m "feat(dashboard): add real-time status widget"

# Other examples:
git commit -m "fix(monitor): handle disconnection gracefully"
git commit -m "docs(contributing): clarify agent naming"
git commit -m "style(theme): update accent color to new brand"
```

**Conventional Commit Types**:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` CSS/styling changes
- `refactor:` Code refactoring
- `test:` Adding/updating tests
- `chore:` Build, dependencies, etc.

### 5. Push and Create PR

```bash
git push origin feature/my-feature-name
```

Then create a Pull Request on GitHub with:

- **Title**: One-liner matching your commits
- **Description**: Explain what and why
- **Screenshots**: For UI changes
- **Testing**: How you verified it works

### PR Template

```markdown
## What does this PR do?

Brief description of the change.

## Why?

Explain the motivation or problem this solves.

## How was this tested?

- Tested on localhost:3000
- Verified all 8 screens still load
- Checked console for errors
- [List other testing]

## Screenshots (if UI change)

[Paste screenshots here]

## Checklist

- [ ] Screens validate with `scripts/build-hivecontrol.sh`
- [ ] No console errors
- [ ] Follows code standards (no inline styles, semantic HTML, etc.)
- [ ] Commit messages are clear
- [ ] Documentation updated if needed
```

### 6. Code Review

- Address review feedback promptly
- Respond to comments or ask for clarification
- Push updates to the same branch (PR updates automatically)

### 7. Merge

Once approved, a maintainer will merge your PR. You can then delete your branch:

```bash
git branch -d feature/my-feature-name
```

---

## Testing & Validation

### Before You Commit

```bash
# Validate your screens are well-formed
./scripts/build-hivecontrol.sh

# Check for obvious errors
npm run lint  # (if available)

# Test in browser manually
# - Open http://localhost:3000
# - Click through each screen
# - Check browser console (F12)
# - Test WebSocket by viewing Network tab
```

### What Build Validation Checks

- All 8 screen HTML files exist
- No empty files
- Basic HTML syntax (matching tags, doctype)
- File sizes and checksums
- Generates build manifest

### Manual Testing Checklist

- [ ] Page loads without errors
- [ ] All screens are clickable/navigable
- [ ] WebSocket connects (check Network tab → WS)
- [ ] No red errors in console
- [ ] Responsive on mobile (Ctrl+Shift+I → toggle device toolbar)
- [ ] Theme colors load correctly
- [ ] No broken images or missing assets

---

## Getting Help

- **Questions about the codebase**: Open a Discussion
- **Found a bug**: Open an Issue with reproduction steps
- **Want to propose a feature**: Discuss in Issues first before implementing
- **Technical questions**: Check existing Issues/PRs or ask in Discussion

---

## Reporting Issues

When reporting bugs, include:

1. **What you did**: Step-by-step reproduction
2. **What you expected**: Expected behavior
3. **What happened**: Actual behavior
4. **Environment**: Browser, OS, Node version
5. **Error message**: Full stack trace if applicable
6. **Screenshots**: If visual issue

Example:

```markdown
**Steps to reproduce:**
1. Open http://localhost:3000
2. Navigate to Monitor screen
3. Click "Refresh Metrics"

**Expected:**
Metrics update within 2 seconds

**Actual:**
"Failed to fetch" error in console

**Environment:**
- Chrome 120
- macOS 14
- Node 22.1.0

**Error:**
WebSocket connection timeout after 30s
```

---

## Documentation

Documentation lives in `docs/`:

- **ARCHITECTURE.md**: System design and data flow
- **FORK-STRATEGY.md**: How we sync with OpenClaw
- **CONTRIBUTING.md**: This file

Update docs when:
- Adding major features
- Changing architecture
- Adding new agents/integrations
- Clarifying processes

Keep docs in sync with code.

---

## Questions?

- Check existing Issues and PRs
- Read the documentation in `docs/`
- Reach out to maintainers
- Start a Discussion for open-ended questions

Thank you for contributing to HiveClaw!
