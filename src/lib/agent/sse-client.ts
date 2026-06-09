// Agent SSE Client — 前端流式事件消费

import type { AgentEvent } from './types';

export class AgentSSEClient {
  private abortController: AbortController | null = null;

  async *stream(
    url: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): AsyncGenerator<AgentEvent, void, unknown> {
    this.abortController = new AbortController();

    const mergedSignal = signal
      ? combineSignals([signal, this.abortController.signal])
      : this.abortController.signal;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
        signal: mergedSignal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        yield {
          type: 'error',
          message: errorData.error || `请求失败 (${response.status})`,
        };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: 'error', message: '无法读取响应流' };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;

            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr) as AgentEvent;
              yield event;
            } catch {
              // 跳过无法解析的行
            }
          }
        }

        // 处理缓冲区残余
        if (buffer.trim().startsWith('data:')) {
          const jsonStr = buffer.trim().slice(5).trim();
          if (jsonStr) {
            try {
              const event = JSON.parse(jsonStr) as AgentEvent;
              yield event;
            } catch { /* skip */ }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      this.abortController = null;
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}
