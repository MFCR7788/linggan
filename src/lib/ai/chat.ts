// AI Services - Chat APIs (百炼 DeepSeek, Qwen/DashScope)

import type { ChatMessage, ChatOptions } from './types';

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 60000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ====== 百炼 DeepSeek API（兼容 OpenAI 格式） ======

const BAILIAN_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export async function callDeepSeek(
  prompt: string,
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured');
  }

  const response = await fetchWithTimeout(`${BAILIAN_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'deepseek-v3',
      messages: [
        { role: 'system', content: '你是一个专业的内容创作助手，帮助用户总结、分析和创作内容。' },
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('DeepSeek API error:', error);
    throw new Error(`DeepSeek API call failed: ${error.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`DeepSeek returned unexpected response: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return content;
}

// ====== 通义千问 / DashScope API ======

export async function callQwen(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured');
  }

  const validQwenModels = ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-vl-plus', 'qwen-vl-max', 'qwen3.7-max'];
  let modelName = options.model || 'qwen-plus';

  if (!validQwenModels.includes(modelName)) {
    console.warn(`Invalid model name "${modelName}", falling back to "qwen-plus"`);
    modelName = 'qwen-plus';
  }

  const response = await fetchWithTimeout('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('DashScope API error:', error);
    throw new Error('DashScope API call failed');
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`DashScope returned unexpected response: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return content;
}

// ====== 百炼 Qwen API（替代原 Doubao/ARK） ======

function mapDoubaoModel(model: string): string {
  if (model.includes('vision') || model.includes('vl')) return 'qwen-vl-plus';
  if (model.includes('doubao')) return 'qwen-plus';
  return model;
}

export async function callDoubaoChat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured');
  }

  const rawModel = options.model || process.env.DOUBAO_ENDPOINT_ID || 'doubao-seed-2.0-241215';
  const model = mapDoubaoModel(rawModel);

  const response = await fetchWithTimeout(`${BAILIAN_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Qwen (百炼) API error:', error);
    throw new Error(`Qwen API call failed: ${error.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`Qwen returned unexpected response: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return content;
}
