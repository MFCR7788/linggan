// 视频模型注册表 — 百炼 DashScope Wan 系列 + 火山引擎 Seedance 2.0

export type VideoProvider = 'dashscope' | 'seedance';

// Seedance 2.0 模型常量
export const SEEDANCE_STANDARD = 'doubao-seedance-2-0-260128';
export const SEEDANCE_FAST = 'doubao-seedance-2-0-fast-260128';

export interface VideoModelConfig {
  provider: VideoProvider;
  model: string;
  resolution?: string;
  size?: string;
  price?: string;
  maxDuration?: number;
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
      description: '720P · 单段最长 5s',
      recommended: true,
      t2v: {
        provider: 'dashscope',
        model: 'wan2.6-t2v',
        resolution: '720P',
        size: '1280*720',
        maxDuration: 5,
        extraParams: { prompt_extend: true },
        price: '约¥0.6/秒',
      },
      i2v: {
        provider: 'dashscope',
        model: 'wan2.6-i2v',
        resolution: '720P',
        size: '1280*720',
        maxDuration: 5,
        extraParams: { prompt_extend: true },
        price: '约¥0.6/秒',
      },
      multiImageI2v: {
        provider: 'dashscope',
        model: 'wan2.6-i2v',
        resolution: '720P',
        size: '1280*720',
        maxDuration: 5,
        extraParams: { prompt_extend: true },
        price: '约¥0.8/秒',
      },
    },
    standard: {
      value: 'standard',
      label: '高清',
      icon: '🎯',
      description: '1080P · 单段最长 10s',
      t2v: {
        provider: 'dashscope',
        model: 'wan2.6-t2v',
        resolution: '1080P',
        size: '1920*1080',
        maxDuration: 10,
        extraParams: { prompt_extend: true },
        price: '约¥1.0/秒',
      },
      i2v: {
        provider: 'dashscope',
        model: 'wan2.6-i2v',
        resolution: '1080P',
        size: '1920*1080',
        maxDuration: 10,
        extraParams: { prompt_extend: true },
        price: '约¥1.0/秒',
      },
      multiImageI2v: {
        provider: 'dashscope',
        model: 'wan2.6-i2v',
        resolution: '1080P',
        size: '1920*1080',
        maxDuration: 10,
        extraParams: { prompt_extend: true },
        price: '约¥1.2/秒',
      },
    },
    premium: {
      value: 'premium',
      label: '超清',
      icon: '💎',
      description: '1080P · 单段最长 15s',
      t2v: {
        provider: 'dashscope',
        model: 'wan2.6-t2v',
        resolution: '1080P',
        size: '1920*1080',
        maxDuration: 15,
        extraParams: { prompt_extend: true },
        price: '约¥1.5/秒',
      },
      i2v: {
        provider: 'dashscope',
        model: 'wan2.6-i2v',
        resolution: '1080P',
        size: '1920*1080',
        maxDuration: 15,
        extraParams: { prompt_extend: true },
        price: '约¥1.5/秒',
      },
      multiImageI2v: {
        provider: 'dashscope',
        model: 'wan2.6-i2v',
        resolution: '1080P',
        size: '1920*1080',
        maxDuration: 15,
        extraParams: { prompt_extend: true },
        price: '约¥2.0/秒',
      },
    },
  };
}

// 向后兼容
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
