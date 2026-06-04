// 视频模型注册表 — 客户端安全（无 server-only 依赖）
// 环境变量通过 getQualityTiers() 延迟读取，避免模块加载时捕获 undefined

export type VideoProvider = 'dashscope' | 'ark';

export interface VideoModelConfig {
  provider: VideoProvider;
  model: string;
  resolution?: string;
  size?: string;
  price?: string;
  extraParams?: Record<string, unknown>;
}

export interface QualityTier {
  value: string;
  label: string;
  icon: string;
  description: string;
  recommended?: boolean;
  t2v: VideoModelConfig;
  i2v: VideoModelConfig;
  multiImageI2v?: VideoModelConfig;
}

export const DEFAULT_TIER = 'fast' as const;

export function getQualityTiers(): Record<string, QualityTier> {
  return {
    fast: {
      value: 'fast',
      label: '流畅',
      icon: '⚡',
      description: '快速省流 · 适合批量生成',
      recommended: true,
      t2v: {
        provider: 'ark',
        model: process.env.SEEDANCE_FAST_MODEL_ID || 'doubao-seedance-1-0-pro-fast-251015',
        resolution: '720p',
        price: '约¥0.08/秒(离线5折)',
      },
      i2v: {
        provider: 'ark',
        model: process.env.SEEDANCE_LITE_I2V_MODEL_ID || 'doubao-seedance-1-0-lite-i2v-250428',
        resolution: '720p',
        price: '约¥0.15/秒(离线5折)',
      },
      multiImageI2v: {
        provider: 'ark',
        model: process.env.SEEDANCE_LITE_I2V_MODEL_ID || 'doubao-seedance-1-0-lite-i2v-250428',
        resolution: '720p',
        price: '约¥0.2/秒(离线5折)',
      },
    },
    standard: {
      value: 'standard',
      label: '标准',
      icon: '🎯',
      description: '均衡画质 · Wan 2.6 引擎',
      recommended: false,
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
        price: '约¥0.3/秒(多帧+离线5折)',
      },
    },
    premium: {
      value: 'premium',
      label: '高清',
      icon: '💎',
      description: '大片画质 · 最佳效果',
      recommended: false,
      t2v: {
        provider: 'ark',
        model: process.env.SEEDANCE_VIDEO_MODEL_ARK_ID || 'doubao-seedance-1-5-pro-251215',
        resolution: '1080p',
        price: '约¥0.28/秒(离线5折)',
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
        price: '约¥0.4/秒(多帧+离线5折)',
      },
    },
  };
}

// 向后兼容：保持模块级导出的 QUALITY_TIERS（延迟初始化）
let _cachedTiers: Record<string, QualityTier> | null = null;
export const QUALITY_TIERS: Record<string, QualityTier> = new Proxy({} as Record<string, QualityTier>, {
  get(_, prop) {
    if (!_cachedTiers) _cachedTiers = getQualityTiers();
    return _cachedTiers[prop as string];
  },
  ownKeys() {
    if (!_cachedTiers) _cachedTiers = getQualityTiers();
    return Reflect.ownKeys(_cachedTiers);
  },
  getOwnPropertyDescriptor(_, prop) {
    if (!_cachedTiers) _cachedTiers = getQualityTiers();
    return Reflect.getOwnPropertyDescriptor(_cachedTiers, prop);
  },
});
