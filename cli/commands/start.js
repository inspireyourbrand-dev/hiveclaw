/**
 * HiveClaw Start Command
 *
 * Starts the HiveClaw gateway with all enabled components.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

export default async function start(args) {
  const isDev = args.includes('--dev') || args.includes('--verbose');

  console.log('');
  console.log('  Starting HiveClaw Gateway...');
  console.log('');

  // Check if .env exists
  if (!existsSync(join(ROOT, '.env'))) {
    console.log('  No .env file found. Run "hiveclaw setup" first.');
    console.log('  Continuing with defaults...');
    console.log('');
  }

  // Load .env
  try {
    const envPath = join(ROOT, '.env');
    if (existsSync(envPath)) {
      const { readFileSync } = await import('fs');
      const envContent = readFileSync(envPath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...vals] = trimmed.split('=');
          if (key && vals.length) {
            process.env[key.trim()] = vals.join('=').trim();
          }
        }
      }
    }
  } catch (_) { /* .env loading is best-effort */ }

  // Start the gateway
  const gatewayPath = join(ROOT, 'gateway', 'index.js');

  if (isDev) {
    process.env.NODE_ENV = 'development';
    console.log('  [dev] Verbose mode enabled');
  }

  // Direct import for foreground mode
  await import(gatewayPath);
}
