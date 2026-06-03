// 共享样式常量和映射

// 内容类型对应的 emoji 和标签
export const TYPE_EMOJIS: Record<string, string> = {
  text: "✨",
  link: "📝",
  image: "🖼️",
  video: "🎬",
  voice: "✍️",
  schedule: "📅",
};

export const TYPE_LABELS: Record<string, string> = {
  text: "灵感",
  link: "选题",
  image: "图片",
  video: "视频",
  voice: "文案",
  schedule: "日程",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  saved: "已收藏",
  used: "已使用",
  archived: "已归档",
  active: "正常",
};

// 热度颜色
export const HEAT_LEVELS = {
  high: { bg: "rgba(239,68,68,0.2)", text: "#EF4444", label: "高" },
  medium: { bg: "rgba(251,191,36,0.2)", text: "#FBBF24", label: "中" },
  low: { bg: "rgba(156,163,175,0.15)", text: "#9CA3AF", label: "低" },
};

// 平台颜色映射
export const PLATFORM_COLORS: Record<string, string> = {
  weibo: "#E0534A",
  zhihu: "#3B82F6",
  bilibili: "#FB7299",
  xiaohongshu: "#F43F5E",
  sogou: "#FF8C00",
  baidu: "#1E90FF",
  douyin: "#000000",
  toutiao: "#FF4757",
  bing: "#00A4EF",
  hackernews: "#FF6600",
  youtube: "#FF0000",
  twitter: "#1DA1F2",
  weixin: "#07C160",
};

export function getPlatformColor(platform: string): string {
  return PLATFORM_COLORS[platform.toLowerCase()] || "#6366F1";
}

// 导航路由映射
// 注意: 带 id 的详情页(inspiration-detail / hotspot-detail)不带 query,
// 调用方应直接用 router.push(`/hotspot/detail?id=${item.id}`) 而非 handleNavigate
export const PAGE_ROUTES: Record<string, string> = {
  home: '/home',
  inspiration: '/inspiration',
  'inspiration-detail': '/inspiration/detail',
  ai: '/ai',
  'ai-copywriting': '/ai/copywriting',
  'ai-image': '/ai/image',
  'ai-video': '/ai/video',
  hotspot: '/hotspot',
  'hotspot-detail': '/hotspot/detail',
  'hotspot-library': '/hotspot/library',
  profile: '/profile',
  notification: '/notification',
  capture: '/capture',
  schedule: '/schedule',
  login: '/login',
  'ai-tts': '/ai/tts',
  'ai-digital-human': '/ai/digital-human',
  'profile-help': '/profile/help',
};

// 常用背景色
export const BG_GLASS = "rgba(255,255,255,0.06)";
export const BG_GLASS_HOVER = "rgba(255,255,255,0.1)";
export const BORDER_GLASS = "1px solid rgba(255,255,255,0.1)";
export const BORDER_PRIMARY = "1px solid rgba(59,130,246,0.3)";

// 常用按钮/标签背景
export function getFilterButtonStyle(active: boolean, activeColor = "rgba(59,130,246,0.2)") {
  return {
    background: active ? activeColor : "rgba(255,255,255,0.07)",
    border: active
      ? `1px solid rgba(59,130,246,0.4)`
      : BORDER_GLASS,
    color: active ? "#93C5FD" : "#9CA3AF",
  };
}

// 格式化时间
// ─── AI 视频语言选项 ────────────────────────────────────────

export interface LanguageOption {
  value: string;
  label: string;
  nativeLabel: string;
  icon: string;
  promptInstruction: string;  // 注入生成 prompt 的语言指令
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: 'zh', label: '中文', nativeLabel: '中文', icon: '🇨🇳', promptInstruction: '字幕使用简体中文，语言自然口语化，适合中文短视频平台' },
  { value: 'en', label: 'English', nativeLabel: 'English', icon: '🇺🇸', promptInstruction: '字幕使用英文，语言自然口语化，适合英文短视频平台' },
  { value: 'ja', label: '日本語', nativeLabel: '日本語', icon: '🇯🇵', promptInstruction: '字幕使用日语，语言自然口语化，适合日文短视频平台' },
  { value: 'ko', label: '한국어', nativeLabel: '한국어', icon: '🇰🇷', promptInstruction: '字幕使用韩语，语言自然口语化，适合韩文短视频平台' },
];

// ─── AI 视频风格预设 ────────────────────────────────────────

export interface StylePreset {
  label: string;
  icon: string;
  bgm: 'tech' | 'chill' | 'hype';
  subtitle: string;       // subtitleStyle 默认值
  subtitlePos: string;    // subtitlePosition 默认值
  recDuration: number;    // 推荐时长
  visualStyle: string;    // 注入 DeepSeek prompt 的视觉风格关键词
}

export const STYLE_PRESETS: Record<string, StylePreset> = {
  douyin_hot: {
    label: '抖音爆款',
    icon: '🔥',
    bgm: 'hype',
    subtitle: '白色粗体',
    subtitlePos: '底部',
    recDuration: 15,
    visualStyle: 'fast-paced, high energy, trendy transitions, bold colors',
  },
  healing_vlog: {
    label: '治愈vlog',
    icon: '🌿',
    bgm: 'chill',
    subtitle: '白色粗体',
    subtitlePos: '底部',
    recDuration: 30,
    visualStyle: 'warm tones, soft lighting, slow and calming, natural atmosphere',
  },
  product_show: {
    label: '产品展示',
    icon: '✨',
    bgm: 'tech',
    subtitle: '黑底白字',
    subtitlePos: '底部',
    recDuration: 60,
    visualStyle: 'clean, professional, smooth camera movement, product-focused',
  },
  knowledge: {
    label: '知识科普',
    icon: '📚',
    bgm: 'chill',
    subtitle: '黑底白字',
    subtitlePos: '中部',
    recDuration: 60,
    visualStyle: 'documentary style, clear, informative, structured, clean text overlays',
  },
  cyberpunk: {
    label: '赛博朋克',
    icon: '🌆',
    bgm: 'tech',
    subtitle: '渐变彩色',
    subtitlePos: '底部',
    recDuration: 15,
    visualStyle: 'cyberpunk, neon lights, futuristic, dark atmosphere, high contrast',
  },
  random: {
    label: '随机风格',
    icon: '🎲',
    bgm: 'tech',
    subtitle: '白色粗体',
    subtitlePos: '底部',
    recDuration: 10,
    visualStyle: 'creative, original, cinematic, visually striking',
  },
};

// ─── 时间格式化 ──────────────────────────────────────────────

export function formatRelativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}
