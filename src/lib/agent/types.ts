// Agent 核心类型 — Tool Registry / Agent Loop / SSE Streaming

import type { ChatMessage } from '@/lib/ai/types';

// ====== 工具定义 ======

export interface ToolDefinition {
  name: string;
  description: string;              // LLM 可见的工具描述
  parameters: Record<string, unknown>; // JSON Schema
  handler: ToolHandler;
  requiresConfirmation?: boolean;   // 是否需要用户确认
  isLongRunning?: boolean;          // 长时间运行（如视频生成）
}

export interface ToolContext {
  userId: string;
  sessionId?: string;
  signal?: AbortSignal;
}

export interface ToolResult {
  success: boolean;
  output: string;    // 人类可读的输出文本
  data?: unknown;    // 结构化数据（图片 URL、taskId 等）
  error?: string;
}

export type ToolHandler = (
  params: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>;

// ====== Agent 事件（SSE 传输） ======

export type AgentEvent =
  | { type: 'thinking'; message: string }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: ToolResult }
  | { type: 'delta'; content: string }
  | { type: 'done'; response: string; summary?: string; tokensUsed?: number; toolsUsed?: string[]; model?: string }
  | { type: 'error'; message: string };

// ====== Agent 配置 ======

export interface AgentConfig {
  maxIterations: number;
  model: string;
  temperature: number;
  maxTokens: number;
  conversationalMode: boolean;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxIterations: 10,
  model: 'deepseek-v3',
  temperature: 0.7,
  maxTokens: 4096,
  conversationalMode: false,
};

// ====== Tool Call 类型（OpenAI 兼容） ======

export interface ToolCallRequest {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LLMToolResponse {
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: ToolCallRequest[];
  };
}

// ====== Streaming chunk 类型 ======

export type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'tool_calls'; calls: ToolCallRequest[] };

// ====== Agent 消息类型 ======

export interface AgentMessage extends ChatMessage {
  tool_calls?: ToolCallRequest[];
  tool_call_id?: string;
  name?: string;
}
