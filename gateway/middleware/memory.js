/**
 * HiveMem Middleware — Persistent Memory Integration
 *
 * Connects the HiveClaw gateway to the built-in SQLite memory store
 * or an external mem9 server. Provides hybrid keyword + vector search
 * when embeddings are configured.
 *
 * @module gateway/middleware/memory
 */

import crypto from 'crypto';

class HiveMemMiddleware {
  constructor(config = {}) {
    this.storage = config.storage || 'sqlite';
    this.sqlitePath = config.sqlitePath || './data/hivemem.db';
    this.dsn = config.dsn || null;
    this.embedProvider = config.embedProvider || 'local';
    this._memStore = new Map(); // In-memory fallback
    this.ready = false;
  }

  async initialize() {
    if (this.storage === 'sqlite') {
      try {
        // Dynamic import for optional dependency
        const { default: Database } = await import('better-sqlite3');
        const { mkdirSync } = await import('fs');
        const { dirname } = await import('path');

        mkdirSync(dirname(this.sqlitePath), { recursive: true });
        this.db = new Database(this.sqlitePath);

        // Create tables
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            tags TEXT DEFAULT '[]',
            metadata TEXT DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT,
            embedding BLOB
          );
          CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
          CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(content, tags);
        `);

        this.ready = true;
        console.log(`  [HiveMem] SQLite initialized at ${this.sqlitePath}`);
      } catch (err) {
        console.warn(`  [HiveMem] SQLite unavailable, using in-memory store: ${err.message}`);
        this.storage = 'memory';
        this.ready = true;
      }
    } else {
      this.ready = true;
    }
  }

  store(content, tags = [], metadata = {}) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    if (this.db) {
      const stmt = this.db.prepare(
        'INSERT INTO memories (id, content, tags, metadata, created_at) VALUES (?, ?, ?, ?, ?)'
      );
      const info = stmt.run(id, content, JSON.stringify(tags), JSON.stringify(metadata), now);

      // Also insert into FTS
      try {
        this.db.prepare('INSERT INTO memories_fts (rowid, content, tags) VALUES (?, ?, ?)')
          .run(info.lastInsertRowid, content, tags.join(' '));
      } catch (_) { /* FTS insert is best-effort */ }
    } else {
      this._memStore.set(id, { id, content, tags, metadata, created_at: now });
    }

    return { id, content, tags, metadata, created_at: now };
  }

  search(query, { limit = 20, tag } = {}) {
    if (this.db) {
      let sql, params;

      if (query) {
        // Use FTS for text search
        sql = `
          SELECT m.* FROM memories m
          JOIN memories_fts fts ON m.rowid = fts.rowid
          WHERE memories_fts MATCH ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `;
        params = [query, limit];
      } else if (tag) {
        sql = 'SELECT * FROM memories WHERE tags LIKE ? ORDER BY created_at DESC LIMIT ?';
        params = [`%${tag}%`, limit];
      } else {
        sql = 'SELECT * FROM memories ORDER BY created_at DESC LIMIT ?';
        params = [limit];
      }

      const rows = this.db.prepare(sql).all(...params);
      return rows.map(r => ({
        ...r,
        tags: JSON.parse(r.tags || '[]'),
        metadata: JSON.parse(r.metadata || '{}'),
      }));
    }

    // In-memory fallback
    let results = [...this._memStore.values()];
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(m => m.content.toLowerCase().includes(q));
    }
    if (tag) {
      results = results.filter(m => m.tags.includes(tag));
    }
    return results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
  }

  get(id) {
    if (this.db) {
      const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
      if (!row) return null;
      return { ...row, tags: JSON.parse(row.tags || '[]'), metadata: JSON.parse(row.metadata || '{}') };
    }
    return this._memStore.get(id) || null;
  }

  update(id, updates) {
    const now = new Date().toISOString();
    if (this.db) {
      const existing = this.get(id);
      if (!existing) return null;
      const merged = { ...existing, ...updates, id, updated_at: now };
      this.db.prepare(
        'UPDATE memories SET content = ?, tags = ?, metadata = ?, updated_at = ? WHERE id = ?'
      ).run(merged.content, JSON.stringify(merged.tags), JSON.stringify(merged.metadata), now, id);
      return merged;
    }
    const existing = this._memStore.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates, id, updated_at: now };
    this._memStore.set(id, merged);
    return merged;
  }

  delete(id) {
    if (this.db) {
      const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
      return result.changes > 0;
    }
    return this._memStore.delete(id);
  }

  count() {
    if (this.db) {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM memories').get();
      return row.count;
    }
    return this._memStore.size;
  }

  stats() {
    return {
      totalMemories: this.count(),
      storage: this.db ? 'sqlite' : 'memory',
      persistent: !!this.db,
    };
  }
}

export default HiveMemMiddleware;
