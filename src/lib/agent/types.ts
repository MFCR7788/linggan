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

export interface AgentPresets {
  avatar?: {
    name: string;
    avatarId: string;
    status: 'ready' | 'training' | 'error';
  };
  animate?: {
    name: string;
    imageUrl: string;
  };
}

export interface ToolContext {
  userId: string;
  sessionId?: string;
  signal?: AbortSignal;
  presets?: AgentPresets;
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

// ====== 目标分解 ======

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  expectedTools: string[];
  done: boolean;
}

export interface ExecutionPlan {
  goal: string;
  subgoals: PlanStep[];
}

// ====== 本地视频剪辑方案 ======

/** 单个剪辑操作 */
export type EditOperation =
  | { type: 'trim'; source: string; start: number; end: number; label?: string }
  | { type: 'transcode'; source: string; width: number; height: number; fps?: number; label?: string }
  | { type: 'merge'; sources: string[]; label?: string }
  | { type: 'audio_overlay'; source: string; audioUrl: string; volume?: number; mix?: boolean; label?: string }
  | { type: 'audio_replace'; source: string; audioUrl: string; label?: string }
  | { type: 'speed'; source: string; rate: number; label?: string }
  | { type: 'subtitle'; source: string; subtitles: Array<{ text: string; start: number; end: number }>; label?: string };

/** 剪辑方案 */
export interface EditPlan {
  /** 方案目标描述 */
  goal: string;
  /** 输入素材列表（用户上传的文件引用） */
  inputs: Array<{ name: string; description?: string }>;
  /** 操作步骤（按序执行） */
  operations: EditOperation[];
  /** 输出规格 */
  output: {
    format: 'mp4' | 'mov' | 'webm';
    label: string;
    estimatedSeconds: number;
  };
}

// ====== Agent 事件（SSE 传输） ======

export type AgentEvent =
  | { type: 'thinking'; message: string }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: ToolResult }
  | { type: 'delta'; content: string }
  | { type: 'skills_matched'; recommendations: Array<{ name: string; displayName: string; score: number }> }
  | { type: 'plan_generated'; plan: ExecutionPlan }
  | { type: 'edit_plan_generated'; editPlan: EditPlan }
  | { type: 'plan_progress'; goal: string; totalSteps: number; completedSteps: number; currentStep: string | null }
  | { type: 'done'; response: string; summary?: string; tokensUsed?: number; toolsUsed?: string[]; model?: string; toolResults?: Array<{ tool: string; params: Record<string, unknown>; result: ToolResult }> }
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
  temperature: 0.3,
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

// ====== Token 计数 ======

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ====== Agent 循环选项 (依赖注入) ======

export interface AgentLoopOptions {
  /** 自定义 model router（默认 defaultModelRouter） */
  modelRouter?: import('@/lib/providers/model-router').ModelRouter;
  /** 自定义 context engine（默认新建 ContextEngine） */
  contextEngine?: import('@/lib/agent/context-engine').ContextEngine;
  /** Hook 管理器 */
  hooks?: import('@/lib/hooks/manager').HookManager;
  /** 工具调用超时 ms（默认 120000） */
  toolTimeoutMs?: number;
}

// ====== Agent 消息类型 ======

export interface AgentMessage extends ChatMessage {
  tool_calls?: ToolCallRequest[];
  tool_call_id?: string;
  name?: string;
}
