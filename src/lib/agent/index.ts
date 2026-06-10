// Agent 模块 — 流式多轮 Agent + 工具调用 + 小白友好对话

export { ToolRegistry } from './tools/registry';
export type { ToolEntry } from './tools/registry';
export { registerAllBuiltinTools } from './tools/builtin';
export { agentLoop } from './loop';
export { agentStreamLoop } from './stream';
export { AGENT_SYSTEM_PROMPT, DEFAULT_CONFIG } from './conversational';
export { ContextEngine } from './context-engine';
export { executeWithTimeout } from './tool-timeout';
export { ToolPermissionManager } from './tools/permissions';
export { shouldParallelizeBatch, groupToolCallsForExecution } from './tools/parallelizer';
export type { ToolDefinition, ToolContext, ToolResult, AgentEvent, AgentConfig, AgentLoopOptions, ToolCallRequest, TokenUsage } from './types';
export { DEFAULT_AGENT_CONFIG } from './types';
