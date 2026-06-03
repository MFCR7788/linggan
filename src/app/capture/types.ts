// ====== Capture 页面类型定义 ======

export type MessageType = 'user' | 'ai';

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  contentType?: 'text' | 'link' | 'image' | 'video' | 'voice';
  linkFetchFailed?: boolean;       // 链接抓取失败(SPA/反爬) — 前端显示"建议贴正文"
  attachments?: { url: string; name: string; type: 'image' | 'video' | 'document' }[];
  mediaUrl?: string;
  sourceUrl?: string;
  generatedImage?: { imageUrl: string; prompt: string };
  generatedVideo?: { videoUrl?: string; prompt: string; taskId?: string; status?: string };
  schedule?: {
    title: string;
    scheduled_at: string;
    description?: string | null;
    location?: string | null;
    suggestions?: string[];
  };
  schedules?: Array<{
    title: string;
    scheduled_at: string;
    description?: string | null;
    location?: string | null;
    suggestions?: string[];
  }>;
  timestamp: Date;
}

export interface AttachedFile {
  id: string;
  file: File;
  preview: string;
  type: 'image' | 'document';
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export type RewriteStyle = 'concise' | 'detailed' | 'casual' | 'formal' | 'xiaohongshu';

export const REWRITE_STYLES: { key: RewriteStyle; label: string; desc: string }[] = [
  { key: 'concise', label: '简洁版', desc: '去掉冗余，保留核心' },
  { key: 'detailed', label: '详细版', desc: '扩充细节，更充实' },
  { key: 'casual', label: '更口语化', desc: '像朋友聊天一样自然' },
  { key: 'formal', label: '更正式', desc: '措辞严谨规范' },
  { key: 'xiaohongshu', label: '小红书风格', desc: '热情亲切，有吸引力' },
];
