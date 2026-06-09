// 结构化日志 — 生产环境仅输出 warn/error，开发环境全量输出

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  ctx?: Record<string, unknown>;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: LogLevel): boolean {
  if (typeof process === 'undefined') return false;
  if (process.env.NODE_ENV === 'production') return LEVEL_RANK[level] >= 2;
  return true;
}

function emit(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;
  const line = JSON.stringify(entry);
  switch (entry.level) {
    case 'error': console.error(line); break;
    case 'warn': console.warn(line); break;
    default: console.log(line); break;
  }
}

function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  emit({ ts: new Date().toISOString(), level, msg, ctx });
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
};

// 带 request 上下文的 logger
export function reqLogger(method: string, path: string, userId?: string) {
  const base: Record<string, unknown> = { method, path };
  if (userId) base.userId = userId.slice(0, 8);
  return {
    info: (msg: string, ctx?: Record<string, unknown>) => logger.info(msg, { ...base, ...ctx }),
    warn: (msg: string, ctx?: Record<string, unknown>) => logger.warn(msg, { ...base, ...ctx }),
    error: (msg: string, ctx?: Record<string, unknown>) => logger.error(msg, { ...base, ...ctx }),
  };
}
