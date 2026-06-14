// 视频混剪 — 统一导出

export type {
  MixSegment,
  MixTransition,
  MixProject,
  MixBGMConfig,
  MixSubtitleConfig,
  MixSubmitResult,
  MixTaskStatus,
  TransitionType,
} from './types';

export {
  TRANSITIONS,
  getTransition,
  getTransitionsByCategory,
  getXfadeParam,
} from './transitions';
export type { TransitionDef } from './transitions';

export { mixVideos, mixBGM } from './engine';
export type { MixEngineOptions } from './engine';

export {
  BGM_STYLES,
  getBGMPath,
  recommendBGM,
  getAvailableBGMFiles,
} from './bgm-engine';
export type { BGMStyle } from './bgm-engine';
