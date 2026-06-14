// CosyVoice 云端 TTS — 阿里云 DashScope CosyVoice v2/v3-flash
// 现有实现封装为 TtsProvider 接口
// 10+ 预设音色，按字符计费

import type { TtsProvider, TtsSynthesizeOptions, TtsSynthesizeResult, TtsVoice } from '../types';

const COSYVOICE_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer';

const VOICES: TtsVoice[] = [
  { id: 'longxiaochun', name: '龙小淳(男)', language: 'zh-CN', gender: 'male', description: '沉稳大气，适合纪录片/知识类' },
  { id: 'longxiaoxia', name: '龙小夏(女)', language: 'zh-CN', gender: 'female', description: '清新自然，适合Vlog/日常' },
  { id: 'longxiaoyu', name: '龙小玉(女)', language: 'zh-CN', gender: 'female', description: '活泼可爱，适合种草/娱乐' },
  { id: 'longxiaobai', name: '龙小白(男)', language: 'zh-CN', gender: 'male', description: '阳光少年，适合校园/青春' },
  { id: 'longxiaocheng', name: '龙小诚(男)', language: 'zh-CN', gender: 'male', description: '成熟稳重，适合商业/企业' },
  { id: 'longxiaofei', name: '龙小飞(男)', language: 'zh-CN', gender: 'male', description: '激情澎湃，适合运动/电竞' },
  { id: 'longxiaomeng', name: '龙小萌(女)', language: 'zh-CN', gender: 'female', description: '甜美软萌，适合情感/治愈' },
  { id: 'longxiaorou', name: '龙小柔(女)', language: 'zh-CN', gender: 'female', description: '温柔知性，适合电台/阅读' },
  { id: 'longxiaoqi', name: '龙小琪(女)', language: 'zh-CN', gender: 'female', description: '专业干练，适合新闻/播报' },
  { id: 'longxiaoyang', name: '龙小扬(男)', language: 'zh-CN', gender: 'male', description: '幽默风趣，适合脱口秀/段子' },
];

function getApiKey(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getDashScopeApiKey } = require('@/lib/runtime-config');
    return getDashScopeApiKey() || process.env.DASHSCOPE_API_KEY || '';
  } catch {
    return process.env.DASHSCOPE_API_KEY || '';
  }
}

/** 将长文本按标点分割为多个片段（每段 ≤ 250 字符） */
function splitText(text: string, maxLen = 250): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const char of text) {
    current += char;
    if (/[。！？；\n.!?;]/.test(char) && current.length > 10) {
      if (current.length > maxLen) {
        // 超长句，按逗号拆分
        const subs = current.split(/[,，]/);
        let sub = '';
        for (const s of subs) {
          if ((sub + s).length > maxLen && sub) {
            chunks.push(sub.trim());
            sub = s;
          } else {
            sub += (sub ? '，' : '') + s;
          }
        }
        if (sub) chunks.push(sub.trim());
      } else {
        chunks.push(current.trim());
      }
      current = '';
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

export const cosyvoiceCloudProvider: TtsProvider = {
  id: 'cosyvoice-cloud',
  name: 'CosyVoice (云端)',
  isLocal: false,

  async getVoices(): Promise<TtsVoice[]> {
    return VOICES;
  },

  async synthesize(options: TtsSynthesizeOptions): Promise<TtsSynthesizeResult> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('CosyVoice Cloud: 未配置 DASHSCOPE_API_KEY');

    const chunks = splitText(options.text);
    const buffers: Buffer[] = [];

    for (const chunk of chunks) {
      const res = await fetch(COSYVOICE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-DashScope-Async': 'false',
        },
        body: JSON.stringify({
          model: 'cosyvoice-v3-flash',
          input: { text: chunk },
          parameters: {
            voice: options.voice,
            speed: options.speed || 1.0,
            pitch: options.pitch || 0,
            format: options.format || 'mp3',
          },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`CosyVoice 合成失败: ${res.status} ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const audioUrl = data?.output?.audio_url;
      if (!audioUrl) throw new Error('CosyVoice: 未返回音频 URL');

      const audioRes = await fetch(audioUrl, {
        signal: AbortSignal.timeout(30000),
      });
      if (!audioRes.ok) throw new Error(`CosyVoice: 音频下载失败 ${audioRes.status}`);

      buffers.push(Buffer.from(await audioRes.arrayBuffer()));
    }

    return {
      audioBuffer: Buffer.concat(buffers),
      mimeType: `audio/${options.format || 'mpeg'}`,
      provider: 'cosyvoice-cloud',
    };
  },

  async healthCheck(): Promise<boolean> {
    try {
      const apiKey = getApiKey();
      if (!apiKey) return false;
      const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-DashScope-Async': 'false',
        },
        body: JSON.stringify({
          model: 'cosyvoice-v3-flash',
          input: { text: '测试' },
          parameters: { voice: 'longxiaochun', format: 'mp3' },
        }),
        signal: AbortSignal.timeout(15000),
      });
      return res.ok || res.status === 429; // 429 也算在线（被限流但服务可用）
    } catch {
      return false;
    }
  },
};
