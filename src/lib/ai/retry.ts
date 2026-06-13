// AI 服务调用重试工具
// 提供指数退避重试，处理瞬时网络故障和 API 限流
// 默认：3 次重试，延迟 1s → 2s → 4s

export interface RetryOptions {
  /** 最大重试次数（默认 3） */
  maxRetries?: number;
  /** 基础延迟 ms（默认 1000） */
  baseDelayMs?: number;
  /** 最大延迟 ms（默认 15000） */
  maxDelayMs?: number;
  /** 是否为可重试的错误（默认只重试网络/超时/5xx） */
  shouldRetry?: (error: unknown) => boolean;
  /** 操作名称（用于日志） */
  operationName?: string;
}

const DEFAULT_SHOULD_RETRY = (error: unknown): boolean => {
  if (error instanceof TypeError && error.message.includes('fetch')) return true; // 网络故障
  if (error instanceof DOMException && error.name === 'AbortError') return false; // 用户取消，不重试
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { status?: number; code?: string })?.status;
  // 5xx 服务端错误可重试，4xx 客户端错误不重试
  if (code && code >= 500 && code < 600) return true;
  if (code && code >= 400 && code < 500) return false;
  // 超时/网络相关可重试
  const retryable = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN',
    'timeout', 'socket hang up', 'network', 'fetch failed'];
  return retryable.some(k => msg.toLowerCase().includes(k.toLowerCase()));
};

/**
 * 带指数退避的异步重试包装器
 *
 * @example
 * const result = await withRetry(
 *   () => fetch('https://api.example.com'),
 *   { operationName: 'fetchExample' }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 15000,
    shouldRetry = DEFAULT_SHOULD_RETRY,
    operationName = 'ai_call',
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // 最后一次尝试失败 → 抛出
      if (attempt >= maxRetries) break;

      // 检查是否可重试
      if (!shouldRetry(error)) {
        throw error;
      }

      // 指数退避 + 抖动
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 500,
        maxDelayMs
      );

      console.warn(
        `[withRetry] ${operationName} 第 ${attempt + 1}/${maxRetries} 次重试，${Math.round(delay)}ms 后...`,
        error instanceof Error ? error.message : String(error)
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
