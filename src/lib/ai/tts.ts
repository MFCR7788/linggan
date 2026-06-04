// AI Services - Text-to-Speech (Voice Cloning / CosyVoice)

import { VOLC_TTS_HOST } from './constants';
import type {
  VoiceCloneUploadResult,
  VoiceCloneStatusResult,
  VoiceCloneStatus,
  CosyVoiceId,
  CosyVoiceModel,
  CosyVoiceOptions,
} from './types';

// ====== 火山引擎 TTS 声音复刻 (Voice Cloning) ======
// V1 接口: https://openspeech.bytedance.com/api/v1/mega_tts/audio/upload
// 鉴权: Authorization: Bearer;{token}, Resource-Id: seed-icl-1.0 (V1) / seed-icl-2.0 (V2)
// 价格: 训练 ¥99 一次性, 合成按字符数计费 ~¥0.0001/字
// 限制: 单文件 ≤ 10MB, 同一 speaker_id 最多 10 次上传

/** 上传音频做声音复刻(训练阶段,通常 1-5 分钟) */
export async function cloneVoiceUpload(params: {
  audioBase64: string;
  audioFormat: 'wav' | 'mp3' | 'm4a' | 'ogg' | 'aac' | 'pcm';
  speakerId: string;
  demoText: string; // 4-80 字, 用于和音频对比校验
  language?: 0 | 1 | 2 | 3 | 4 | 5; // 0=cn, 1=en, 2=ja, 3=es, 4=id, 5=pt
  modelType?: 1 | 2 | 3 | 4 | 5; // 1=ICL 1.0, 2=DiT 标准, 4=ICL V2
}): Promise<VoiceCloneUploadResult> {
  const appid = process.env.VOLC_TTS_APP_ID;
  const accessToken = process.env.VOLC_TTS_ACCESS_TOKEN;
  if (!appid || !accessToken) {
    return { ok: false, speakerId: params.speakerId, status: 'Failed', error: 'TTS 服务未配置(VOLC_TTS_APP_ID / VOLC_TTS_ACCESS_TOKEN)' };
  }

  const modelType = params.modelType ?? 1; // 默认 ICL 1.0
  const resourceId = modelType >= 4 ? 'seed-icl-2.0' : 'seed-icl-1.0';

  const body = {
    appid,
    speaker_id: params.speakerId,
    audios: [
      {
        audio_bytes: params.audioBase64,
        audio_format: params.audioFormat,
      },
    ],
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
    // 火山 V1 返回格式: { status_code, status, message, ... }
    if (!response.ok || (data.status_code !== undefined && data.status_code !== 0 && data.status_code !== 20000000)) {
      return {
        ok: false,
        speakerId: params.speakerId,
        status: 'Failed',
        error: data.message || `上传失败 (HTTP ${response.status})`,
      };
    }
    return {
      ok: true,
      speakerId: params.speakerId,
      status: data.status || 'NotFound',
    };
  } catch (e: unknown) {
    return {
      ok: false,
      speakerId: params.speakerId,
      status: 'Failed',
      error: e instanceof Error ? e.message : '网络错误',
    };
  }
}

/** 查询声音复刻训练状态 */
export async function cloneVoiceStatus(speakerId: string): Promise<VoiceCloneStatusResult> {
  const appid = process.env.VOLC_TTS_APP_ID;
  const accessToken = process.env.VOLC_TTS_ACCESS_TOKEN;
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
    return {
      speakerId,
      status: data.status || 'NotFound',
      error: data.message,
    };
  } catch (e: unknown) {
    return { speakerId, status: 'NotFound', error: e instanceof Error ? e.message : '网络错误' };
  }
}

