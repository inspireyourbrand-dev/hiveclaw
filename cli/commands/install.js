/**
 * HiveClaw Setup Wizard
 *
 * Guides users through first-time configuration:
 *   1. Checks prerequisites (Node.js, npm, OpenClaw)
 *   2. Creates .env from .env.example
 *   3. Installs npm dependencies
 *   4. Initializes SQLite memory database
 *   5. Validates all components
 */

import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

function log(icon, msg) {
  console.log(`  ${icon}  ${msg}`);
}

export default async function setup(args) {
  console.log('');
  console.log('  ================================================================');
  console.log('     HiveClaw Setup Wizard');
  console.log('     by HivePowered.AI');
  console.log('  ================================================================');
  console.log('');

  let passed = 0;
  let total = 0;

  // 1. Check Node.js version
  total++;
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (major >= 22) {
    log('\u2705', `Node.js ${nodeVersion} detected`);
    passed++;
  } else {
    log('\u274C', `Node.js ${nodeVersion} detected — v22+ required`);
    log('  ', 'Install from: https://nodejs.org');
  }

  // 2. Check if OpenClaw is installed
  total++;
  try {
    const ocVersion = execSync('openclaw --version 2>&1', { encoding: 'utf-8' }).trim();
    log('\u2705', `OpenClaw ${ocVersion} detected`);
    passed++;
  } catch {
    log('\u26A0\uFE0F', 'OpenClaw not found — install with: npm install -g openclaw@latest');
    log('  ', 'HiveClaw works standalone, but full features require OpenClaw');
  }

  // 3. Create .env if missing
  total++;
  const envPath = join(ROOT, '.env');
  const envExample = join(ROOT, '.env.example');
  if (!existsSync(envPath) && existsSync(envExample)) {
    copyFileSync(envExample, envPath);
    log('\u2705', 'Created .env from .env.example');
    passed++;
  } else if (existsSync(envPath)) {
    log('\u2705', '.env already exists');
    passed++;
  } else {
    log('\u274C', '.env.example not found');
  }

  // 4. Install npm dependencies
  total++;
  try {
    log('\u23F3', 'Installing dependencies...');
    execSync('npm install', { cwd: ROOT, stdio: 'pipe' });
    log('\u2705', 'Dependencies installed');
    passed++;
  } catch (err) {
    log('\u274C', `npm install failed: ${err.message}`);
  }

  // 5. Create data directory for SQLite
  total++;
  const dataDir = join(ROOT, 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  log('\u2705', 'Data directory ready');
  passed++;

  // 6. Validate key files exist
  total++;
  const requiredFiles = [
    'gateway/index.js',
    'hivecontrol/index.html',
    'hiveworkflow/engine.js',
    'agents/AGENTS.md',
    'package.json',
  ];
  const missing = requiredFiles.filter(f => !existsSync(join(ROOT, f)));
  if (missing.length === 0) {
    log('\u2705', 'All core files present');
    passed++;
  } else {
    log('\u274C', `Missing files: ${missing.join(', ')}`);
  }

  // 7. Check screens
  total++;
  const screens = ['dashboard', 'tasks', 'calendar', 'memory', 'projects', 'documents', 'team', 'office', 'workflow'];
  const missingScreens = screens.filter(s => !existsSync(join(ROOT, 'hivecontrol', 'screens', `${s}.html`)));
  if (missingScreens.length === 0) {
    log('\u2705', `All ${screens.length} HiveControl screens present`);
    passed++;
  } else {
    log('\u26A0\uFE0F', `Missing screens: ${missingScreens.join(', ')}`);
  }

  // Summary
  console.log('');
  console.log('  ----------------------------------------------------------------');
  console.log(`  Setup: ${passed}/${total} checks passed`);
  console.log('');

  if (passed === total) {
    console.log('  \u2705 HiveClaw is ready!');
    console.log('');
    console.log('  Start the gateway:');
    console.log('    hiveclaw start');
    console.log('');
    console.log('  Or with npm:');
    console.log('    npm start');
    console.log('');
    console.log('  Then open the dashboard:');
    console.log('    http://localhost:18789/__hiveclaw__/hivecontrol/');
    console.log('');
  } else {
    console.log('  \u26A0\uFE0F  Some checks failed. Fix the issues above and run:');
    console.log('    hiveclaw setup');
    console.log('');
  }
}
