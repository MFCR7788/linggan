// LongTermMemoryStore — SQLite 持久化存储
// WAL 模式 + FTS5 全文搜索
// 参考 Hermes hermes_state.py SessionDB

import Database from 'better-sqlite3';
import path from 'path';
import { migrate, getCurrentVersion } from './schema';
import type { LongTermMemoryEntry, MemorySearchParams } from './types';

type DB = InstanceType<typeof Database>;

// Vercel serverless: process.cwd() 只读，用 /tmp 作为 SQLite 数据目录
const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
const DATA_DIR = isVercel ? path.join('/tmp', 'lingji-data') : path.join(process.cwd(), '.data');
const DEFAULT_DB_PATH = path.join(DATA_DIR, 'memories.db');

let globalDb: DB | null = null;

function openDb(dbPath?: string): DB | null {
  if (globalDb) return globalDb;

  const resolved = dbPath || DEFAULT_DB_PATH;

  try {
    const dir = path.dirname(resolved);
    const fs = require('fs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const db = new Database(resolved);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    const version = getCurrentVersion(db);
    if (version < 1) {
      migrate(db);
    }

    globalDb = db;
    return db;
  } catch (e) {
    console.warn('[LongTermMemory] SQLite 初始化失败，仅使用 Supabase 作为记忆存储:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

export class LongTermMemoryStore {
  private db: DB | null;
  private insertStmt: ReturnType<DB['prepare']> | null = null;
  private searchStmt: ReturnType<DB['prepare']> | null = null;
  private getByUserStmt: ReturnType<DB['prepare']> | null = null;
  private touchStmt: ReturnType<DB['prepare']> | null = null;
  private deleteStmt: ReturnType<DB['prepare']> | null = null;
  private updateImportanceStmt: ReturnType<DB['prepare']> | null = null;

  constructor(dbPath?: string) {
    this.db = openDb(dbPath);

    if (this.db) {
      this.insertStmt = this.db.prepare(`
        INSERT INTO user_memories (user_id, type, content, importance, source_session_id)
        VALUES (?, ?, ?, ?, ?)
      `);

      this.searchStmt = this.db.prepare(`
        SELECT m.* FROM user_memories m
        INNER JOIN memories_fts fts ON m.id = fts.rowid
        WHERE memories_fts MATCH ? AND m.user_id = ? AND m.importance >= ?
        ORDER BY rank
        LIMIT ?
      `);

      this.getByUserStmt = this.db.prepare(`
        SELECT * FROM user_memories
        WHERE user_id = ? AND importance >= ?
        ORDER BY importance DESC, last_accessed_at DESC
        LIMIT ?
      `);

      this.touchStmt = this.db.prepare(`
        UPDATE user_memories
        SET last_accessed_at = datetime('now'), access_count = access_count + 1
        WHERE id = ?
      `);

      this.deleteStmt = this.db.prepare(`
        DELETE FROM user_memories WHERE id = ? AND user_id = ?
      `);

      this.updateImportanceStmt = this.db.prepare(`
        UPDATE user_memories SET importance = ? WHERE id = ? AND user_id = ?
      `);
    }
  }

  isAvailable(): boolean {
    return this.db !== null;
  }

  insert(
    userId: string,
    type: LongTermMemoryEntry['type'],
    content: string,
    importance: number,
    sourceSessionId?: string
  ): LongTermMemoryEntry | null {
    if (!this.db || !this.insertStmt) return null;
    const clampedImportance = Math.max(1, Math.min(10, Math.round(importance)));
    const result = this.insertStmt.run(
      userId,
      type,
      content,
      clampedImportance,
      sourceSessionId || null
    );

    // 同步到 FTS 索引
    this.db
      .prepare('INSERT INTO memories_fts(rowid, content) VALUES (?, ?)')
      .run(result.lastInsertRowid, content);

    return {
      id: Number(result.lastInsertRowid),
      user_id: userId,
      type,
      content,
      importance: clampedImportance,
      source_session_id: sourceSessionId || null,
      created_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
      access_count: 0,
    };
  }

  search(params: MemorySearchParams): LongTermMemoryEntry[] {
    if (!this.db) return [];
    const { userId, query, limit = 10, minImportance = 3, type } = params;

    // trigram tokenizer 可直接使用原始查询文本
    const ftsQuery = query.replace(/['"]/g, '').trim();

    if (!ftsQuery) return this.getByUser(userId, limit, minImportance, type);

    try {
      let sql = `
        SELECT m.* FROM user_memories m
        INNER JOIN memories_fts fts ON m.id = fts.rowid
        WHERE memories_fts MATCH ? AND m.user_id = ? AND m.importance >= ?
      `;
      const bindings: unknown[] = [ftsQuery, userId, minImportance];

      if (type) {
        sql += ' AND m.type = ?';
        bindings.push(type);
      }

      sql += ' ORDER BY rank LIMIT ?';
      bindings.push(limit);

      const rows = this.db.prepare(sql).all(...bindings) as LongTermMemoryEntry[];

      // touch accessed memories
      for (const r of rows) {
        this.touchStmt.run(r.id);
      }

      return rows;
    } catch {
      // FTS 查询失败时回退到简单 LIKE 搜索
      return this.fallbackSearch(userId, query, limit, minImportance, type);
    }
  }

  private fallbackSearch(
    userId: string,
    query: string,
    limit: number,
    minImportance: number,
    type?: LongTermMemoryEntry['type']
  ): LongTermMemoryEntry[] {
    if (!this.db) return [];
    let sql = `
      SELECT * FROM user_memories
      WHERE user_id = ? AND importance >= ? AND content LIKE ?
    `;
    const bindings: unknown[] = [userId, minImportance, `%${query}%`];

    if (type) {
      sql += ' AND type = ?';
      bindings.push(type);
    }

    sql += ' ORDER BY importance DESC, last_accessed_at DESC LIMIT ?';
    bindings.push(limit);

    return this.db.prepare(sql).all(...bindings) as LongTermMemoryEntry[];
  }

  getByUser(
    userId: string,
    limit = 20,
    minImportance = 3,
    type?: LongTermMemoryEntry['type']
  ): LongTermMemoryEntry[] {
    if (!this.db) return [];
    let sql = 'SELECT * FROM user_memories WHERE user_id = ? AND importance >= ?';
    const bindings: unknown[] = [userId, minImportance];

    if (type) {
      sql += ' AND type = ?';
      bindings.push(type);
    }

    sql += ' ORDER BY importance DESC, last_accessed_at DESC LIMIT ?';
    bindings.push(limit);

    return this.db.prepare(sql).all(...bindings) as LongTermMemoryEntry[];
  }

  delete(id: number, userId: string): boolean {
    if (!this.db || !this.deleteStmt) return false;
    this.db.prepare('DELETE FROM memories_fts WHERE rowid = ?').run(id);
    const result = this.deleteStmt.run(id, userId);
    return result.changes > 0;
  }

  updateImportance(id: number, userId: string, importance: number): boolean {
    if (!this.db || !this.updateImportanceStmt) return false;
    const clamped = Math.max(1, Math.min(10, Math.round(importance)));
    const result = this.updateImportanceStmt.run(clamped, id, userId);
    return result.changes > 0;
  }

  /** 标记记忆为已访问（更新访问时间和计数） */
  touch(id: number): void {
    if (this.touchStmt) this.touchStmt.run(id);
  }

  /** 清理低重要性旧记忆 */
  cleanup(olderThanDays = 90, maxImportance = 2): number {
    if (!this.db) return 0;
    const result = this.db
      .prepare(
        `DELETE FROM user_memories
         WHERE importance <= ? AND created_at < datetime('now', ?)`
      )
      .run(maxImportance, `-${olderThanDays} days`);

    if (result.changes > 0) {
      // 重建 FTS 索引（清理已删除的行）
      this.db.exec("INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')");
    }

    return result.changes;
  }

  close(): void {
    if (this.db) this.db.close();
    if (globalDb === this.db) {
      globalDb = null;
    }
  }
}

/** 获取或创建全局单例 */
let globalStore: LongTermMemoryStore | null = null;

export function getLongTermMemoryStore(dbPath?: string): LongTermMemoryStore {
  if (!globalStore) {
    globalStore = new LongTermMemoryStore(dbPath);
  }
  return globalStore;
}
