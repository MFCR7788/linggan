// AI Services - Chat APIs (DeepSeek, Qwen/DashScope, Doubao/ARK)

import type { ChatMessage, ChatOptions } from './types';

// ====== DeepSeek API ======

export async function callDeepSeek(
  prompt: string,
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'deepseek-chat',
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
  return data.choices[0].message.content;
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

  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
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
  return data.choices[0].message.content;
}

// ====== Doubao/ARK API ======

export async function callDoubaoChat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = process.env.DOUBAO_API_KEY;
  const baseUrl = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  if (!apiKey) {
    throw new Error('DOUBAO_API_KEY is not configured');
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || process.env.DOUBAO_ENDPOINT_ID || 'doubao-seed-2.0-241215',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Doubao API error:', error);
    throw new Error(`Doubao API call failed: ${error.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
