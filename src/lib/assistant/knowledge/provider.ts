// KnowledgeProvider 接口 — 可插拔知识源
// 优先级：Personal > Public > Web Search

import type { KnowledgeResult, SearchOptions } from '../types';

export interface KnowledgeProvider {
  readonly name: string;
  readonly priority: number;
  isAvailable(): Promise<boolean>;
  search(query: string, embedding: number[], opts: SearchOptions): Promise<KnowledgeResult[]>;
}
