// OpenRouter — 多模型聚合 provider（降级/扩展用）

import type { ProviderProfile } from '../types';
import { ProviderRegistry } from '../registry';
import { getOpenRouterApiKey } from '@/lib/runtime-config';

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

export const openrouterProfile: ProviderProfile = {
  name: 'openrouter',
  displayName: 'OpenRouter',
  description: '多模型聚合平台，提供 Claude、GPT 等模型的统一访问入口',
  apiMode: 'chat_completions',
  aliases: ['open_router'],
  envVars: ['OPENROUTER_API_KEY'],
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  defaultHeaders: {
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://zjsifan.com',
    'X-Title': '灵集 LingJi',
  },
  defaultMaxTokens: 4096,
  defaultAuxModel: 'openai/gpt-4o-mini',
  fallbackModels: ['anthropic/claude-sonnet-4', 'openai/gpt-4o'],

  models: [
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      contextWindow: 128000,
      maxOutputTokens: 16384,
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
    },
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini',
      contextWindow: 128000,
      maxOutputTokens: 16384,
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
    },
    {
      id: 'anthropic/claude-sonnet-4',
      name: 'Claude Sonnet 4',
      contextWindow: 200000,
      maxOutputTokens: 8192,
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
    },
  ],

  prepareMessages: (messages) => {
    // OpenRouter 需要确保 system 消息在最前面
    const systemMsgs = messages.filter((m) => m.role === 'system');
    const otherMsgs = messages.filter((m) => m.role !== 'system');
    return [...systemMsgs, ...otherMsgs];
  },
};

ProviderRegistry.instance.register(openrouterProfile);

// ====== OpenRouter API 调用 ======

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  enableSearch?: boolean;
}

export async function callOpenRouter(
  prompt: string,
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const model = options.model || 'anthropic/claude-sonnet-4';
  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://zjsifan.com',
      'X-Title': '灵集 LingJi',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是一个专业的中文内容创作助手。' },
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  }, 120000);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${error.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`OpenRouter unexpected response: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return content;
}
