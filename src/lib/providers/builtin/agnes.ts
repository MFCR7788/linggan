// Agnes AI — 全模态免费 API provider（OpenAI 兼容）
// Base URL: https://apihub.agnes-ai.com/v1
// 模型: agnes-2.0-flash (文本/Agent), agnes-image-2.X-flash (图像), agnes-video-v2.0 (视频)

import type { ProviderProfile } from '../types';
import { ProviderRegistry } from '../registry';

const CHAT_URL = 'https://apihub.agnes-ai.com/v1/chat/completions';

export const agnesProfile: ProviderProfile = {
  name: 'agnes',
  displayName: 'Agnes AI',
  description: '免费全模态 AI，支持文本/生图/视频，OpenAI 兼容，Claw-Eval Agent 全球第9',
  apiMode: 'chat_completions',
  aliases: ['agnes-ai'],
  envVars: ['AGNES_API_KEY'],
  baseUrl: CHAT_URL,
  defaultHeaders: { 'Content-Type': 'application/json' },
  defaultMaxTokens: 4096,
  defaultAuxModel: 'agnes-2.0-flash',
  fallbackModels: [],

  models: [
    {
      id: 'agnes-2.0-flash',
      name: 'Agnes 2.0 Flash',
      contextWindow: 131072,
      maxOutputTokens: 8192,
      supportsVision: false,
      supportsTools: true,
      supportsStreaming: true,
    },
  ],
};

// 模块加载时自注册
ProviderRegistry.instance.register(agnesProfile);
