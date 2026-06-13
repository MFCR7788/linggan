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

/** 可重试的 HTTP 状态码 */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

// 共享 fetch 超时 + 重试工具
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 60000,
  retries: number = 2
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options.signal
      ? _anySignal([controller.signal, options.signal as AbortSignal])
      : controller.signal;

    try {
      const response = await fetch(url, { ...options, signal });
      clearTimeout(timer);

      // 可重试的服务端错误 → 重试
      if (attempt < retries && RETRYABLE_STATUSES.has(response.status)) {
        const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[fetchWithTimeout] HTTP ${response.status}，${Math.round(delay)}ms 后重试 (${retries - attempt} 次剩余)`);
        }
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;

      // AbortError（超时）→ 不重试
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw e;
      }
      // 网络错误 → 重试
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[fetchWithTimeout] ${e instanceof Error ? e.message : String(e)}，${Math.round(delay)}ms 后重试`);
        }
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }

  throw lastError;
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

/** 通用重试包装器 — 指数退避，最多重试 3 次 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries?: number;
    baseDelayMs?: number;
    isRetryable?: (error: unknown) => boolean;
    label?: string;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, isRetryable, label = 'withRetry' } = opts;

  const shouldRetry = isRetryable ?? ((e: unknown): boolean => {
    if (e instanceof TypeError && e.message.includes('fetch')) return true; // 网络错误
    if (e instanceof DOMException && e.name === 'AbortError') return false; // 超时不重试
    if (typeof e === 'object' && e !== null && 'status' in e) {
      return RETRYABLE_STATUSES.has((e as { status: number }).status);
    }
    return true; // 未知错误默认重试
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt >= maxRetries || !shouldRetry(e)) throw e;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[${label}] 第 ${attempt + 1} 次失败，${Math.round(delay)}ms 后重试 (剩余 ${maxRetries - attempt} 次)`);
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
