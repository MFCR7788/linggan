// 视频模型注册表 — 客户端安全（无 server-only 依赖）

export type VideoProvider = 'dashscope' | 'ark';

export interface VideoModelConfig {
  provider: VideoProvider;
  model: string;
  resolution?: string;        // DashScope: '720P' / ARK: '720p'/'1080p'
  size?: string;              // Wan 专用: '1280*720'
  price?: string;             // 展示用
  extraParams?: Record<string, unknown>;
}

export interface QualityTier {
  value: string;
  label: string;
  icon: string;
  description: string;
  t2v: VideoModelConfig;
  i2v: VideoModelConfig;
  /** 多关键帧模式（首帧 + 尾帧 + 可选中间关键帧） */
  multiImageI2v?: VideoModelConfig;
}

export const QUALITY_TIERS: Record<string, QualityTier> = {
  fast: {
    value: 'fast',
    label: '流畅',
    icon: '⚡',
    description: '快速省流 · 适合批量生成',
    t2v: {
      provider: 'ark',
      model: process.env.SEEDANCE_FAST_MODEL_ID || 'doubao-seedance-1-0-pro-fast-251015',
      resolution: '720p',
      price: '约¥0.16/秒',
    },
    i2v: {
      provider: 'ark',
      model: process.env.SEEDANCE_LITE_I2V_MODEL_ID || 'doubao-seedance-1-0-lite-i2v-250428',
      resolution: '720p',
      price: '约¥0.3/秒',
    },
    multiImageI2v: {
      provider: 'ark',
      model: process.env.SEEDANCE_LITE_I2V_MODEL_ID || 'doubao-seedance-1-0-lite-i2v-250428',
      resolution: '720p',
      price: '约¥0.4/秒(多帧)',
    },
  },
  standard: {
    value: 'standard',
    label: '标准',
    icon: '🎯',
    description: '均衡画质 · Wan 2.6 引擎',
    t2v: {
      provider: 'dashscope',
      model: 'wan2.6-t2v',
      resolution: '720P',
      size: '1280*720',
      extraParams: { prompt_extend: true, shot_type: 'multi' },
      price: '约¥0.5/秒',
    },
    i2v: {
      provider: 'dashscope',
      model: 'wan2.6-i2v',
      resolution: '720P',
      size: '1280*720',
      extraParams: { prompt_extend: true, shot_type: 'multi' },
      price: '约¥0.5/秒',
    },
    multiImageI2v: {
      provider: 'ark',
      model: process.env.SEEDANCE_VIDEO_MODEL_ARK_ID || 'doubao-seedance-1-5-pro-251215',
      resolution: '720p',
      price: '约¥0.6/秒(多帧)',
    },
  },
  premium: {
    value: 'premium',
    label: '高清',
    icon: '💎',
    description: '大片画质 · 最佳效果',
    t2v: {
      provider: 'ark',
      model: process.env.SEEDANCE_VIDEO_MODEL_ARK_ID || 'doubao-seedance-1-5-pro-251215',
      resolution: '1080p',
      price: '约¥0.56/秒',
    },
    i2v: {
      provider: 'dashscope',
      model: 'happyhorse-1.0-i2v',
      resolution: '720P',
      price: '约¥0.9/秒',
    },
    multiImageI2v: {
      provider: 'ark',
      model: process.env.SEEDANCE_VIDEO_MODEL_ARK_ID || 'doubao-seedance-1-5-pro-251215',
      resolution: '1080p',
      price: '约¥0.8/秒(多帧高清)',
    },
  },
};
