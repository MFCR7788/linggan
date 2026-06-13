// ModelRouter — 按任务类型 + provider 优先级路由模型调用
// 替换 agent loop 中硬编码的 callDeepSeek* 调用
// V2: 支持 taskType 成本感知路由

import { ProviderRegistry } from './registry';
import type { ProviderProfile, ResolvedModel } from './types';
import type { ChatMessage } from '@/lib/ai/types';
import { resolveTaskModel, accumulateCost, type TaskType, type TaskModelResult } from './cost-matrix';
import { withRetry } from '@/lib/ai/retry';

interface RouterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  enableSearch?: boolean;
  /** 任务类型，用于成本感知路由 */
  taskType?: TaskType;
}

interface ToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

export class ModelRouter {
  private registry: ProviderRegistry;
  private defaultProviderName: string;

  constructor(registry?: ProviderRegistry, defaultProviderName = 'dashscope') {
    this.registry = registry ?? ProviderRegistry.instance;
    this.defaultProviderName = defaultProviderName;
  }

  /** 解析模型 → provider + api key（按 taskType 成本路由） */
  resolveModel(modelId?: string, taskType?: TaskType): ResolvedModel {
    // 成本感知路由：按任务类型选择最佳模型
    if (taskType && !modelId) {
      const resolved = resolveTaskModel(taskType);
      modelId = resolved.model;
    }

    // 搜索所有可用 provider 中匹配的模型
    if (modelId) {
      for (const provider of this.registry.listAvailable()) {
        const matched = provider.models.find((m) => m.id === modelId);
        if (matched) {
          const apiKey = this.registry.getApiKey(provider);
          return {
            provider,
            model: modelId,
            apiKey,
            baseUrl: provider.baseUrl,
            headers: { ...provider.defaultHeaders, Authorization: `Bearer ${apiKey}` },
          };
        }
      }
    }

    // 回退到默认 provider（使用其自身支持的模型，而非外部 modelId）
    const provider = this.registry.get(this.defaultProviderName);
    if (!provider) throw new Error(`Provider "${this.defaultProviderName}" not registered`);

    // 如果显式指定的 modelId 在可用的 provider 中找不到，说明该 provider 不可用
    // 此时应使用默认 provider 自身的模型，避免把 modelId 发给不支持的 provider
    const fallbackModel = provider.models[0]?.id || 'deepseek-v3';
    const model = (modelId && provider.models.some((m) => m.id === modelId))
      ? modelId
      : fallbackModel;
    const apiKey = this.registry.getApiKey(provider);

    return {
      provider,
      model,
      apiKey,
      baseUrl: provider.baseUrl,
      headers: {
        ...provider.defaultHeaders,
        Authorization: `Bearer ${apiKey}`,
      },
    };
  }

  // ====== 非流式调用 ======

