// 统一 AI 服务错误处理
// 标准化错误类型 + 安全错误文本提取（防 API key 泄露）

/** AI 服务错误码 */
export type AIErrorCode =
  | 'NETWORK_ERROR'       // 网络故障
  | 'TIMEOUT'             // 请求超时
  | 'API_ERROR'           // API 返回错误（4xx/5xx）
  | 'RATE_LIMITED'        // 被限流
  | 'INVALID_RESPONSE'    // 响应格式异常
  | 'CONFIG_ERROR'        // API Key 等配置缺失
  | 'AUTH_ERROR'          // 认证失败（401/403）
  | 'UNKNOWN';            // 未分类错误

/** 标准化的 AI 错误 */
export class AIServiceError extends Error {
  code: AIErrorCode;
  httpStatus?: number;
  retryable: boolean;

  constructor(message: string, options: {
    code: AIErrorCode;
    httpStatus?: number;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(message);
    this.name = 'AIServiceError';
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.retryable = options.retryable ?? (options.code === 'NETWORK_ERROR' || options.code === 'TIMEOUT' || options.code === 'RATE_LIMITED');
    if (options.cause) this.cause = options.cause as Error;
  }
}

/** 网络错误的 HTTP status → AIErrorCode 映射 */
function httpStatusToCode(status: number): AIErrorCode {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 401 || status === 403) return 'AUTH_ERROR';
  if (status >= 500) return 'API_ERROR';
  if (status >= 400) return 'API_ERROR';
  return 'UNKNOWN';
}

/** 从任意错误中提取安全的错误文本（剥离 API key、token 等敏感信息） */
export function safeErrorText(error: unknown): string {
  if (error instanceof AIServiceError) return error.message;
  if (error instanceof Error) {
    // 剥离 Bearer token
    let msg = error.message;
    msg = msg.replace(/Bearer\s+[A-Za-z0-9_\-./+=]+/g, 'Bearer ***');
    msg = msg.replace(/sk-[A-Za-z0-9]{20,}/g, 'sk-***');
    msg = msg.replace(/key=[A-Za-z0-9_\-]{20,}/gi, 'key=***');
    return msg;
  }
  return String(error);
}

/** 将任意 catch 到的错误标准化为 AIServiceError */
export function normalizeError(error: unknown, fallbackMessage = 'AI 服务调用失败'): AIServiceError {
  if (error instanceof AIServiceError) return error;

  // DOMException: AbortError → 超时
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AIServiceError('请求超时', { code: 'TIMEOUT', retryable: true, cause: error });
  }

  // TypeError: fetch failed → 网络错误
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new AIServiceError('网络连接失败', { code: 'NETWORK_ERROR', retryable: true, cause: error });
  }

  // 带 status 的错误对象（ModelRouter 抛出的）
  const err = error as { status?: number; message?: string };
  if (err.status) {
    const code = httpStatusToCode(err.status);
    return new AIServiceError(err.message || fallbackMessage, {
      code,
      httpStatus: err.status,
      retryable: code === 'RATE_LIMITED' || code === 'API_ERROR' || code === 'TIMEOUT',
      cause: error,
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  return new AIServiceError(message || fallbackMessage, { code: 'UNKNOWN', cause: error });
}
