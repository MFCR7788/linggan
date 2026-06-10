// Agent 模块 — 流式多轮 Agent + 工具调用 + 小白友好对话

export { ToolRegistry } from './tools/registry';
export { registerAllBuiltinTools } from './tools/builtin';
export { agentLoop } from './loop';
export { agentStreamLoop } from './stream';
export { AGENT_SYSTEM_PROMPT, DEFAULT_CONFIG } from './conversational';
export type { ToolDefinition, ToolContext, ToolResult, AgentEvent, AgentConfig, ToolCallRequest } from './types';
export { DEFAULT_AGENT_CONFIG } from './types';
