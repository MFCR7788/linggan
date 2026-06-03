// 火山 TTS 声音复刻 API
// POST { audioBase64, audioFormat, speakerId, demoText, language? }  → 上传训练
// GET  ?speakerId=xxx                                                       → 查状态
// DEL  ?speakerId=xxx                                                       → 预留(火山 V1 删除接口较复杂,先不实现)

import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import {
  createApiResponse,
  createApiError,
  createUnauthorizedResponse,
} from '@/lib/api-utils';
import { cloneVoiceUpload, cloneVoiceStatus } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB 火山限制

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return createUnauthorizedResponse();

  try {
    const {
      audioBase64,
      audioFormat,
      demoText,
      language,
    } = await request.json();

    if (!audioBase64 || !audioFormat || !demoText) {
      return createApiError('缺少必填参数(audioBase64 / audioFormat / demoText)', 400);
    }

    // 校验 demo_text 长度(4-80 字)
    if (demoText.length < 4 || demoText.length > 80) {
      return createApiError('演示文本需 4-80 字', 400);
    }

    // 校验音频大小(粗估 base64 长度)
    const estimatedBytes = (audioBase64.length * 3) / 4;
    if (estimatedBytes > MAX_AUDIO_BYTES) {
      return createApiError(`音频文件超过 10MB 限制(${(estimatedBytes / 1024 / 1024).toFixed(1)}MB)`, 400);
    }

    // speaker_id: lingji_{user.id}_{timestamp} 避免冲突
    const speakerId = `lingji_${user.id.slice(0, 8)}_${Date.now()}`;

    const result = await cloneVoiceUpload({
      audioBase64,
      audioFormat,
      speakerId,
      demoText,
      language: language ?? 0,
    });

    if (!result.ok) {
      return createApiError(result.error || '上传失败', 500);
    }

    return createApiResponse({
      speakerId: result.speakerId,
      status: result.status,
    }, '上传成功,训练中(约 1-5 分钟)');
  } catch (e: any) {
    console.error('[VoiceClone] POST error:', e);
    return createApiError(e?.message || '服务器错误', 500);
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return createUnauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const speakerId = searchParams.get('speakerId');

  if (!speakerId) {
    return createApiError('缺少 speakerId', 400);
  }

  const result = await cloneVoiceStatus(speakerId);
  return createApiResponse({
    speakerId: result.speakerId,
    status: result.status,
    error: result.error,
  }, '状态已获取');
}
