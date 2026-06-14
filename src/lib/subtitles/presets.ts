// 字幕样式预设 — 10+ 种风格，比 MoneyPrinterPlus 的单一白字更丰富

import type { SubtitleStyle, SubtitleLayout, SubtitlePosition } from './types';

// ─── 样式预设 ────────────────────────────────────────────────

export const SUBTITLE_STYLES: Record<string, SubtitleStyle> = {
  /** 白色粗体 — 经典醒目，适合大多数场景 */
  whiteBold: {
    name: '白色粗体',
    fontName: 'PingFang SC',
    fontSize: 22,
    primaryColor: '&HFFFFFF&',
    outlineColor: '&H000000&',
    outline: 2,
    shadow: 1,
    bold: 1,
    spacing: 1,
  },

  /** 黄色描边 — 活泼俏皮，适合 Vlog/美食 */
  yellowStroke: {
    name: '黄色描边',
    fontName: 'PingFang SC',
    fontSize: 22,
    primaryColor: '&H00FFFF&',
    outlineColor: '&H000000&',
    outline: 2,
    shadow: 0,
    bold: 0,
    spacing: 1,
  },

  /** 黑底白字 — 高可读性，适合知识/教程类 */
  blackBg: {
    name: '黑底白字',
    fontName: 'PingFang SC',
    fontSize: 20,
    primaryColor: '&HFFFFFF&',
    outlineColor: '&H000000&',
    outline: 0,
    shadow: 0,
    bold: 0,
    spacing: 1,
    backColor: '&H80000000&',
  },

  /** 渐变彩色 — 潮流感，适合种草/美妆 */
  gradient: {
    name: '渐变彩色',
    fontName: 'PingFang SC',
    fontSize: 24,
    primaryColor: '&HAA55FF&',
    outlineColor: '&H000000&',
    outline: 1,
    shadow: 0,
    bold: 1,
    spacing: 1,
    secondaryColor: '&H55AAFF&',
  },

  /** 抖音风格 — 大号醒目，快节奏短视频 */
  douyin: {
    name: '抖音风格',
    fontName: 'PingFang SC',
    fontSize: 26,
    primaryColor: '&HFFFFFF&',
    outlineColor: '&H000000&',
    outline: 3,
    shadow: 2,
    bold: 1,
    spacing: 2,
  },

  /** 极简细体 — 高端简约，适合品牌/时尚 */
  minimal: {
    name: '极简细体',
    fontName: 'PingFang SC',
    fontSize: 18,
    primaryColor: '&HFFFFFF&',
    outlineColor: '&H000000&',
    outline: 0,
    shadow: 1,
    bold: 0,
    spacing: 3,
  },

  /** 霓虹效果 — 赛博朋克/科技感 */
  neon: {
    name: '霓虹效果',
    fontName: 'PingFang SC',
    fontSize: 22,
    primaryColor: '&H0FF0FF&',
    outlineColor: '&HF0F00F&',
    outline: 1,
    shadow: 3,
    bold: 1,
    spacing: 1,
    secondaryColor: '&HFF00FF&',
  },

  /** 手写风格 — 温馨治愈，适合情感/日常 */
  handwritten: {
    name: '手写风格',
    fontName: 'STKaiti',
    fontSize: 22,
    primaryColor: '&HFFFFFF&',
    outlineColor: '&H000000&',
    outline: 1,
    shadow: 1,
    bold: 0,
    spacing: 1,
  },

  /** 剧透弹幕 — 弹幕风格，红色醒目 */
  barrage: {
    name: '剧透弹幕',
    fontName: 'PingFang SC',
    fontSize: 20,
    primaryColor: '&H0000FF&',
    outlineColor: '&HFFFFFF&',
    outline: 2,
    shadow: 0,
    bold: 1,
    spacing: 0,
  },

  /** 卡拉OK — 逐字高亮，适合音乐/节奏类 */
  karaoke: {
    name: '卡拉OK',
    fontName: 'PingFang SC',
    fontSize: 24,
    primaryColor: '&H00FFFF&',
    outlineColor: '&H000000&',
    outline: 2,
    shadow: 0,
    bold: 1,
    spacing: 1,
    karaoke: true,
    secondaryColor: '&HFFFFFF&',
  },
};

// ─── 位置预设 ────────────────────────────────────────────────

export const SUBTITLE_LAYOUTS: Record<string, SubtitleLayout> = {
  bottom: {
    position: 'bottom',
    alignment: 2,   // ASS: 底部居中
    marginV: 50,
    marginL: 10,
    marginR: 10,
  },
  top: {
    position: 'top',
    alignment: 8,   // ASS: 顶部居中
    marginV: 30,
    marginL: 10,
    marginR: 10,
  },
  middle: {
    position: 'middle',
    alignment: 5,   // ASS: 居中
    marginV: 0,
    marginL: 20,
    marginR: 20,
  },
  bottomLeft: {
    position: 'bottom',
    alignment: 1,   // ASS: 左下
    marginV: 50,
    marginL: 20,
    marginR: 20,
  },
};

/** 获取位置布局 */
export function getLayout(position: SubtitlePosition): SubtitleLayout {
  return SUBTITLE_LAYOUTS[position] || SUBTITLE_LAYOUTS.bottom;
}

/** 获取所有样式名称列表 */
export function getStyleNames(): string[] {
  return Object.keys(SUBTITLE_STYLES);
}

/** 获取所有样式（用于 UI 选择器） */
export function getStyleList(): Array<{ key: string; name: string; preview: string }> {
  return Object.entries(SUBTITLE_STYLES).map(([key, s]) => ({
    key,
    name: s.name,
    preview: `FontSize=${s.fontSize}, PrimaryColor=${s.primaryColor}`,
  }));
}