  /** 非工具模式 chat（带指数退避重试） */
  async chat(
    messages: ChatMessage[],
    options: RouterOptions = {}
  ): Promise<string> {
    const resolved = this.resolveModel(options.model, options.taskType);
    const body = this.buildBody(resolved, messages, options);

    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(resolved.baseUrl, {
          method: 'POST',
          headers: resolved.headers,
          body: JSON.stringify(body),
        }, 120000);

        if (!response.ok) {
          const err = await response.text().catch(() => '');
          throw Object.assign(
            new Error(`Chat failed (${response.status}): ${err.substring(0, 200)}`),
            { status: response.status }
          );
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;

        // 成本追踪
        if (data?.usage?.completion_tokens) {
          accumulateCost(data.usage.completion_tokens, resolved.model);
        }

        if (typeof content !== 'string') {
          throw new Error(`Unexpected response: ${JSON.stringify(data).substring(0, 200)}`);
        }
        return content;
      },
      { operationName: 'chat', maxRetries: 2 }
    );
  }

  /** 工具模式 chat (非流式，带指数退避重试) */
  async chatWithTools(
    messages: ChatMessage[],
    tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
    options: RouterOptions = {}
  ): Promise<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    };
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  }> {
    const resolved = this.resolveModel(options.model, options.taskType);
    const body = {
      ...this.buildBody(resolved, messages, options),
      tools,
      tool_choice: 'auto' as const,
    };

    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(resolved.baseUrl, {
          method: 'POST',
          headers: resolved.headers,
          body: JSON.stringify(body),
        }, 120000);

        if (!response.ok) {
          const err = await response.text().catch(() => '');
          throw Object.assign(
            new Error(`Tools call failed (${response.status}): ${err.substring(0, 200)}`),
            { status: response.status }
          );
        }

        const data = await response.json();
        const msg = data?.choices?.[0]?.message;
        if (!msg) {
          throw new Error(`Unexpected response: ${JSON.stringify(data).substring(0, 200)}`);
        }

        return { message: msg, usage: data?.usage };
      },
      { operationName: 'chatWithTools', maxRetries: 2 }
    );
  }

  // ====== 流式调用 ======

  /** 非工具流式 */
  async *chatStream(
    messages: ChatMessage[],
    options: RouterOptions = {}
  ): AsyncGenerator<string, string, unknown> {
    const resolved = this.resolveModel(options.model, options.taskType);
    const body = { ...this.buildBody(resolved, messages, options), stream: true };

    const response = await this.fetchWithTimeout(resolved.baseUrl, {
      method: 'POST',
      headers: resolved.headers,
      body: JSON.stringify(body),
    }, 180000);

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`Stream failed (${response.status}): ${err.substring(0, 200)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const text = this.parseSSELine(line);
          if (text) {
            fullContent += text;
            yield text;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }

  /** 工具模式流式 */
  async *chatStreamWithTools(
    messages: ChatMessage[],
    tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
    options: RouterOptions = {}
  ): AsyncGenerator<
    | { type: 'text'; content: string }
    | { type: 'tool_calls'; calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> },
    string,
    unknown
  > {
    const resolved = this.resolveModel(options.model, options.taskType);
    const body = {
      ...this.buildBody(resolved, messages, options),
      tools,
      tool_choice: 'auto' as const,
      stream: true,
    };

    const response = await this.fetchWithTimeout(resolved.baseUrl, {
      method: 'POST',
      headers: resolved.headers,
      body: JSON.stringify(body),
    }, 180000);

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`Stream with tools failed (${response.status}): ${err.substring(0, 200)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    const toolCallsMap = new Map<number, ToolCallDelta>();

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
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed?.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              fullContent += delta.content;
              yield { type: 'text', content: delta.content };
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                const existing: ToolCallDelta = toolCallsMap.get(idx) || { index: idx };
                if (tc.id) existing.id = tc.id;
                if (tc.function) {
                  if (!existing.function) existing.function = {};
                  if (tc.function.name) existing.function.name = (existing.function.name || '') + tc.function.name;
                  if (tc.function.arguments) existing.function.arguments = (existing.function.arguments || '') + tc.function.arguments;
                }
                toolCallsMap.set(idx, existing);
              }
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // 流结束后 yield 累积的 tool_calls
    if (toolCallsMap.size > 0) {
      const calls = Array.from(toolCallsMap.values())
        .sort((a, b) => a.index - b.index)
        .map((tc) => ({
          id: tc.id || `call_${tc.index}`,
          type: 'function' as const,
          function: {
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '{}',
          },
        }));
      yield { type: 'tool_calls', calls };
    }

    return fullContent;
  }

  // ====== 私有方法 ======

  private buildBody(
    resolved: ResolvedModel,
    messages: ChatMessage[],
    options: RouterOptions
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: resolved.model,
      messages: resolved.provider.prepareMessages
        ? resolved.provider.prepareMessages(messages)
        : messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? (resolved.provider.defaultMaxTokens ?? 4096),
    };
    if (options.enableSearch) body.enable_search = true;

    // provider 自定义 extra body
    if (resolved.provider.buildExtraBody) {
      const extra = resolved.provider.buildExtraBody({
        model: resolved.model,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 4096,
        enableSearch: options.enableSearch,
      });
      Object.assign(body, extra);
    }
    return body;
  }

  private parseSSELine(line: string): string | undefined {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:') || trimmed.slice(5).trim() === '[DONE]') return undefined;
    try {
      const parsed = JSON.parse(trimmed.slice(5).trim());
      return parsed?.choices?.[0]?.delta?.content;
    } catch {
      return undefined;
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 默认单例 */
export const defaultModelRouter = new ModelRouter();
