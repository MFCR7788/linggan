// 视频模型注册表 — 全部使用百炼 DashScope Wan 系列

export type VideoProvider = 'dashscope';

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
        provider: 'dashscope',
        model: 'wan2.6-t2v',
        resolution: '720P',
        size: '1280*720',
        extraParams: { prompt_extend: true },
        price: '约¥0.1/秒',
      },
      i2v: {
        provider: 'dashscope',
        model: 'wan2.6-i2v',
        resolution: '720P',
        size: '1280*720',
        extraParams: { prompt_extend: true },
        price: '约¥0.1/秒',
      },
      multiImageI2v: {
        provider: 'dashscope',
        model: 'wan2.6-i2v',
        resolution: '720P',
        size: '1280*720',
        extraParams: { prompt_extend: true },
        price: '约¥0.15/秒',
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
        provider: 'dashscope',
        model: 'wan2.6-i2v',
        resolution: '720P',
        size: '1280*720',
        extraParams: { prompt_extend: true },
        price: '约¥0.6/秒',
      },
    },
    premium: {
      value: 'premium',
      label: '高清',
      icon: '💎',
      description: '大片画质 · 最佳效果',
      t2v: {
        provider: 'dashscope',
        model: 'wan2.6-t2v',
        resolution: '1080P',
        size: '1920*1080',
        extraParams: { prompt_extend: true, shot_type: 'multi' },
        price: '约¥0.3/秒',
      },
      i2v: {
        provider: 'dashscope',
        model: 'wan2.6-i2v',
        resolution: '1080P',
        size: '1920*1080',
        extraParams: { prompt_extend: true, shot_type: 'multi' },
        price: '约¥0.4/秒',
      },
      multiImageI2v: {
        provider: 'dashscope',
        model: 'wan2.6-i2v',
        resolution: '1080P',
        size: '1920*1080',
        extraParams: { prompt_extend: true },
        price: '约¥0.5/秒',
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
