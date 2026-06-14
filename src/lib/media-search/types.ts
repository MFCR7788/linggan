// 媒体素材搜索 — 类型定义

/** 媒体类型 */
export type MediaType = 'image' | 'video';

/** 素材来源 */
export type MediaProviderId = 'pexels' | 'pixabay' | 'unsplash';

/** 单条搜索结果 */
export interface MediaSearchResult {
  /** 唯一标识 */
  id: string;
  /** 素材类型 */
  type: MediaType;
  /** 预览图 URL（视频为缩略图） */
  thumbnailUrl: string;
  /** 原始文件 URL（图片为原图，视频为预览 MP4） */
  mediaUrl: string;
  /** 高清/原始尺寸 URL */
  hdUrl?: string;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
  /** 视频时长(秒)，图片为 0 */
  duration?: number;
  /** 摄影师/作者 */
  photographer: string;
  /** 摄影师主页 URL */
  photographerUrl: string;
  /** 来源平台 */
  provider: MediaProviderId;
  /** 原始平台 URL（用于署名链接） */
  providerUrl: string;
  /** 描述/标签 */
  description?: string;
  /** 主色调（hex） */
  avgColor?: string;
}

/** 搜索选项 */
export interface MediaSearchOptions {
  /** 查询关键词 */
  query: string;
  /** 媒体类型 */
  type?: MediaType;
  /** 指定 provider，默认搜索全部 */
  provider?: MediaProviderId | 'all';
  /** 页码 (1-based) */
  page?: number;
  /** 每页数量 */
  perPage?: number;
  /** 最小宽度 */
  minWidth?: number;
  /** 最小高度 */
  minHeight?: number;
  /** 横/竖/任意 */
  orientation?: 'landscape' | 'portrait' | 'square';
  /** 语言：中文关键词会自动翻译 */
  language?: 'zh' | 'en';
}

/** 搜索响应 */
export interface MediaSearchResponse {
  /** 搜索结果 */
  results: MediaSearchResult[];
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  perPage: number;
  /** 总数（近似值） */
  total: number;
  /** 是否有更多 */
  hasMore: boolean;
  /** 实际使用的搜索词 */
  searchQuery: string;
}

/** Provider 接口 */
export interface MediaSearchProvider {
  readonly id: MediaProviderId;
  readonly name: string;

  /** 搜索图片 */
  searchImages(query: string, options: SearchRequestOptions): Promise<MediaSearchResult[]>;
  /** 搜索视频 */
  searchVideos(query: string, options: SearchRequestOptions): Promise<MediaSearchResult[]>;
}

export interface SearchRequestOptions {
  page: number;
  perPage: number;
  minWidth?: number;
  minHeight?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
}
