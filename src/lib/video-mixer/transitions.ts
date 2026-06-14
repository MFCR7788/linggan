// 视频转场定义 — 30+ xfade 转场效果
// 比 MoneyPrinterPlus 的 28 种多出 segmented 效果

import type { TransitionType } from './types';

export interface TransitionDef {
  type: TransitionType;
  /** 显示名称 */
  label: string;
  /** 中文名 */
  labelZh: string;
  /** 图标 emoji */
  icon: string;
  /** 分类 */
  category: 'fade' | 'slide' | 'shape' | 'wipe' | 'effect';
  /** 推荐最短转场时长(秒) */
  minDuration: number;
  /** 推荐最长转场时长(秒) */
  maxDuration: number;
  /** FFmpeg xfade transition 参数值 */
  xfadeParam: string;
}

/** 所有可用转场 */
export const TRANSITIONS: Record<TransitionType, TransitionDef> = {
  none: {
    type: 'none', label: 'None', labelZh: '无转场', icon: '⬜',
    category: 'fade', minDuration: 0, maxDuration: 0, xfadeParam: 'none',
  },
  fade: {
    type: 'fade', label: 'Fade', labelZh: '淡入淡出', icon: '🌅',
    category: 'fade', minDuration: 0.3, maxDuration: 2.0, xfadeParam: 'fade',
  },
  smoothleft: {
    type: 'smoothleft', label: 'Smooth Left', labelZh: '左滑', icon: '⬅️',
    category: 'slide', minDuration: 0.3, maxDuration: 1.5, xfadeParam: 'smoothleft',
  },
  smoothright: {
    type: 'smoothright', label: 'Smooth Right', labelZh: '右滑', icon: '➡️',
    category: 'slide', minDuration: 0.3, maxDuration: 1.5, xfadeParam: 'smoothright',
  },
  smoothup: {
    type: 'smoothup', label: 'Smooth Up', labelZh: '上滑', icon: '⬆️',
    category: 'slide', minDuration: 0.3, maxDuration: 1.5, xfadeParam: 'smoothup',
  },
  smoothdown: {
    type: 'smoothdown', label: 'Smooth Down', labelZh: '下滑', icon: '⬇️',
    category: 'slide', minDuration: 0.3, maxDuration: 1.5, xfadeParam: 'smoothdown',
  },
  circlecrop: {
    type: 'circlecrop', label: 'Circle Crop', labelZh: '圆形裁剪', icon: '⭕',
    category: 'shape', minDuration: 0.4, maxDuration: 1.5, xfadeParam: 'circlecrop',
  },
  circleclose: {
    type: 'circleclose', label: 'Circle Close', labelZh: '圆形闭合', icon: '🔵',
    category: 'shape', minDuration: 0.4, maxDuration: 1.0, xfadeParam: 'circleclose',
  },
  circleopen: {
    type: 'circleopen', label: 'Circle Open', labelZh: '圆形展开', icon: '🟢',
    category: 'shape', minDuration: 0.4, maxDuration: 1.0, xfadeParam: 'circleopen',
  },
  dissolve: {
    type: 'dissolve', label: 'Dissolve', labelZh: '溶解', icon: '💨',
    category: 'effect', minDuration: 0.5, maxDuration: 2.0, xfadeParam: 'dissolve',
  },
  pixelize: {
    type: 'pixelize', label: 'Pixelize', labelZh: '像素化', icon: '👾',
    category: 'effect', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'pixelize',
  },
  radial: {
    type: 'radial', label: 'Radial', labelZh: '径向', icon: '☀️',
    category: 'effect', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'radial',
  },
  hblur: {
    type: 'hblur', label: 'H Blur', labelZh: '横向模糊', icon: '〰️',
    category: 'effect', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'hblur',
  },
  zoomin: {
    type: 'zoomin', label: 'Zoom In', labelZh: '放大', icon: '🔍',
    category: 'effect', minDuration: 0.3, maxDuration: 1.5, xfadeParam: 'zoomin',
  },
  wipetl: {
    type: 'wipetl', label: 'Wipe TL', labelZh: '左上擦除', icon: '↖️',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'wipetl',
  },
  wipetr: {
    type: 'wipetr', label: 'Wipe TR', labelZh: '右上擦除', icon: '↗️',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'wipetr',
  },
  wipebl: {
    type: 'wipebl', label: 'Wipe BL', labelZh: '左下擦除', icon: '↙️',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'wipebl',
  },
  wipebr: {
    type: 'wipebr', label: 'Wipe BR', labelZh: '右下擦除', icon: '↘️',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'wipebr',
  },
  horzopen: {
    type: 'horzopen', label: 'Horz Open', labelZh: '横向展开', icon: '↔️',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'horzopen',
  },
  horzclose: {
    type: 'horzclose', label: 'Horz Close', labelZh: '横向闭合', icon: '↔️',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'horzclose',
  },
  vertopen: {
    type: 'vertopen', label: 'Vert Open', labelZh: '纵向展开', icon: '↕️',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'vertopen',
  },
  vertclose: {
    type: 'vertclose', label: 'Vert Close', labelZh: '纵向闭合', icon: '↕️',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'vertclose',
  },
  diagtl: {
    type: 'diagtl', label: 'Diag TL', labelZh: '左上斜切', icon: '🔷',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'diagtl',
  },
  diagtr: {
    type: 'diagtr', label: 'Diag TR', labelZh: '右上斜切', icon: '🔶',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'diagtr',
  },
  diagbl: {
    type: 'diagbl', label: 'Diag BL', labelZh: '左下斜切', icon: '🔷',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'diagbl',
  },
  diagbr: {
    type: 'diagbr', label: 'Diag BR', labelZh: '右下斜切', icon: '🔶',
    category: 'wipe', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'diagbr',
  },
  hlslice: {
    type: 'hlslice', label: 'HL Slice', labelZh: '横向切片', icon: '➖',
    category: 'slide', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'hlslice',
  },
  hrslice: {
    type: 'hrslice', label: 'HR Slice', labelZh: '横向切右', icon: '➖',
    category: 'slide', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'hrslice',
  },
  vuslice: {
    type: 'vuslice', label: 'VU Slice', labelZh: '纵向上切', icon: '✂️',
    category: 'slide', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'vuslice',
  },
  vdslice: {
    type: 'vdslice', label: 'VD Slice', labelZh: '纵向下切', icon: '✂️',
    category: 'slide', minDuration: 0.3, maxDuration: 1.0, xfadeParam: 'vdslice',
  },
  rectcrop: {
    type: 'rectcrop', label: 'Rect Crop', labelZh: '矩形裁剪', icon: '🟫',
    category: 'shape', minDuration: 0.4, maxDuration: 1.0, xfadeParam: 'rectcrop',
  },
};

/** 获取过渡效果定义 */
export function getTransition(type: TransitionType): TransitionDef {
  return TRANSITIONS[type] || TRANSITIONS.none;
}

/** 按分类获取转场列表 */
export function getTransitionsByCategory(): Record<string, TransitionDef[]> {
  const cats: Record<string, TransitionDef[]> = {
    fade: [],
    slide: [],
    shape: [],
    wipe: [],
    effect: [],
  };
  for (const t of Object.values(TRANSITIONS)) {
    if (t.type === 'none') continue;
    cats[t.category]?.push(t);
  }
  return cats;
}

/** 获取转场 FFmpeg xfade 参数字符串 */
export function getXfadeParam(type: TransitionType, duration: number): string {
  const def = getTransition(type);
  if (def.type === 'none') return '';
  const dur = Math.max(def.minDuration, Math.min(duration, def.maxDuration));
  return `xfade=transition=${def.xfadeParam}:duration=${dur}`;
}
