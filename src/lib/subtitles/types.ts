// 字幕增强 — 类型定义

/** 字幕样式 */
export interface SubtitleStyle {
  /** 样式名称 */
  name: string;
  /** 字体名 */
  fontName: string;
  /** 字号 */
  fontSize: number;
  /** 主色 (BGR hex, ASS 格式: &HBBGGRR&) */
  primaryColor: string;
  /** 描边色 */
  outlineColor: string;
  /** 描边宽度 (0=无描边) */
  outline: number;
  /** 阴影深度 */
  shadow: number;
  /** 粗体 (0/1) */
  bold: number;
  /** 字间距 */
  spacing: number;
  /** 背景色（用于黑底白字等风格） */
  backColor?: string;
  /** ASS 特有：卡拉OK 效果 (0=无, 1=逐字高亮) */
  karaoke?: boolean;
  /** ASS 特有：渐变填充色 */
  secondaryColor?: string;
}

/** 字幕位置 */
export type SubtitlePosition = 'bottom' | 'top' | 'middle';

/** 字幕布局 */
export interface SubtitleLayout {
  /** 位置 */
  position: SubtitlePosition;
  /** ASS alignment: 1-9 (小键盘位置) */
  alignment: number;
  /** 垂直边距（像素） */
  marginV: number;
  /** 左右边距（像素） */
  marginL: number;
  marginR: number;
}

/** 字幕动画类型 */
export type SubtitleAnimation = 'none' | 'karaoke' | 'fadeIn' | 'typewriter';

/** 双语字幕配置 */
export interface DualSubtitleConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 第二语言（默认 en） */
  language: string;
  /** 第二语言字幕的位置（默认在主字幕上方） */
  position: 'above' | 'below';
  /** 第二语言字号倍率（相对于主字幕） */
  fontSizeRatio: number;
}

/** 字幕生成选项 */
export interface SubtitleGenerateOptions {
  /** 音频文件路径 */
  audioPath: string;
  /** 输出字幕路径 */
  outputPath: string;
  /** 字幕格式 */
  format: 'srt' | 'ass';
  /** 样式 */
  style: SubtitleStyle;
  /** 布局 */
  layout: SubtitleLayout;
  /** 动画 */
  animation?: SubtitleAnimation;
  /** 双语字幕 */
  dual?: DualSubtitleConfig;
  /** 语言 */
  language?: string;
}

/** 字幕烧录选项 */
export interface SubtitleBurnOptions {
  /** 视频文件路径 */
  videoPath: string;
  /** 字幕文件路径 */
  subtitlePath: string;
  /** 字幕格式 */
  format: 'srt' | 'ass';
  /** 样式 */
  style: SubtitleStyle;
  /** 布局 */
  layout: SubtitleLayout;
  /** 输出路径（不指定则覆盖原视频） */
  outputPath?: string;
  /** 字体目录 */
  fontsDir?: string;
}

/** AI 优化后的字幕片段 */
export interface OptimizedSubtitle {
  index: number;
  startTime: number; // 秒
  endTime: number;   // 秒
  text: string;
  /** 第二语言翻译 */
  translation?: string;
}
