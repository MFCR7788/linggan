// AI Services - Shared Constants

export const HAPPYHORSE_API_KEY = process.env.HAPPYHORSE_API_KEY;
if (!HAPPYHORSE_API_KEY && process.env.NODE_ENV === 'production') {
  console.warn('[HappyHorse] HAPPYHORSE_API_KEY 未配置, 视频生成相关接口将不可用');
}

export const DASHSCOPE_VIDEO_BASE = 'https://dashscope.aliyuncs.com/api/v1';
export const DOUBAO_BASE_URL = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
export const DASHSCOPE_S2V_BASE = 'https://dashscope.aliyuncs.com/api/v1';

export const VOLC_TTS_HOST = 'openspeech.bytedance.com';

export const HEYGEN_BASE = 'https://api.heygen.com';
export const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

export const SEEDANCE_SERVICE_TIER = (process.env.SEEDANCE_SERVICE_TIER === 'default' ? 'default' : 'flex') as 'flex' | 'default';
export const SEEDANCE_SUPPORTS_FLEX = (model: string) => model.includes('seedance-1-');
