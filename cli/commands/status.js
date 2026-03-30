/**
 * HiveClaw Status & Doctor Commands
 *
 * Shows system health and diagnoses common issues.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, statSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

function log(icon, msg) {
  console.log(`  ${icon}  ${msg}`);
}

export default async function status(args, command = 'status') {
  const port = process.env.OPENCLAW_GATEWAY_PORT || '18789';
  const host = process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1';
  const baseUrl = `http://${host}:${port}`;

  console.log('');
  console.log(`  HiveClaw ${command === 'doctor' ? 'Doctor' : 'Status'}`);
  console.log('  ================================');
  console.log('');

  // Check if gateway is running
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();

    log('\u2705', `Gateway running on ${baseUrl}`);
    log('  ', `Uptime: ${Math.floor(data.uptime)}s`);
    log('  ', `Version: ${data.version}`);
    console.log('');

    for (const [component, state] of Object.entries(data.components)) {
      const icon = state === 'running' || state === 'enabled' ? '\u2705' : '\u26A0\uFE0F';
      log(icon, `${component}: ${state}`);
    }
  } catch {
    log('\u274C', `Gateway not responding on ${baseUrl}`);
    log('  ', 'Start with: hiveclaw start');
  }

  if (command === 'doctor') {
    console.log('');
    console.log('  Diagnostics');
    console.log('  -----------');

    // Node version
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0]);
    log(major >= 22 ? '\u2705' : '\u274C', `Node.js ${nodeVersion} (need v22+)`);

    // OpenClaw
    try {
      execSync('openclaw --version 2>&1', { encoding: 'utf-8' });
      log('\u2705', 'OpenClaw installed');
    } catch {
      log('\u26A0\uFE0F', 'OpenClaw not installed (optional)');
    }

    // .env
    log(existsSync(join(ROOT, '.env')) ? '\u2705' : '\u26A0\uFE0F', '.env configuration');

    // Data directory
    log(existsSync(join(ROOT, 'data')) ? '\u2705' : '\u26A0\uFE0F', 'Data directory');

    // node_modules
    log(existsSync(join(ROOT, 'node_modules')) ? '\u2705' : '\u274C', 'Dependencies installed');

    // HiveControl screens
    const screens = ['dashboard', 'tasks', 'calendar', 'memory', 'projects', 'documents', 'team', 'office', 'workflow'];
    const allScreens = screens.every(s => existsSync(join(ROOT, 'hivecontrol', 'screens', `${s}.html`)));
    log(allScreens ? '\u2705' : '\u274C', `HiveControl screens (${screens.length})`);

    // SQLite database
    const dbPath = join(ROOT, 'data', 'hivemem.db');
    if (existsSync(dbPath)) {
      const size = statSync(dbPath).size;
      log('\u2705', `HiveMem database (${(size / 1024).toFixed(1)} KB)`);
    } else {
      log('\u26A0\uFE0F', 'HiveMem database not yet created (starts on first run)');
    }
  }

  console.log('');
}

export async function showAgents() {
  const port = process.env.OPENCLAW_GATEWAY_PORT || '18789';
  const host = process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1';

  console.log('');
  console.log('  HiveClaw Agent Swarm');
  console.log('  ====================');
  console.log('');

  try {
    const res = await fetch(`http://${host}:${port}/api/v1/agents`);
    const data = await res.json();

    console.log(`  Orchestrator: ${data.orchestrator}`);
    console.log('');
    console.log('  AGENT       ROLE                      STATUS');
    console.log('  -------     ----------------------    ------');
    for (const agent of data.agents) {
      const name = agent.name.padEnd(12);
      const role = agent.role.padEnd(24);
      console.log(`  ${name}  ${role}  ${agent.status}`);
    }

    if (data.swarms.length > 0) {
      console.log('');
      console.log(`  Active swarms: ${data.swarms.length}`);
      for (const s of data.swarms) {
        console.log(`    - ${s.agent}: ${s.task} (${s.status})`);
      }
    }
  } catch {
    console.log('  Gateway not running. Start with: hiveclaw start');
    console.log('');
    console.log('  Registered agents (from config):');
    const agents = ['orion', 'atlas', 'forge', 'patch', 'quill', 'cipher', 'pixel', 'spark'];
    for (const a of agents) {
      console.log(`    - ${a}`);
    }
  }

  console.log('');
}
