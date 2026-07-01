// ─── AI 视频生成共享类型 ────────────────────────────────

export interface InspirationItem {
  id: string | number;
  title: string;
  type?: string;
  original_text?: string;
  ai_summary?: string;
  media_urls?: string[];
  source_url?: string;
}

export interface StoryboardScene {
  index: number;
  timeStart: number;
  timeEnd: number;
  duration: number;
  visualPrompt: string;
  subtitle: string;
  transition: string;
}

export interface SegmentState {
  index: number;
  taskId: string | null;
  model: string;
  provider?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'error' | 'skipped';
  duration: number;
  materialType: 'text' | 'image';
  videoUrl?: string;
}

export interface SceneFrameData {
  imageUrl?: string;
  taskId?: string;
}
