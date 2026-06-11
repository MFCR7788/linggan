// 百炼 DashScope — 灵集主 AI provider
// 支持 DeepSeek / Qwen / Wan / CosyVoice 等模型

import type { ProviderProfile } from '../types';
import { ProviderRegistry } from '../registry';
import { getDashScopeApiKey, getDoubaoEndpointId } from '@/lib/runtime-config';

const CHAT_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

export const dashscopeProfile: ProviderProfile = {
  name: 'dashscope',
  displayName: '百炼 DashScope',
  description: '阿里云百炼平台，支持 DeepSeek、Qwen、Wan、CosyVoice 等模型',
  apiMode: 'chat_completions',
  aliases: ['bailian', 'alibaba'],
  envVars: ['DASHSCOPE_API_KEY'],
  baseUrl: CHAT_URL,
  defaultHeaders: { 'Content-Type': 'application/json' },
  defaultMaxTokens: 4096,
  defaultAuxModel: 'deepseek-v3',
  fallbackModels: ['qwen-max', 'qwen-plus'],

  models: [
    {
      id: 'deepseek-v3',
      name: 'DeepSeek V3',
      contextWindow: 131072,
      maxOutputTokens: 8192,
      supportsVision: false,
      supportsTools: true,
      supportsStreaming: true,
    },
    {
      id: 'deepseek-r1',
      name: 'DeepSeek R1',
      contextWindow: 131072,
      maxOutputTokens: 8192,
      supportsVision: false,
      supportsTools: true,
      supportsStreaming: true,
    },
    {
      id: 'deepseek-v4-pro',
      name: 'DeepSeek V4 Pro',
      contextWindow: 131072,
      maxOutputTokens: 8192,
      supportsVision: false,
      supportsTools: true,
      supportsStreaming: true,
    },
    {
      id: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      contextWindow: 131072,
      maxOutputTokens: 8192,
      supportsVision: false,
      supportsTools: true,
      supportsStreaming: true,
    },
    {
      id: 'qwen-max',
      name: 'Qwen Max',
      contextWindow: 32768,
      maxOutputTokens: 8192,
      supportsVision: false,
      supportsTools: true,
      supportsStreaming: true,
    },
    {
      id: 'qwen-plus',
      name: 'Qwen Plus',
      contextWindow: 131072,
      maxOutputTokens: 8192,
      supportsVision: false,
      supportsTools: true,
      supportsStreaming: true,
    },
  ],
};

// 模块加载时自注册
ProviderRegistry.instance.register(dashscopeProfile);

// ====== DashScope API 客户端（复用 profile 中的 CHAT_URL） ======

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  enableSearch?: boolean;
}

// 通用 fetch 超时包装
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 60000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// DashScope chat completions 共享调用
async function dashScopeChat(
  body: Record<string, unknown>,
  timeoutMs = 90000
): Promise<{ choices: { message: { content: string } }[] }> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY is not configured');

  const response = await fetchWithTimeout(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }, timeoutMs);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DashScope chat failed (${response.status}): ${error.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`DashScope unexpected response: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return data;
}

// ====== 基础对话 ======

export async function callDeepSeek(prompt: string, options: ChatOptions = {}): Promise<string> {
  const body: Record<string, unknown> = {
    model: options.model || 'deepseek-v3',
    messages: [
      { role: 'system', content: '你是一个专业的内容创作助手，帮助用户总结、分析和创作内容。' },
      { role: 'user', content: prompt },
    ],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2000,
  };
  if (options.enableSearch) body.enable_search = true;

  const data = await dashScopeChat(body);
  return data.choices[0].message.content;
}

export async function* callDeepSeekStream(
  prompt: string,
  options: ChatOptions = {}
): AsyncGenerator<string, string, unknown> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY is not configured');

  const body: Record<string, unknown> = {
    model: options.model || 'deepseek-v3',
    messages: [
      { role: 'system', content: '你是一个专业的内容创作助手，帮助用户总结、分析和创作内容。' },
      { role: 'user', content: prompt },
    ],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2000,
    stream: true,
  };
  if (options.enableSearch) body.enable_search = true;

  const response = await fetchWithTimeout(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }, 120000);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek stream failed: ${error.substring(0, 200)}`);
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
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            yield delta;
          }
        } catch { /* skip */ }
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:') && trimmed.slice(5).trim() !== '[DONE]') {
        try {
          const parsed = JSON.parse(trimmed.slice(5).trim());
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) { fullContent += delta; yield delta; }
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

// ====== Qwen 对话 ======

export async function callQwen(
  messages: Array<{ role: string; content: unknown }>,
  options: ChatOptions = {}
): Promise<string> {
  const validQwenModels = ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-vl-plus', 'qwen-vl-max', 'qwen3.7-max'];
  let modelName = options.model || 'qwen-plus';
  if (!validQwenModels.includes(modelName)) {
    console.warn(`Invalid model name "${modelName}", falling back to "qwen-plus"`);
    modelName = 'qwen-plus';
  }

  const data = await dashScopeChat({
    model: modelName,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2000,
  });
  return data.choices[0].message.content;
}

// ====== 豆包模型 → Qwen 映射 ======

function mapDoubaoModel(model: string): string {
  if (model.includes('vision') || model.includes('vl')) return 'qwen-vl-plus';
  if (model.includes('doubao')) return 'qwen-plus';
  return model;
}

export async function callDoubaoChat(
  messages: Array<{ role: string; content: unknown }>,
  options: ChatOptions = {}
): Promise<string> {
  const rawModel = options.model || getDoubaoEndpointId() || 'doubao-seed-2.0-241215';
  const model = mapDoubaoModel(rawModel);

  const data = await dashScopeChat({
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2000,
  }, 120000);
  return data.choices[0].message.content;
}

// ====== Function Calling ======

interface ToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

export async function callDeepSeekWithTools(
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }>,
  tools: Record<string, unknown>[],
  options: ChatOptions = {}
): Promise<{
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  };
}> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY is not configured');

  const body: Record<string, unknown> = {
    model: options.model || 'deepseek-v3',
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    tools,
    tool_choice: 'auto',
  };

  const response = await fetchWithTimeout(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }, 120000);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DashScope tools call failed (${response.status}): ${error.substring(0, 200)}`);
  }

  const data = await response.json();
  const msg = data?.choices?.[0]?.message;
  if (!msg) {
    throw new Error(`DashScope tools unexpected response: ${JSON.stringify(data).substring(0, 200)}`);
  }

  return { message: msg };
}

export async function* callDeepSeekStreamWithTools(
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }>,
  tools: Record<string, unknown>[],
  options: ChatOptions = {}
): AsyncGenerator<
  { type: 'text'; content: string } | { type: 'tool_calls'; calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> },
  string,
  unknown
> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY is not configured');

  const body: Record<string, unknown> = {
    model: options.model || 'deepseek-v3',
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    tools,
    tool_choice: 'auto',
    stream: true,
  };

  const response = await fetchWithTimeout(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }, 180000);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek stream with tools failed: ${error.substring(0, 200)}`);
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
              const existing = toolCallsMap.get(idx) || { index: idx, id: undefined, function: undefined };
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

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:') && trimmed.slice(5).trim() !== '[DONE]') {
        try {
          const parsed = JSON.parse(trimmed.slice(5).trim());
          const delta = parsed?.choices?.[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            yield { type: 'text', content: delta.content };
          }
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

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
