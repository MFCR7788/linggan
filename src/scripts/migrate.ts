// 数据库迁移脚本
// 运行方式: npx tsx src/scripts/migrate.ts
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('请设置 DATABASE_URL 环境变量');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    // 创建 chat_sessions 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        title TEXT DEFAULT '新对话',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ chat_sessions 表就绪');

    // 创建 chat_messages 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        user_id UUID NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('user', 'ai')),
        content TEXT NOT NULL DEFAULT '',
        content_type TEXT DEFAULT 'text',
        attachments JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ chat_messages 表就绪');

    // 索引
    await pool.query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at)');
    console.log('✅ 索引就绪');

    console.log('🎉 数据库迁移完成');
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
