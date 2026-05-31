// 数据库迁移脚本 — 通过 API 端点执行
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;

export async function runMigrations() {
  if (!DATABASE_URL) {
    console.warn('DATABASE_URL 未配置，跳过数据库迁移');
    return;
  }

  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    // 读取迁移文件
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/003_add_chat_tables.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    // 执行迁移
    await pool.query(sql);
    console.log('✅ 数据库迁移完成（chat_sessions + chat_messages）');
  } catch (error) {
    console.error('❌ 数据库迁移失败:', error);
  } finally {
    await pool.end();
  }
}
