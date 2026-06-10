// Hook 系统类型定义 — Agent 生命周期事件钩子

import type { ChatMessage } from '@/lib/ai/types';
import type { ToolResult } from '@/lib/agent/types';

export type HookEvent =
  | 'agent:start'
  | 'agent:end'
  | 'pre_llm_call'
  | 'post_turn'
  | 'pre_tool_call'
  | 'post_tool_call';

export interface HookContext {
  /** 触发事件（由 HookManager 自动注入） */
  event?: HookEvent;
  /** 用户 ID */
  userId: string;
  /** 会话 ID */
  sessionId?: string;
  /** Agent 配置 */
  config?: Record<string, unknown>;
  /** pre_llm_call / post_turn: 消息列表 */
  messages?: ChatMessage[];
  /** pre_tool_call / post_tool_call: 工具名 */
  toolName?: string;
  /** pre_tool_call / post_tool_call: 工具参数 */
  toolArgs?: Record<string, unknown>;
  /** post_tool_call: 工具结果 */
  toolResult?: ToolResult;
  /** post_tool_call: 工具执行耗时 ms */
  toolDuration?: number;
  /** agent:end: 总迭代数 */
  iterations?: number;
  /** agent:end: 使用的工具列表 */
  toolsUsed?: string[];
  /** agent:end: 最终回复 */
  response?: string;
  /** 自定义数据（hook 之间传递） */
  custom?: Record<string, unknown>;
}

export type HookHandler = (ctx: HookContext) => unknown;

export interface HookDefinition {
  /** 钩子名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 监听的事件列表 */
  events: HookEvent[];
  /** 处理函数 */
  handler: HookHandler;
}
