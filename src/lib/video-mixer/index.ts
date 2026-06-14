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
  BGMStyle,
} from './types';
export { BGM_STYLES } from './types';

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
  getBGMPath,
  recommendBGM,
  getAvailableBGMFiles,
} from './bgm-engine';
