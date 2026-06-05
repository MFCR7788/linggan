// AI Services - 百炼 DashScope 统一配置

// 主 Key — 百炼 DashScope（文本/图片/视频/TTS/ASR 全部走这个）
export const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
if (!DASHSCOPE_API_KEY && process.env.NODE_ENV === 'production') {
  console.warn('[百炼] DASHSCOPE_API_KEY 未配置, AI 服务将不可用');
}

// DashScope API 端点
export const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DASHSCOPE_VIDEO_BASE = 'https://dashscope.aliyuncs.com/api/v1';
export const DASHSCOPE_S2V_BASE = 'https://dashscope.aliyuncs.com/api/v1';

// HappyHorse / Wan 视频生成 — 与 DashScope 共用 Key
export const HAPPYHORSE_API_KEY = DASHSCOPE_API_KEY;

// 保留：HeyGen 数字人分身（百炼无替代方案）
export const HEYGEN_BASE = 'https://api.heygen.com';
export const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
