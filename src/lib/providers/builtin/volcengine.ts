// 火山引擎豆包 — AI provider（TTS + Chat）

import type { ProviderProfile } from '../types';
import { ProviderRegistry } from '../registry';
import { getVolcTtsAppId, getVolcTtsAccessToken } from '@/lib/runtime-config';

export const volcengineProfile: ProviderProfile = {
  name: 'volcengine',
  displayName: '火山引擎豆包',
  description: '字节跳动火山引擎豆包大模型',
  apiMode: 'chat_completions',
  aliases: ['doubao', 'volcano'],
  envVars: ['DOUBAO_ENDPOINT_ID'],
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  defaultHeaders: { 'Content-Type': 'application/json' },
  defaultMaxTokens: 4096,
  defaultAuxModel: 'doubao-lite',
  fallbackModels: [],

  models: [
    {
      id: 'doubao-pro-32k',
      name: '豆包 Pro 32K',
      contextWindow: 32768,
      maxOutputTokens: 8192,
      supportsVision: false,
      supportsTools: true,
      supportsStreaming: true,
    },
    {
      id: 'doubao-lite-32k',
      name: '豆包 Lite 32K',
      contextWindow: 32768,
      maxOutputTokens: 4096,
      supportsVision: false,
      supportsTools: false,
      supportsStreaming: true,
    },
  ],

  buildExtraBody: (ctx) => {
    const body: Record<string, unknown> = {};
    if (ctx.enableSearch) body.enable_search = true;
    return body;
  },
};

ProviderRegistry.instance.register(volcengineProfile);

// ====== 火山引擎 TTS 声音复刻 (Voice Cloning) ======

const VOLC_TTS_HOST = 'openspeech.bytedance.com';

export type VoiceCloneStatus = 'NotFound' | 'Training' | 'Success' | 'Failed' | 'Active';

export interface VoiceCloneUploadResult {
  ok: boolean;
  speakerId: string;
  status: VoiceCloneStatus;
  error?: string;
}

export interface VoiceCloneStatusResult {
  speakerId: string;
  status: VoiceCloneStatus;
  error?: string;
}

export async function cloneVoiceUpload(params: {
  audioBase64: string;
  audioFormat: 'wav' | 'mp3' | 'm4a' | 'ogg' | 'aac' | 'pcm';
  speakerId: string;
  demoText: string;
  language?: 0 | 1 | 2 | 3 | 4 | 5;
  modelType?: 1 | 2 | 3 | 4 | 5;
}): Promise<VoiceCloneUploadResult> {
  const appid = getVolcTtsAppId();
  const accessToken = getVolcTtsAccessToken();
  if (!appid || !accessToken) {
    return { ok: false, speakerId: params.speakerId, status: 'Failed', error: 'TTS 服务未配置(VOLC_TTS_APP_ID / VOLC_TTS_ACCESS_TOKEN)' };
  }

  const modelType = params.modelType ?? 1;
  const resourceId = modelType >= 4 ? 'seed-icl-2.0' : 'seed-icl-1.0';

  const body = {
    appid,
    speaker_id: params.speakerId,
    audios: [{ audio_bytes: params.audioBase64, audio_format: params.audioFormat }],
    source: 2,
    language: params.language ?? 0,
    model_type: modelType,
    text: params.demoText,
  };

  try {
    const response = await fetch(`https://${VOLC_TTS_HOST}/api/v1/mega_tts/audio/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer; ${accessToken}`,
        'Resource-Id': resourceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok || (data.status_code !== undefined && data.status_code !== 0 && data.status_code !== 20000000)) {
      return { ok: false, speakerId: params.speakerId, status: 'Failed', error: data.message || `上传失败 (HTTP ${response.status})` };
    }
    return { ok: true, speakerId: params.speakerId, status: data.status || 'NotFound' };
  } catch (e: any) {
    return { ok: false, speakerId: params.speakerId, status: 'Failed', error: e?.message || '网络错误' };
  }
}

export async function cloneVoiceStatus(speakerId: string): Promise<VoiceCloneStatusResult> {
  const appid = getVolcTtsAppId();
  const accessToken = getVolcTtsAccessToken();
  if (!appid || !accessToken) {
    return { speakerId, status: 'NotFound', error: 'TTS 服务未配置' };
  }

  try {
    const response = await fetch(`https://${VOLC_TTS_HOST}/api/v1/mega_tts/status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer; ${accessToken}`,
        'Resource-Id': 'seed-icl-1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ appid, speaker_id: speakerId }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { speakerId, status: 'NotFound', error: `查询失败 (HTTP ${response.status})` };
    }
    return { speakerId, status: data.status || 'NotFound', error: data.message };
  } catch (e: any) {
    return { speakerId, status: 'NotFound', error: e?.message || '网络错误' };
  }
}

export async function synthesizeWithClonedVoice(params: {
  text: string;
  speakerId: string;
  speed?: number;
  pitch?: number;
}): Promise<Buffer | null> {
  const appid = getVolcTtsAppId();
  const accessToken = getVolcTtsAccessToken();
  if (!appid || !accessToken) return null;

  const speedRatio = Math.min(Math.max(params.speed ?? 1.15, 0.5), 2.0);
  const pitchRatio = Math.min(Math.max(params.pitch ?? 1.0, 0.5), 2.0);

  const body = {
    app: { appid, token: accessToken, cluster: 'volcano_tts' },
    user: { uid: 'lingji' },
    audio: {
      voice_type: params.speakerId,
      encoding: 'mp3',
      rate: 24000,
      speed_ratio: speedRatio,
      pitch_ratio: pitchRatio,
      volume_ratio: 1.0,
    },
    request: {
      reqid: `tts_clone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: params.text,
      text_type: 'plain',
      operation: 'query',
    },
  };

  try {
    const response = await fetch(`https://${VOLC_TTS_HOST}/api/v1/tts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer; ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data: any = await response.json();
    if (data.data && data.data.audio) {
      return Buffer.from(data.data.audio, 'base64');
    }
    return null;
  } catch {
    return null;
  }
}
