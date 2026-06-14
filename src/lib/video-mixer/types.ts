// 视频混剪 — 类型定义

/** 素材片段 */
export interface MixSegment {
  /** 唯一 ID */
  id: string;
  /** 视频 URL 或本地路径 */
  videoUrl: string;
  /** 素材来源 */
  source: 'ai-generated' | 'upload' | 'pexels' | 'pixabay' | 'unsplash';
  /** 剪辑起始时间(秒) */
  trimStart: number;
  /** 剪辑结束时间(秒) */
  trimEnd: number;
  /** 原视频总时长(秒)，用于校验 */
  originalDuration: number;
  /** 缩略图 URL */
  thumbnailUrl?: string;
}

/** 转场类型 */
export type TransitionType =
  | 'none'
  | 'fade'
  | 'smoothleft'
  | 'smoothright'
  | 'smoothup'
  | 'smoothdown'
  | 'circlecrop'
  | 'rectcrop'
  | 'circleclose'
  | 'circleopen'
  | 'horzclose'
  | 'horzopen'
  | 'vertclose'
  | 'vertopen'
  | 'diagbl'
  | 'diagbr'
  | 'diagtl'
  | 'diagtr'
  | 'hlslice'
  | 'hrslice'
  | 'vuslice'
  | 'vdslice'
  | 'dissolve'
  | 'pixelize'
  | 'radial'
  | 'hblur'
  | 'wipetl'
  | 'wipetr'
  | 'wipebl'
  | 'wipebr'
  | 'zoomin';

/** 转场配置 */
export interface MixTransition {
  /** 转场类型 */
  type: TransitionType;
  /** 转场持续时间(秒) */
  duration: number;
}

/** 混剪项目 */
export interface MixProject {
  /** 片段列表（按顺序） */
  segments: MixSegment[];
  /** 每两个片段之间的转场（长度 = segments.length - 1） */
  transitions: MixTransition[];
  /** 背景音乐配置 */
  bgm?: MixBGMConfig;
  /** 字幕配置 */
  subtitle?: MixSubtitleConfig;
  /** 输出分辨率 */
  outputResolution: '720p' | '1080p';
  /** 输出宽高比 */
  outputAspect: '16:9' | '9:16' | '1:1';
}

/** BGM 风格定义 */
export interface BGMStyle {
  id: string;
  name: string;
  description: string;
  suitableFor: string[];
  defaultVolume: number;
  supportsDucking: boolean;
}

/** 所有 BGM 风格 */
export const BGM_STYLES: BGMStyle[] = [
  { id: 'tech', name: '科技感', description: '电子合成，适合科技/数码/产品展示', suitableFor: ['科技', '数码', '产品展示', '开箱'], defaultVolume: 0.25, supportsDucking: true },
  { id: 'chill', name: '轻松休闲', description: '轻柔舒缓，适合Vlog/日常/旅行', suitableFor: ['Vlog', '日常', '旅行', '治愈'], defaultVolume: 0.3, supportsDucking: true },
  { id: 'hype', name: '激情动感', description: '节奏强劲，适合运动/电竞/快节奏', suitableFor: ['运动', '电竞', '快节奏', '混剪'], defaultVolume: 0.2, supportsDucking: false },
  { id: 'elegant', name: '优雅典雅', description: '古典/爵士，适合品牌/时尚/高端', suitableFor: ['品牌', '时尚', '高端', '婚礼'], defaultVolume: 0.22, supportsDucking: true },
  { id: 'energetic', name: '活力阳光', description: '明快活泼，适合美食/种草/娱乐', suitableFor: ['美食', '种草', '娱乐', '探店'], defaultVolume: 0.25, supportsDucking: true },
  { id: 'cinematic', name: '电影感', description: '史诗/管弦，适合大片/宣传片', suitableFor: ['宣传片', '品牌故事', '旅行大片'], defaultVolume: 0.28, supportsDucking: true },
  { id: 'lofi', name: 'Lo-Fi 放松', description: 'Lo-Fi Hip Hop，适合学习/阅读/知识', suitableFor: ['学习', '阅读', '知识', '播客'], defaultVolume: 0.25, supportsDucking: true },
  { id: 'corporate', name: '商务专业', description: '干净利落，适合企业/B2B/财经', suitableFor: ['企业', 'B2B', '财经', '新闻'], defaultVolume: 0.2, supportsDucking: true },
];

/** BGM 配置 */
export interface MixBGMConfig {
  /** BGM 风格: tech/chill/hype/elegant/energetic，或本地文件路径 */
  style: string;
  /** 音量 (0-1) */
  volume: number;
  /** 是否启用闪避（人声时自动降低 BGM 音量） */
  ducking: boolean;
}

/** 字幕配置 */
export interface MixSubtitleConfig {
  /** 是否启用 */
  enabled: boolean;
  /** SRT/ASS 文件路径 */
  file: string;
  /** 字幕格式 */
  format: 'srt' | 'ass';
  /** 样式 */
  style: string;
  /** 位置 */
  position: string;
}

/** 混剪提交结果 */
export interface MixSubmitResult {
  /** 任务 ID */
  taskId: string;
  /** 批次 ID */
  batchId?: string;
  /** 状态 */
  status: 'queued' | 'processing';
}

/** 混剪任务状态 */
export interface MixTaskStatus {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  /** 输出视频 URL */
  outputUrl?: string;
  /** 错误信息 */
  error?: string;
  /** 预计剩余秒数 */
  estimatedSeconds?: number;
}
