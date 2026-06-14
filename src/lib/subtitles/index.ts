// 字幕增强 — 统一导出

export type {
  SubtitleStyle,
  SubtitleLayout,
  SubtitlePosition,
  SubtitleAnimation,
  DualSubtitleConfig,
  SubtitleGenerateOptions,
  SubtitleBurnOptions,
  OptimizedSubtitle,
} from './types';

export {
  SUBTITLE_STYLES,
  SUBTITLE_LAYOUTS,
  getLayout,
  getStyleNames,
  getStyleList,
} from './presets';

export { generateSRT, generateASS } from './generator';

export { optimizeSubtitles } from './optimizer';
export type { RawSubtitleLine, OptimizationOptions } from './optimizer';
