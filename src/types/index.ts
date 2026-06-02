// 数据库类型定义
export type ContentType = 'text' | 'voice' | 'image' | 'video' | 'link';

export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type UserPlan = 'free' | 'pro' | 'creator';

export type HotspotStatus = 'new' | 'following' | 'used' | 'ignored';

export type CredibilityLevel = 'red' | 'yellow' | 'green';

export type ImportanceLevel = 'low' | 'medium' | 'high' | 'urgent';

// 用户类型
export interface User {
  id: string;
  email?: string;
  phone?: string;
  username?: string;
  avatar_url?: string;
  plan: UserPlan;
  created_at: string;
  updated_at: string;
}

// 分类类型
export interface Category {
  id: string;
  user_id: string;
  name: string;
  icon?: string;
  color?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// 标签类型
export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color?: string;
  created_at: string;
}

export type ExtractionStatus = 'pending' | 'extracting' | 'extracted' | 'failed' | 'skipped';

// 灵感/内容类型
export interface ContentItem {
  id: string;
  user_id: string;
  type: ContentType;
  category_id?: string;
  title?: string;
  original_text?: string;
  ai_summary?: string;
  ai_key_points?: string[];
  ai_creation_suggestions?: string[];
  source_url?: string;
  source_platform?: string;
  media_urls?: string[];
  voice_url?: string;
  thumbnail_url?: string;
  is_shared: boolean;
  status: 'active' | 'archived' | 'deleted';
  analysis_status: AnalysisStatus;
  original_file_url?: string;
  original_filename?: string;
  original_file_size?: number;
  original_mime_type?: string;
  extraction_status?: ExtractionStatus;
  extraction_error?: string;
  extracted_chars?: number;
  created_at: string;
  updated_at: string;
}

// 内容标签关联
export interface ContentTag {
  id: string;
  content_id: string;
  tag_id: string;
}

// 监控关键词
export interface MonitorKeyword {
  id: string;
  user_id: string;
  keyword: string;
  platforms?: string[];
  frequency: string;
  importance_threshold?: number;
  is_active: boolean;
  last_check_at?: string;
  next_check_at?: string;
  created_at: string;
  updated_at: string;
}

// 热点内容
export interface HotItem {
  id: string;
  user_id: string;
  monitor_keyword_id?: string;
  platform: string;
  original_url: string;
  title: string;
  author?: string;
  original_content?: string;
  ai_summary?: string;
  key_points?: string[];
  relevance_reason?: string;
  creation_suggestions?: string[];
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  credibility_score?: number;
  credibility_level?: CredibilityLevel;
  relevance_score?: number;
  importance_score?: number;
  importance_level?: ImportanceLevel;
  tags?: string[];
  category?: string;
  status: HotspotStatus;
  is_read: boolean;
  published_at?: string;
  captured_at: string;
  created_at: string;
  updated_at: string;
}

// 通知类型
export interface Notification {
  id: string;
  user_id: string;
  hot_item_id?: string;
  type: 'hotspot' | 'system';
  title: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

// 用量记录
export interface UsageRecord {
  id: string;
  user_id: string;
  month: string;
  ai_summary_count?: number;
  link_parse_count?: number;
  image_count?: number;
  video_count?: number;
  video_minutes?: number;
  audio_minutes?: number;
  ai_writing_count?: number;
  storage_used_mb?: number;
  created_at: string;
  updated_at: string;
}

// AI任务
export interface AiTask {
  id: string;
  user_id: string;
  content_id?: string;
  task_type: string;
  status: AiTaskStatus;
  input_tokens?: number;
  output_tokens?: number;
  input?: unknown;
  output?: unknown;
  error_message?: string;
  created_at: string;
  completed_at?: string;
  // V2.0.1 新增字段
  batch_id?: string;
  parent_task_id?: string;
  progress?: number;             // 0-100
  scheduled_for?: string;
  started_at?: string;
  retry_count?: number;
  max_retries?: number;
  worker_id?: string;
  priority?: number;             // 1-10
  error_code?: string;
  estimated_seconds?: number;
}

// 任务类型枚举
export type AiTaskType =
  | 'ai_summary'
  | 'copywriting'
  | 'image'
  | 'image_batch'   // V2.0.1 批量生图
  | 'video'
  | 'digital_human'
  | 'digital_human_batch'  // V2.0.2 批量数字人
  | 'video_merge';

// 任务状态（扩展 cancelled）
export type AiTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

// 批次进度（前端聚合用）
export interface BatchProgress {
  batchId: string;
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  percent: number;              // 0-100
  estimatedRemainingSeconds?: number;
  tasks: AiTask[];
}

// 日程类型
export interface Schedule {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  scheduled_at: string;
  location?: string;
  color?: string;
  status: 'pending' | 'completed' | 'cancelled';
  remind_before?: number;
  suggestions?: string[];
  source_content_id?: string;
  created_at: string;
  updated_at: string;
}

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 分页响应
export interface PaginatedResponse<T = any> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
