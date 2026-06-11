// DeepSeek 直连 API — 支持 V4 Pro/Flash 模型
// Base URL: https://api.deepseek.com/v1
// 模型: deepseek-v4-pro (旗舰), deepseek-v4-flash (轻量)

import type { ProviderProfile } from '../types';
import { ProviderRegistry } from '../registry';

const CHAT_URL = 'https://api.deepseek.com/v1/chat/completions';

export const deepseekProfile: ProviderProfile = {
  name: 'deepseek',
  displayName: 'DeepSeek',
  description: 'DeepSeek 直连 API，支持 V4 Pro（旗舰推理）和 V4 Flash（轻量快速）',
  apiMode: 'chat_completions',
  aliases: ['ds'],
  envVars: ['DEEPSEEK_API_KEY'],
  baseUrl: CHAT_URL,
  defaultHeaders: { 'Content-Type': 'application/json' },
  defaultMaxTokens: 8192,
  defaultAuxModel: 'deepseek-v4-pro',
  fallbackModels: ['deepseek-v4-flash'],

  models: [
    {
      id: 'deepseek-v4-pro',
      name: 'DeepSeek V4 Pro',
      contextWindow: 131072,
      maxOutputTokens: 16384,
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
  ],
};

ProviderRegistry.instance.register(deepseekProfile);
