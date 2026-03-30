# HiveClaw Security Guide

## Default Security Posture

HiveClaw ships with a **local-first, secure-by-default** configuration:

- Gateway binds to `127.0.0.1` (localhost only)
- No authentication required for local connections
- API key required for remote access (when configured)
- Memory stored locally in SQLite (no cloud by default)
- No secrets stored in code or config files

## Authentication

### Local Access (Default)

Local requests are trusted by default. No API key needed when connecting from the same machine.

### Remote Access

To expose HiveClaw to the network:

1. Set an API key in `.env`:
   ```
   HIVECLAW_API_KEY=your-secret-key-here
   ```

2. Change the bind address:
   ```
   OPENCLAW_GATEWAY_HOST=0.0.0.0
   ```

3. Include the API key in all requests:
   ```
   X-API-Key: your-secret-key-here
   ```

### OpenClaw Pairing

When connected to OpenClaw's messaging channels, the standard OpenClaw DM pairing mode applies — unknown senders must provide an approval code before interacting with your agent.

## Governor Mode

The Governor prevents runaway API costs:

- **Tier 1**: 60-second cooldown after first rate limit hit
- **Tier 2**: 15-minute cooldown after repeated hits
- **Tier 3**: Circuit breaker — all API calls suspended until manual reset

Reset the circuit breaker: `POST /api/v1/governor/reset`

## Agent Boundaries

Each agent has strict scope definitions. The approval-gated action system ensures:

- Production deployments require Orion approval
- Security policy changes require Cipher + Orion approval
- No agent can exceed its defined scope without escalation
- All actions maintain an audit trail

See [agents/AGENTS.md](../agents/AGENTS.md) for the complete boundary specification.

## Secrets Management

- Never commit `.env` files (included in `.gitignore`)
- Use environment variables for all credentials
- Rotate API keys regularly
- The Cipher agent monitors for credential exposure

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it to security@hivepowered.ai. Do not open a public issue.
