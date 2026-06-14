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
