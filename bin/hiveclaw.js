#!/usr/bin/env node

/**
 * HiveClaw CLI — Command-line interface for managing HiveClaw
 *
 * Usage:
 *   hiveclaw setup          — Interactive first-time setup wizard
 *   hiveclaw start          — Start the HiveClaw gateway
 *   hiveclaw status         — Show system status
 *   hiveclaw doctor         — Diagnose issues
 *   hiveclaw memory search  — Search persistent memories
 *   hiveclaw agents         — List agent swarm status
 *
 * @author HivePowered.AI
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Route to the CLI handler
import(join(ROOT, 'cli', 'index.js')).then(mod => {
  mod.default(process.argv.slice(2));
}).catch(err => {
  console.error('HiveClaw CLI failed to start:', err.message);
  process.exit(1);
});