/** 用克隆的 voice_id 合成语音(让数字人用自己声音说) */
export async function synthesizeWithClonedVoice(params: {
  text: string;
  speakerId: string;
  speed?: number;
  pitch?: number;
}): Promise<Buffer | null> {
  const appid = process.env.VOLC_TTS_APP_ID;
  const accessToken = process.env.VOLC_TTS_ACCESS_TOKEN;
  if (!appid || !accessToken) return null;

  const speedRatio = Math.min(Math.max(params.speed ?? 1.15, 0.5), 2.0);
  const pitchRatio = Math.min(Math.max(params.pitch ?? 1.0, 0.5), 2.0);

  const body = {
    app: { appid, token: accessToken, cluster: 'volcano_tts' },
    user: { uid: 'lingji' },
    audio: {
      voice_type: params.speakerId, // 克隆的 speaker_id 直接当 voice_type 用
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
    const data = await response.json() as { data?: { audio?: string } };
    if (data.data?.audio) {
      return Buffer.from(data.data.audio, 'base64');
    }
    return null;
  } catch {
    return null;
  }
}

// ====== 阿里 CosyVoice v2 TTS(中文 SOTA) ======
// DashScope 同步 HTTP API:POST /api/v1/services/audio/tts/SpeechSynthesizer
// 流程:POST → 返回 JSON 含 output.audio.url(OSS) → GET 拿 MP3 bytes
// 价格:¥0.6/万字符(超拟人档),新用户 1 万次免费
// 音色:cosyvoice-v2 需带 _v2 后缀(longxiaochun_v2),v3-flash 不带后缀
// 注:cosyvoice-v1 仅支持 WebSocket,不支持 HTTP
// 默认 v2 + 龙小淳(温柔女声·默认)

export async function synthesizeWithCosyVoice(params: {
  text: string;
  options?: CosyVoiceOptions;
}): Promise<Buffer | null> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.warn('[CosyVoice] DASHSCOPE_API_KEY 未配置');
    return null;
  }

  const {
    voice = 'longxiaochun_v2',
    speed = 1.0,
    pitch = 1.0,
    volume = 50,
    model = 'cosyvoice-v2',
  } = params.options || {};

  try {
    // Step 1: 调用同步 HTTP API,获取 OSS 音频 URL
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: {
          text: params.text,
          voice,
          format: 'mp3',
          sample_rate: 24000,
          rate: speed,
          pitch,
          volume,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[CosyVoice] HTTP ${response.status}:`, errText.slice(0, 300));
      return null;
    }

    const json = await response.json() as { code?: number; message?: string; output?: { audio?: { url?: string } } };
    if (json.code) {
      console.error(`[CosyVoice] 业务错误 code=${json.code}:`, json.message);
      return null;
    }

    const audioUrl = json?.output?.audio?.url;
    if (!audioUrl) {
      console.warn('[CosyVoice] 响应中无 audio.url:', JSON.stringify(json).slice(0, 200));
      return null;
    }

    // Step 2: 下载 OSS 上的 MP3
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) {
      console.error(`[CosyVoice] 下载音频失败 HTTP ${audioResp.status}`);
      return null;
    }

    const ab = await audioResp.arrayBuffer();
    if (ab.byteLength < 100) {
      console.warn('[CosyVoice] 返回音频过小,可能合成失败');
      return null;
    }
    return Buffer.from(ab);
  } catch (e: unknown) {
    console.warn('[CosyVoice] 调用失败:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ====== 本地 Kokoro TTS (CPU 友好, 开源, Apache 2.0) ======
// API: POST /v1/audio/speech (OpenAI 兼容)
// 音色: zf_xiaobei(女), zf_xiaoni(女), zf_xiaoxiao(女), zf_xiaoyi(女),
//        zm_yunjian(男), zm_yunxi(男), zm_yunxia(男), zm_yunyang(男)
// 引擎: sherpa-onnx + Kokoro-82M v1.0

const KOKORO_API_URL = process.env.KOKORO_API_URL || "";

/** 内部 voice key → Kokoro voice 映射 */
export const KOKORO_VOICE_MAP: Record<string, string> = {
  female_natural: "zf_xiaobei",
  female_emotional: "zf_xiaoni",
  female_professional: "zf_xiaoxiao",
  female_warm: "zf_xiaoyi",
  male_natural: "zm_yunjian",
  male_warm: "zm_yunxi",
  male_professional: "zm_yunyang",
};

/**
 * 本地 Kokoro TTS 合成
 * 返回 MP3 Buffer，失败返回 null
 */
export async function synthesizeWithLocalKokoro(text: string, voiceKey: string): Promise<Buffer | null> {
  if (!KOKORO_API_URL) return null;

  const kokoroVoice = KOKORO_VOICE_MAP[voiceKey] || "zf_xiaobei";

  try {
    const res = await fetch(`${KOKORO_API_URL}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        input: text,
        voice: kokoroVoice,
        speed: 1.0,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.warn(`[Kokoro] HTTP ${res.status}`);
      return null;
    }

    const ab = await res.arrayBuffer();
    if (ab.byteLength < 100) {
      console.warn("[Kokoro] 返回音频过小");
      return null;
    }
    return Buffer.from(ab);
  } catch (e: unknown) {
    console.warn("[Kokoro] 本地服务不可用:", e instanceof Error ? e.message : e);
    return null;
  }
}
