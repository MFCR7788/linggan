// 跨会话长期记忆类型定义

export type LongTermMemoryType = 'preference' | 'fact' | 'style' | 'workflow';

export interface LongTermMemoryEntry {
  id: number;
  user_id: string;
  type: LongTermMemoryType;
  content: string;
  importance: number; // 1-10，低于 3 不参与检索
  source_session_id: string | null;
  created_at: string;
  last_accessed_at: string;
  access_count: number;
}

export interface MemorySearchParams {
  userId: string;
  query: string;
  limit?: number; // 默认 10
  minImportance?: number; // 默认 3
  type?: LongTermMemoryType;
}

export interface MemoryExtractResult {
  type: LongTermMemoryType;
  content: string;
  importance: number;
}
