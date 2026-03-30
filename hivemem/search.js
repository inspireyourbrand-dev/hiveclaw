/**
 * HiveMem Search Engine
 *
 * Provides hybrid search combining:
 *   - Full-text search (SQLite FTS5)
 *   - Keyword matching
 *   - Tag filtering
 *   - Recency scoring
 *
 * When embeddings are configured, also supports vector similarity search.
 *
 * @module hivemem/search
 */

class HiveMemSearch {
  constructor(db = null) {
    this.db = db;
  }

  /**
   * Hybrid search combining FTS + keyword + recency
   */
  search(query, options = {}) {
    const { tag, limit = 20, offset = 0, sort = 'relevance' } = options;

    if (!this.db) {
      return { memories: [], total: 0 };
    }

    // Build query based on available indexes
    try {
      if (query && query.trim()) {
        // FTS search with rank scoring
        const ftsQuery = this._sanitizeFtsQuery(query);
        const sql = `
          SELECT m.*, rank
          FROM memories m
          JOIN memories_fts fts ON m.rowid = fts.rowid
          WHERE memories_fts MATCH ?
          ${tag ? "AND m.tags LIKE ?" : ""}
          ORDER BY ${sort === 'date' ? 'm.created_at DESC' : 'rank'}
          LIMIT ? OFFSET ?
        `;

        const params = tag
          ? [ftsQuery, `%"${tag}"%`, limit, offset]
          : [ftsQuery, limit, offset];

        const rows = this.db.prepare(sql).all(...params);
        return {
          memories: rows.map(this._parseRow),
          total: rows.length,
          query: ftsQuery,
          method: 'fts',
        };
      }
    } catch {
      // FTS might fail on complex queries, fall back to LIKE
    }

    // Fallback: LIKE-based keyword search
    let sql = 'SELECT * FROM memories WHERE 1=1';
    const params = [];

    if (query) {
      sql += ' AND content LIKE ?';
      params.push(`%${query}%`);
    }
    if (tag) {
      sql += ' AND tags LIKE ?';
      params.push(`%"${tag}"%`);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params);
    return {
      memories: rows.map(this._parseRow),
      total: rows.length,
      query,
      method: 'keyword',
    };
  }

  /**
   * Sanitize query for FTS5 (escape special chars)
   */
  _sanitizeFtsQuery(query) {
    // FTS5 special chars: AND OR NOT ( ) " *
    return query
      .replace(/[()]/g, '')
      .replace(/"/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map(term => `"${term}"`)
      .join(' OR ');
  }

  /**
   * Parse a database row into a memory object
   */
  _parseRow(row) {
    return {
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }
}

export default HiveMemSearch;
