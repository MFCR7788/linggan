// 灵集 AI V2.0 — 助手模块统一导出

// Types
export type {
  MemoryEntry,
  MemoryCategory,
  MemorySearchResult,
  MemoryProvider,
  KnowledgeResult,
  KnowledgeProvider,
  SearchOptions,
  SkillDefinition,
  SkillMatch,
  SkillInvocation,
  SkillResult,
  PipelineContext,
  PipelineResult,
  DetectedIntent,
  IntentType,
  GenType,
  EnhancedMessage,
} from './types';

// Memory
export { MemoryManager } from './memory/manager';
export { BuiltinMemoryProvider } from './memory/builtin-provider';
export { extractMemories } from './memory/extractor';
export { sanitizeContext, buildMemoryContextBlock } from './memory/provider';

// Knowledge
export { KnowledgeManager } from './knowledge/manager';
export { InspirationKnowledgeProvider } from './knowledge/inspiration-provider';
export { PublicKnowledgeProvider } from './knowledge/public-provider';
export { WebSearchProvider } from './knowledge/web-search-provider';

// Embedding
export { generateEmbedding, generateEmbeddings, indexContentItem, indexContentItemsBatch } from './embedding';

// Intent
export { detectIntent } from './intent';
export type { DetectedIntent as IntentResult, GenType as GenerationType } from './intent';

// Prompts
export { LINGJI_IDENTITY, GLOBAL_CAPABILITIES, PROMPT_MODULES, buildPrompt, GEN_JSON_TEMPLATE } from './prompts';

// Pipeline
export { ContextPipeline } from './pipeline';
export type { PipelineDeps, PipelineInput } from './pipeline';

// Skills
export { SkillRegistry } from './skills/registry';
export { SkillMatcher } from './skills/matcher';
export { SkillExecutor } from './skills/executor';
export { SkillsHub } from './skills/hub';
export type { DisclosureLevel, SkillsHubOptions } from './skills/hub';

// Agent
export { ToolRegistry, registerAllBuiltinTools, agentLoop, agentStreamLoop } from '../agent';
export { AGENT_SYSTEM_PROMPT, DEFAULT_CONFIG } from '../agent';
export type { ToolDefinition, ToolContext, ToolResult, AgentEvent, AgentConfig, ToolCallRequest } from '../agent';
