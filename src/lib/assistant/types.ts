// 灵集 AI V2.0 — 助手核心类型定义

import type { ChatMessage } from '@/lib/ai/types';

// ====== 记忆 ======

export interface MemoryEntry {
  id: string;
  userId: string;
  category: MemoryCategory;
  key?: string;
  value: string;
  importance: number;
  sourceSessionId?: string;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
}

export type MemoryCategory = 'profile' | 'preference' | 'fact' | 'workflow' | 'general';

export interface MemorySearchResult {
  id: string;
  category: MemoryCategory;
  value: string;
  importance: number;
  similarity: number;
}

export interface MemoryProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  initialize(userId: string): Promise<void>;

  prefetch(query: string, embedding: number[]): Promise<MemorySearchResult[]>;
  save(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry>;
  update(id: string, patch: Partial<Pick<MemoryEntry, 'value' | 'importance' | 'category'>>): Promise<void>;
  delete(id: string): Promise<void>;

  onSessionEnd?(sessionId: string, messages: ChatMessage[]): Promise<void>;
  shutdown?(): Promise<void>;
  systemPromptBlock?(): string;
}

// ====== 知识库 ======

export interface KnowledgeResult {
  id: string;
  title: string;
  content: string;
  category?: string;
  source?: string;
  similarity: number;
}

export interface KnowledgeProvider {
  readonly name: string;
  readonly priority: number;
  isAvailable(): Promise<boolean>;
  search(query: string, embedding: number[], opts: SearchOptions): Promise<KnowledgeResult[]>;
}

export interface SearchOptions {
  limit: number;
  similarityThreshold: number;
  userId?: string;
}

// ====== 技能 ======

export interface SkillDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category?: string;
  tags: string[];
  promptTemplate: string;
  parameterSchema?: Record<string, unknown>;
  linkedFiles?: Record<string, string[]>;
  linkedContent?: Record<string, string>;
  /** 绑定的工具名称列表（技能匹配后自动注册这些工具） */
  boundTools?: string[];
  /** 必须可用的工具（不可用时技能不激活） */
  requiredTools?: string[];
  version: string;
  authorId?: string;
  visibility: 'private' | 'public' | 'official';
  installCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SkillMatch {
  skill: SkillDefinition;
  score: number;
}

export interface SkillInvocation {
  skillId: string;
  skillName: string;
  params: Record<string, unknown>;
}

export interface SkillResult {
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

// ====== 上下文流水线 ======

export interface PipelineContext {
  memoryBlock: string;
  inspirations: KnowledgeResult[];
  knowledgeResults: KnowledgeResult[];
  webSearchResults?: string;
  historyMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  matchedSkills: SkillMatch[];
  skillInvocations: SkillInvocation[];
}

export interface PipelineResult {
  systemPrompt: string;
  userPrompt: string;
  context: PipelineContext;
  requiresJSON: boolean;
  intentType: IntentType;
}

// ====== 意图（从 route.ts 迁移） ======

export type IntentType = 'writing' | 'knowledge' | 'life' | 'schedule' | 'office' | 'image' | 'video' | 'coding' | 'creative' | 'legal' | 'weather';
export type GenType = 'text2img' | 'img2img' | 'text2vid' | 'img2vid' | 'vid2vid';

export interface DetectedIntent {
  type: IntentType;
  label: string;
  needsChat: boolean;
  hasImage: boolean;
  hasVideo: boolean;
  description: string;
  wantsGeneration: boolean;
  genType?: GenType;
}

// ====== 消息增强 ======

export interface EnhancedMessage {
  role: 'user' | 'assistant';
  content: string;
  sessionId?: string;
  contextUsed?: {
    memoriesUsed: number;
    inspirationsUsed: number;
    knowledgeUsed: number;
    webSearchUsed: boolean;
    skillsUsed: string[];
  };
}
