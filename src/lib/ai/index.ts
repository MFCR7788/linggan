// AI Services - Barrel Re-exports

// Chat
export { callDeepSeek } from './chat';
export { callQwen } from './chat';
export { callDoubaoChat } from './chat';

// Vision
export { callDoubaoVision } from './vision';

// Image
export { generateImage } from './image';

// Video
export { submitVideoTask } from './video';
export { submitI2VTask } from './video';
export { getVideoTaskStatus } from './video';
export { submitVideoGenerationTask } from './video';
export { getVideoTaskStatusUniversal } from './video';
export { generateVideo } from './video';

// Storyboard
export { calcSegmentDurations } from './storyboard';
export { generateStoryboard } from './storyboard';
export { generateStoryboardV2 } from './storyboard';

// Digital Human
export { submitDigitalHumanTask } from './digital-human';
export { getDigitalHumanTaskStatus } from './digital-human';
export { submitAnimateTask } from './digital-human';
export { getAnimateTaskStatus } from './digital-human';

// Avatar
export { trainAvatar } from './avatar';
export { getAvatarTrainingStatus } from './avatar';
export { generateAvatarVideo } from './avatar';
export { getAvatarVideoStatus } from './avatar';

// TTS
export { cloneVoiceUpload } from './tts';
export { cloneVoiceStatus } from './tts';
export { synthesizeWithClonedVoice } from './tts';
export { synthesizeWithCosyVoice } from './tts';

// Content
export { summarizeContent } from './content';
export { generateCopywriting } from './content';
export { generateOralScript } from './content';

// Weather
export { fetchWeather } from './weather';

// Usage
export { logAiUsage } from './usage';

// Types (re-export only the originally public types)
export type {
  VideoTaskResult,
  StoryboardScene,
  AnimateSubmitResult,
  WeatherData,
  VoiceCloneStatus,
  VoiceCloneUploadResult,
  VoiceCloneStatusResult,
  CosyVoiceId,
  CosyVoiceModel,
  CosyVoiceOptions,
  AvatarTrainingStatus,
  AvatarTrainingResult,
  AvatarTrainingStatusResult,
} from './types';

// Re-exports from video-models (via types.ts barrel)
export {
  QUALITY_TIERS,
  type VideoProvider,
  type VideoModelConfig,
  type QualityTier,
} from './types';
