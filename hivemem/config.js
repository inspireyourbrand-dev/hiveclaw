/**
 * HiveMem Configuration
 *
 * Centralized config for the memory subsystem.
 * Reads from environment variables with sensible defaults.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const config = {
  // Storage backend: 'sqlite' (default) or 'tidb' (external)
  storage: process.env.HIVEMEM_STORAGE || 'sqlite',

  // SQLite settings
  sqlite: {
    path: process.env.HIVEMEM_SQLITE_PATH || join(ROOT, 'data', 'hivemem.db'),
  },

  // External mem9/TiDB settings
  tidb: {
    dsn: process.env.HIVEMEM_DSN || null,
  },

  // Server settings
  server: {
    enabled: process.env.HIVEMEM_ENABLED !== 'false',
    port: parseInt(process.env.HIVEMEM_PORT || '8090'),
  },

  // Embedding settings (for vector search)
  embeddings: {
    provider: process.env.HIVEMEM_EMBED_PROVIDER || 'local',
    apiKey: process.env.HIVEMEM_EMBED_API_KEY || null,
    model: process.env.HIVEMEM_EMBED_MODEL || 'text-embedding-3-small',
  },

  // Limits
  limits: {
    maxMemorySize: 50000,   // characters per memory
    maxSearchResults: 100,
    maxTagsPerMemory: 20,
    rateLimitPerMin: 100,
  },
};

export default config;
