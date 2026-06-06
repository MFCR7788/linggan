// AI Services - Shared Types

// ====== Re-export from video-models ======

import { QUALITY_TIERS, type VideoProvider, type VideoModelConfig, type QualityTier } from '../video-models';
export { type VideoProvider, type VideoModelConfig, type QualityTier, QUALITY_TIERS };

// ====== Chat Types ======

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } };

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  enableSearch?: boolean;
}

// ====== Vision Types ======

export interface VisionResult {
  description: string;
  text: string;
  tags: string[];
}

// ====== Content Types ======

export interface SummaryResult {
  title: string;
  summary: string;
  keyPoints: string[];
  tags: string[];
  creationSuggestions: string[];
  reuseScore: number;
}

// ====== Image Types ======

export interface ImageResult {
  imageUrl: string;
  prompt: string;
  size: string;
}

// ====== Video Types ======

export type VideoTaskResult = { taskId: string | null; status: string; message: string; videoUrl?: string };

export interface I2VTaskResult {
  taskId: string | null;
  status: string;
  message: string;
}

// ====== Storyboard Types ======

export interface StoryboardScene {
  index: number;
  timeStart: number;
  timeEnd: number;
  duration: number;
  visualPrompt: string;
  subtitle: string;
  transition: string;
}

export interface InspireInput {
  id: string | number;
  title?: string;
  type?: string;
  original_text?: string;
  ai_summary?: string;
  media_urls?: string[];
}

// ====== Digital Human Types ======

export interface AnimateSubmitResult {
  taskId: string | null;
  status: 'queued' | 'error';
  message: string;
}

// ====== Weather Types ======

export interface WeatherData {
  city: string;
  current: {
    temp: number;
    feelsLike: number;
    desc: string;
    humidity: number;
    windSpeed: number;
    cloudCover: number;
  };
  forecast: {
    date: string;
    maxTemp: number;
    minTemp: number;
    desc: string;
    sunrise: string;
    sunset: string;
  }[];
}

export const WEATHER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

export interface WttrInCurrentCondition {
  temp_C: string;
  FeelsLikeC: string;
  weatherDesc?: { value: string }[];
  humidity: string;
  windspeedKmph: string;
  cloudcover: string;
}

export interface WttrInDay {
  date: string;
  maxtempC: string;
  mintempC: string;
  hourly?: { weatherDesc?: { value: string }[] }[];
  astronomy?: { sunrise: string; sunset: string }[];
}

export interface WttrInResponse {
  current_condition?: WttrInCurrentCondition[];
  weather?: WttrInDay[];
}

// ====== TTS Types ======

export type VoiceCloneStatus = 'NotFound' | 'Training' | 'Success' | 'Failed' | 'Active';

export interface VoiceCloneUploadResult {
  ok: boolean;
  speakerId: string;
  status: VoiceCloneStatus;
  error?: string;
}

export interface VoiceCloneStatusResult {
  speakerId: string;
  status: VoiceCloneStatus;
  error?: string;
}

export type CosyVoiceId = 'longxiaochun_v2' | 'longxiaoxia_v2' | 'longxiaoyu_v2' | 'longhua_v2' | 'longyue_v2' | 'longcheng_v2' | 'longjing_v2' | 'longanhuan' | 'longwan_v2' | 'longfei_v2';
export type CosyVoiceModel = 'cosyvoice-v2' | 'cosyvoice-v3-flash';

export interface CosyVoiceOptions {
  voice?: CosyVoiceId;
  speed?: number;
  pitch?: number;
  volume?: number;
  model?: CosyVoiceModel;
}

// ====== Avatar Types ======

export type AvatarTrainingStatus = 'pending' | 'training' | 'ready' | 'failed';

export interface AvatarTrainingResult {
  ok: boolean;
  avatarId: string | null;
  status: AvatarTrainingStatus;
  error?: string;
}

export interface AvatarTrainingStatusResult {
  avatarId: string;
  status: AvatarTrainingStatus;
  error?: string;
  coverUrl?: string;
  previewVideoUrl?: string;
}

// ====== Usage Types ======

export type AiTaskType = 'ai_summary' | 'copywriting' | 'image' | 'image_batch' | 'video' | 'digital_human' | 'digital_human_batch' | 'video_merge';
