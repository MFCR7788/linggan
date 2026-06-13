// AI Services - 百炼 DashScope 统一配置
// 安全修复：不再导出原始 API Key，改用 getter 函数（通过 runtime-config.ts 读取）
import { getDashScopeApiKey as _getDashScopeApiKey, getHeyGenApiKey as _getHeyGenApiKey } from '@/lib/runtime-config';

// DashScope API 端点
export const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DASHSCOPE_VIDEO_BASE = 'https://dashscope.aliyuncs.com/api/v1';
export const DASHSCOPE_S2V_BASE = 'https://dashscope.aliyuncs.com/api/v1';

// 保留：HeyGen 数字人分身（百炼无替代方案）
export const HEYGEN_BASE = 'https://api.heygen.com';

/** 获取 DashScope API Key（运行时读取，绕过 build 时内联） */
export function getDashScopeApiKey(): string | undefined {
  return _getDashScopeApiKey();
}

/** 获取 HappyHorse API Key（与 DashScope 共用） */
export function getHappyHorseApiKey(): string | undefined {
  return _getDashScopeApiKey();
}

/** 获取 HeyGen API Key（运行时读取，绕过 build 时内联） */
export function getHeyGenApiKey(): string | undefined {
  return _getHeyGenApiKey();
}

// 共享 fetch 超时工具（避免每个 AI 调用重复实现）
export function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 60000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // 合并外部 signal 和内部 timeout signal
  const signal = options.signal
    ? _anySignal([controller.signal, options.signal as AbortSignal])
    : controller.signal;
  return fetch(url, { ...options, signal }).finally(() => clearTimeout(timer));
}

/** 合并多个 AbortSignal，任一 abort 则触发 */
function _anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/** 安全截断 API 错误响应（防止日志泄露 API Key） */
export function safeErrorText(text: string, maxLen: number = 200): string {
  // 移除可能的 Authorization header 回显
  return text
    .replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer ***')
    .substring(0, maxLen);
}
