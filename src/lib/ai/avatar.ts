// AI Services - Digital Avatar Training & Generation (HeyGen)

import { HEYGEN_BASE, HEYGEN_API_KEY } from './constants';
import type { AvatarTrainingStatus, AvatarTrainingResult, AvatarTrainingStatusResult } from './types';

/** 提交数字分身训练 — 上传 5-10 分钟清晰人声视频 */
export async function trainAvatar(params: {
  videoUrl: string;
  name: string;
  lookalike?: boolean; // true=Digital Twin(视频), false=Photo Avatar(单图)
}): Promise<AvatarTrainingResult> {
  if (!HEYGEN_API_KEY) {
    return { ok: false, avatarId: null, status: 'failed', error: 'HEYGEN_API_KEY 未配置,数字分身功能不可用' };
  }

  try {
    // HeyGen: POST /v1/photo_avatar/lookalike (单图)
    // 或 POST /v1/video_avatar/training/upload (Digital Twin 视频)
    // 这里用 lookalike 端点(更普适,支持单图/视频)
    const response = await fetch(`${HEYGEN_BASE}/v1/photo_avatar/lookalike`, {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.name,
        video_url: params.videoUrl,
        lookalike: params.lookalike ?? true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Avatar] 训练 API 错误:', response.status, errText.substring(0, 500));
      if (errText.includes('Unauthorized') || response.status === 401) {
        return { ok: false, avatarId: null, status: 'failed', error: 'HeyGen API Key 无效' };
      }
      if (response.status === 402) {
        return { ok: false, avatarId: null, status: 'failed', error: 'HeyGen 账户余额不足' };
      }
      return { ok: false, avatarId: null, status: 'failed', error: `训练提交失败 (HTTP ${response.status})` };
    }

    const data = await response.json();
    const avatarId = data.data?.avatar_id || data.data?.id;
    if (!avatarId) {
      return { ok: false, avatarId: null, status: 'failed', error: '未获取到 avatar_id' };
    }
    return { ok: true, avatarId, status: 'training' };
  } catch (e: unknown) {
    return { ok: false, avatarId: null, status: 'failed', error: e instanceof Error ? e.message : '网络错误' };
  }
}

/** 查询数字分身训练状态 */
export async function getAvatarTrainingStatus(avatarId: string): Promise<AvatarTrainingStatusResult> {
  if (!HEYGEN_API_KEY) {
    return { avatarId, status: 'failed', error: 'HEYGEN_API_KEY 未配置' };
  }

  try {
    const response = await fetch(`${HEYGEN_BASE}/v1/photo_avatar/lookalike/${avatarId}`, {
      headers: { 'X-Api-Key': HEYGEN_API_KEY },
    });

    if (!response.ok) {
      return { avatarId, status: 'failed', error: `查询失败 (HTTP ${response.status})` };
    }

    const data = await response.json();
    const statusRaw = data.data?.status || 'pending';
    // 映射: pending/training/ready/failed
    const status: AvatarTrainingStatus = statusRaw === 'completed' ? 'ready'
      : statusRaw === 'success' ? 'ready'
      : statusRaw === 'failed' ? 'failed'
      : statusRaw === 'training' ? 'training'
      : 'pending';

    return {
      avatarId,
      status,
      error: data.data?.error,
      coverUrl: data.data?.cover_url,
      previewVideoUrl: data.data?.preview_video_url,
    };
  } catch (e: unknown) {
    return { avatarId, status: 'failed', error: e instanceof Error ? e.message : '网络错误' };
  }
}

/** 用已训练的数字分身生成视频 */
export async function generateAvatarVideo(params: {
  avatarId: string;
  script: string;
  voiceId?: string; // 可选 TTS 音色
  backgroundColor?: string;
}): Promise<{ ok: boolean; videoId?: string; videoUrl?: string; error?: string }> {
  if (!HEYGEN_API_KEY) {
    return { ok: false, error: 'HEYGEN_API_KEY 未配置' };
  }

  try {
    // POST /v1/video/generate
    const response = await fetch(`${HEYGEN_BASE}/v1/video/generate`, {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_inputs: [
          {
            character: {
              type: 'avatar',
              avatar_id: params.avatarId,
              avatar_style: 'normal',
            },
            voice: {
              type: 'text',
              input_text: params.script,
              voice_id: params.voiceId,
            },
            background: {
              type: 'color',
              value: params.backgroundColor || '#0F172A',
            },
          },
        ],
        dimension: { width: 1280, height: 720 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, error: `视频生成失败 (HTTP ${response.status}): ${errText.substring(0, 200)}` };
    }

    const data = await response.json();
    const videoId = data.data?.video_id;
    if (!videoId) return { ok: false, error: '未获取到 video_id' };
    return { ok: true, videoId };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : '网络错误' };
  }
}

/** 查询数字分身视频生成状态 */
export async function getAvatarVideoStatus(videoId: string): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}> {
  if (!HEYGEN_API_KEY) {
    return { status: 'failed', error: 'HEYGEN_API_KEY 未配置' };
  }

  try {
    const response = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
      headers: { 'X-Api-Key': HEYGEN_API_KEY },
    });
    if (!response.ok) return { status: 'failed', error: '查询失败' };

    const data = await response.json();
    const statusRaw = data.data?.status;
    const status = statusRaw === 'completed' ? 'completed'
      : statusRaw === 'failed' ? 'failed'
      : statusRaw === 'processing' ? 'processing'
      : 'pending';

    return {
      status,
      videoUrl: data.data?.video_url,
      error: data.data?.error?.message,
    };
  } catch (e: unknown) {
    return { status: 'failed', error: e instanceof Error ? e.message : '网络错误' };
  }
}
