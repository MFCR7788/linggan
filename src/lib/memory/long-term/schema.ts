// SQLite schema + migration management
// 参考 Hermes hermes_state.py SCHEMA_VERSION 模式

import Database from 'better-sqlite3';

type DB = InstanceType<typeof Database>;

export const SCHEMA_VERSION = 1;

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS user_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('preference', 'fact', 'style', 'workflow')),
        content TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
        source_session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
        access_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_memories_user ON user_memories(user_id);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON user_memories(user_id, type);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON user_memories(user_id, importance DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
      );

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
];

export function getCurrentVersion(db: DB): number {
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get();
  if (!tableExists) return 0;

  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as
    | { v: number }
    | undefined;
  return row?.v ?? 0;
}

export function migrate(db: DB): void {
  const current = getCurrentVersion(db);

  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;

    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version);
      db.exec('COMMIT');
      console.log(`[LongTermMemory] 迁移到 v${m.version} 完成`);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`迁移 v${m.version} 失败: ${e}`);
    }
  }
}
