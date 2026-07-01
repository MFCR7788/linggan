// ─── 数字人共享类型与常量 ────────────────────────────────

export interface VoiceOption {
  key: string;
  label: string;
  id: string;
  language?: string;
}

export type DigitalHumanMode = 's2v' | 'animate' | 'avatar';

export interface AnimatePreset {
  imageUrl: string;
  imagePreview: string | null;
  name: string;
  savedAt: number;
}

export const ANIMATE_PRESET_KEY = 'lingji_animate_preset';

export interface BatchItem {
  id: string;
  topic: string;
  script: string;
  audioUrl: string | null;
  taskId: string | null;
  videoUrl: string | null;
  status: 'pending' | 'scripting' | 'tts' | 'uploading' | 'submitting' | 'generating' | 'done' | 'error';
  errorMsg?: string;
}

export const RESOLUTION_OPTIONS = [
  { key: '480P' as const, label: '480P', cost: '10 灵力/段' },
  { key: '720P' as const, label: '720P', cost: '20 灵力/段' },
];

export const MODES: { key: DigitalHumanMode; label: string; icon: string; desc: string }[] = [
  { key: 's2v', label: '数字人口播', icon: '👤', desc: '图片+音频→口播视频' },
  { key: 'animate', label: '角色动作迁移', icon: '🎭', desc: '图+参考视频→动作复刻' },
  { key: 'avatar', label: '数字分身', icon: '🧬', desc: 'HeyGen 个人分身口播' },
];

export const ORAL_STYLES = [
  { key: 'oral', label: '自然口播', desc: '亲切聊天式' },
  { key: 'livestream', label: '直播带货', desc: '热情促销式' },
  { key: 'news', label: '新闻播报', desc: '正式专业式' },
  { key: 'emotional', label: '情感讲述', desc: '温柔舒缓式' },
];

export const LANGUAGES = [
  { key: 'zh', label: '中文', native: '中文' },
  { key: 'en', label: 'English', native: 'English' },
  { key: 'ja', label: '日本語', native: '日本語' },
  { key: 'ko', label: '한국어', native: '한국어' },
];

export const BATCH_STATUS_LABELS: Record<BatchItem['status'], { text: string; color: string; bg: string }> = {
  pending: { text: '等待中', color: '#9CA3AF', bg: 'rgba(255,255,255,0.05)' },
  scripting: { text: '写稿中', color: '#60A5FA', bg: 'rgba(59,130,246,0.1)' },
  tts: { text: '配音中', color: '#C4B5FD', bg: 'rgba(139,92,246,0.1)' },
  uploading: { text: '上传中', color: '#FCD34D', bg: 'rgba(245,158,11,0.1)' },
  submitting: { text: '提交中', color: '#FCD34D', bg: 'rgba(245,158,11,0.1)' },
  generating: { text: '生成中', color: '#67E8F9', bg: 'rgba(6,182,212,0.1)' },
  done: { text: '已完成', color: '#86EFAC', bg: 'rgba(34,197,94,0.1)' },
  error: { text: '失败', color: '#FCA5A5', bg: 'rgba(239,68,68,0.1)' },
};

export const OC_PHASES: Record<string, string> = {
  idle: '准备中', scripting: 'AI 写稿中', tts: '语音合成中',
  uploading: '上传音频中', submitting: '提交任务中', generating: '生成视频中',
  merging: '合并视频中', done: '完成', error: '出错',
};
