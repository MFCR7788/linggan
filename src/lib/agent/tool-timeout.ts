// ToolTimeout — 工具调用超时包装器 + 错误恢复引导
// 为每个工具调用设置独立超时，防止某个工具 hang 住整个 agent 循环
// 工具失败时自动注入替代方案建议，引导模型尝试降级路径

import type { ToolHandler, ToolContext, ToolResult } from './types';
import { safeErrorText } from '@/lib/ai/errors';

const DEFAULT_TOOL_TIMEOUT_MS = 120_000; // 2 分钟
const LONG_RUNNING_TIMEOUT_MS = 300_000; // 5 分钟（视频生成等）
const PRODUCT_VIDEO_TIMEOUT_MS = 600_000; // 10 分钟（Seedance 3镜+TTS+合成）

export interface TimeoutOptions {
  /** 超时毫秒数，默认 120000 */
  timeoutMs?: number;
  /** 是否为长时运行工具（视频生成等），超时 5 分钟 */
  isLongRunning?: boolean;
}

/**
 * 根据失败的工具名和错误信息，生成替代方案建议
 * 帮助模型在工具失败后自动选择降级路径
 */
function getRecoverySuggestion(toolName: string, errorText: string): string {
  const err = errorText.toLowerCase();

  // 产品视频（一张图出片）失败 — 不要建议 compose/hyperframes
  if (toolName === 'generate_product_video') {
    if (err.includes('timeout') || err.includes('超时')) {
      return '一张图出片超时，告知用户视频生成耗时较长，正在重试或建议稍后再试。不要改用其他工具替代。';
    }
    return '一张图出片失败，告知用户并建议重试。不要用 compose_video 或 hyperframes 替代。';
  }

  // 视频生成失败 → 建议降级路径
  if (toolName.startsWith('generate_') && toolName.includes('video')) {
    if (err.includes('timeout') || err.includes('超时')) {
      return '视频生成耗时较长，可尝试：1) 缩短时长 2) 告知用户稍后重试';
    }
    if (err.includes('quota') || err.includes('limit') || err.includes('rate')) {
      return '当前视频引擎繁忙，告知用户稍后重试';
    }
    return '视频生成失败，告知用户并提供重试';
  }

  // 图片生成失败
  if (toolName.includes('image') || toolName.includes('grid')) {
    if (err.includes('timeout') || err.includes('超时')) {
      return '图片生成超时，可尝试：1) 降低分辨率/尺寸 2) 减少数量 3) 简化 prompt';
    }
    return '图片生成失败，可尝试：1) 简化 prompt 描述 2) 减少生成数量 3) 尝试不同风格';
  }

  // 网络搜索/内容提取失败
  if (toolName.includes('search') || toolName.includes('extract')) {
    return '搜索/提取失败，可能是网络问题或目标不可达。可尝试：1) 换用其他搜索源 2) 基于已有知识回答 3) 建议用户手动提供链接内容';
  }

  // TTS/配音失败
  if (toolName.includes('speech') || toolName.includes('tts')) {
    return '配音生成失败，可尝试：1) 换用其他音色 2) 缩短文本 3) 仅输出文案，标注"建议配音"';
  }

  // 通用降级建议
  if (err.includes('timeout') || err.includes('超时')) {
    return '操作超时，可尝试简化参数后重试，或跳过此步继续后续流程';
  }
  if (err.includes('network') || err.includes('fetch') || err.includes('econn')) {
    return '网络异常，可稍后重试，或跳过此步告知用户部分结果';
  }

  return '';
}

/**
 * 带超时的工具执行包装器 + 错误恢复引导
 * 超时后返回 `{ success: false, error: "..." }` 而不是抛异常
 * 失败时自动附加替代方案建议
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
    const toolName = ''; // 从 handler 无法直接获取名称，在调用方注入

    if (e instanceof ToolTimeoutError) {
      const recovery = getRecoverySuggestion(toolName, 'timeout');
      return {
        success: false,
        output: '',
        error: safeErrorText(`工具执行超时 (${timeoutMs / 1000}s)。${recovery}`),
      };
    }

    const errorText = safeErrorText(e instanceof Error ? e.message : String(e));
    const recovery = getRecoverySuggestion(toolName, errorText);
    const fullError = recovery ? `${errorText}\n\n💡 替代方案: ${recovery}` : errorText;

    return {
      success: false,
      output: '',
      error: fullError,
    };
  }
}

/** 为已知工具名注入恢复引导的执行包装器（含 API key 剥离） */
export async function executeWithTimeoutAndRecovery(
  toolName: string,
  handler: ToolHandler,
  params: Record<string, unknown>,
  context: ToolContext,
  options: TimeoutOptions = {}
): Promise<ToolResult> {
  const timeoutMs = toolName === 'generate_product_video'
    ? PRODUCT_VIDEO_TIMEOUT_MS
    : (options.isLongRunning
      ? LONG_RUNNING_TIMEOUT_MS
      : (options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS));

  if (context.signal?.aborted) {
    return { success: false, output: '', error: '操作已取消' };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      handler(params, context),
      new Promise<ToolResult>((_, reject) => {
        timeoutId = setTimeout(() => reject(new ToolTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
    clearTimeout(timeoutId);
    return result;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof ToolTimeoutError) {
      const recovery = getRecoverySuggestion(toolName, 'timeout');
      return {
        success: false,
        output: '',
        error: safeErrorText(`工具执行超时 (${timeoutMs / 1000}s)。${recovery ? '\n\n💡 替代方案: ' + recovery : ''}`),
      };
    }

    const errorText = safeErrorText(e instanceof Error ? e.message : String(e));
    const recovery = getRecoverySuggestion(toolName, errorText);
    const fullError = recovery ? `${errorText}\n\n💡 替代方案: ${recovery}` : errorText;

    return {
      success: false,
      output: '',
      error: fullError,
    };
  }
}

class ToolTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Tool execution timed out after ${timeoutMs}ms`);
    this.name = 'ToolTimeoutError';
  }
}
