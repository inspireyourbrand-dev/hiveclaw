/**
 * HiveClaw CLI — Main entry point
 *
 * Routes CLI commands to their handlers.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const HELP = `
  HiveClaw CLI v1.0.0 — by HivePowered.AI

  USAGE
    hiveclaw <command> [options]

  COMMANDS
    setup              Interactive first-time setup wizard
    start              Start the HiveClaw gateway
    start --dev        Start in development mode (verbose)
    stop               Stop the running gateway
    status             Show system health and component status
    doctor             Diagnose common issues
    agents             List agent swarm and their status
    memory search <q>  Search persistent memories
    memory stats       Show memory store statistics
    version            Show version info
    help               Show this help message

  EXAMPLES
    hiveclaw setup
    hiveclaw start
    hiveclaw status
    hiveclaw agents
    hiveclaw memory search "project decisions"

  ENVIRONMENT
    OPENCLAW_GATEWAY_PORT   Gateway port (default: 18789)
    HIVEMEM_ENABLED         Enable memory server (default: true)
    GOVERNOR_ENABLED        Enable API budget protection (default: true)

  DOCS
    https://github.com/inspireyourbrand-dev/hiveclaw
`;

export default async function cli(args) {
  const command = args[0];

  switch (command) {
    case 'setup':
      const setup = await import('./commands/install.js');
      await setup.default(args.slice(1));
      break;

    case 'start':
      const start = await import('./commands/start.js');
      await start.default(args.slice(1));
      break;

    case 'status':
    case 'doctor':
      const status = await import('./commands/status.js');
      await status.default(args.slice(1), command);
      break;

    case 'agents':
      const agents = await import('./commands/status.js');
      await agents.showAgents();
      break;

    case 'memory':
      const memory = await import('./commands/memory.js');
      await memory.default(args.slice(1));
      break;

    case 'version':
    case '--version':
    case '-v':
      console.log('hiveclaw v1.0.0');
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run "hiveclaw help" for usage information.');
      process.exit(1);
  }
}
