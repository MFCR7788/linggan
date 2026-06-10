// ToolTimeout — 工具调用超时包装器
// 为每个工具调用设置独立超时，防止某个工具 hang 住整个 agent 循环

import type { ToolHandler, ToolContext, ToolResult } from './types';

const DEFAULT_TOOL_TIMEOUT_MS = 120_000; // 2 分钟
const LONG_RUNNING_TIMEOUT_MS = 300_000; // 5 分钟（视频生成等）

export interface TimeoutOptions {
  /** 超时毫秒数，默认 120000 */
  timeoutMs?: number;
  /** 是否为长时运行工具（视频生成等），超时 5 分钟 */
  isLongRunning?: boolean;
}

/**
 * 带超时的工具执行包装器
 * 超时后返回 `{ success: false, error: "工具执行超时" }` 而不是抛异常
 */
export async function executeWithTimeout(
  handler: ToolHandler,
  params: Record<string, unknown>,
  context: ToolContext,
  options: TimeoutOptions = {}
): Promise<ToolResult> {
  const timeoutMs = options.isLongRunning
    ? LONG_RUNNING_TIMEOUT_MS
    : (options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS);

  // 检查是否已被取消
  if (context.signal?.aborted) {
    return { success: false, output: '', error: '操作已取消' };
  }

  try {
    const result = await Promise.race([
      handler(params, context),
      new Promise<ToolResult>((_, reject) =>
        setTimeout(() => reject(new ToolTimeoutError(timeoutMs)), timeoutMs)
      ),
    ]);
    return result;
  } catch (e) {
    if (e instanceof ToolTimeoutError) {
      return {
        success: false,
        output: '',
        error: `工具执行超时 (${timeoutMs / 1000}s)`,
      };
    }
    return {
      success: false,
      output: '',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

class ToolTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Tool execution timed out after ${timeoutMs}ms`);
    this.name = 'ToolTimeoutError';
  }
}
