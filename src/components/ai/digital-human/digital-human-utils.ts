// ─── 数字人共享工具函数 ──────────────────────────────────

import { apiClient } from '@/lib/api-client';

/** 上传文件到 OSS */
export async function uploadFile(file: File, type: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.success && data.data.url) return data.data.url;
  throw new Error(data.error || '上传失败');
}

/** base64 音频 → 上传后返回 URL */
export async function base64ToUrl(base64: string): Promise<string> {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  const file = new File([blob], `tts-${Date.now()}.mp3`, { type: 'audio/mpeg' });
  return uploadFile(file, 'audio');
}

/** 测音频真实时长(秒), 支持 url 或 base64 dataURL */
export function measureAudioDuration(src: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(a.duration);
    a.onerror = () => reject(new Error('音频时长解析失败'));
    a.src = src;
  });
}

/** wan2.2-s2v 硬限制 20 秒 */
export const MAX_AUDIO_SECONDS = 20;

/** 长脚本按标点拆成每段 ~maxChars 字的片段 */
export function splitScriptForDigitalHuman(text: string, maxChars: number = 100): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }
    const searchRange = remaining.slice(0, maxChars);
    const punctMatch = searchRange.match(/[。！？\n](?!.*[。！？\n])/);
    let cutAt = maxChars;
    if (punctMatch && punctMatch.index !== undefined && punctMatch.index > maxChars * 0.4) {
      cutAt = punctMatch.index + 1;
    } else {
      const commaMatch = searchRange.match(/[，、,](?!.*[，、,])/);
      if (commaMatch && commaMatch.index !== undefined && commaMatch.index > maxChars * 0.4) {
        cutAt = commaMatch.index + 1;
      }
    }
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }
  return chunks.filter(c => c.length > 0);
}

/** TTS 生成: 返回 base64 音频数据, 失败返 null */
export async function generateTTS(
  text: string,
  voice: string,
  speed: number,
  pitch: number,
  clonedVoiceId: string | null,
): Promise<string | null> {
  const res = await fetch('/api/ai/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice,
      speed,
      pitch,
      cloned_voice_id: voice === 'cloned_voice' ? clonedVoiceId : undefined,
    }),
  });
  const data = await res.json();
  if (data.success && data.audioBase64) {
    // 测真实音频时长, 超过 20 秒直接拒收
    const dataUrl = `data:audio/mpeg;base64,${data.audioBase64}`;
    let dur = 0;
    try { dur = await measureAudioDuration(dataUrl); } catch {}
    if (dur > MAX_AUDIO_SECONDS) return null;
    return data.audioBase64;
  }
  return null;
}

/** 提交数字人任务 + 轮询 */
export async function submitAndPoll(
  imgUrl: string,
  audUrl: string,
  reso: '480P' | '720P',
  onDone: (videoUrl: string) => void,
  onError: (msg: string) => void,
  audDuration?: number | null,
): Promise<ReturnType<typeof setInterval> | null> {
  try {
    const res = await apiClient.post<{ taskId: string }>('/ai/digital-human', {
      imageUrl: imgUrl,
      audioUrl: audUrl,
      resolution: reso,
      audioDuration: typeof audDuration === 'number' ? audDuration : undefined,
    });
    if (!res.success) throw new Error(res.error || '提交失败');

    const tid = res.data!.taskId;
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      if (attempts > 120) {
        clearInterval(poll);
        onError('生成超时，请重试');
        return;
      }
      try {
        const pr = await apiClient.get<{ status: string; videoUrl?: string; message?: string }>(`/ai/digital-human?taskId=${tid}`);
        if (pr.success && pr.data) {
          const { status, videoUrl, message } = pr.data;
          if (status === 'succeeded' && videoUrl) {
            clearInterval(poll);
            onDone(videoUrl);
          } else if (status === 'failed') {
            clearInterval(poll);
            onError(message || '生成失败');
          }
        }
      } catch { /* 继续轮询 */ }
    }, 5000);
    return poll;
  } catch (err: any) {
    onError(err.message || '提交失败');
    return null;
  }
}
