// Pixabay API — 图片 + 视频搜索
// API 文档: https://pixabay.com/api/docs/

import type { MediaSearchProvider, MediaSearchResult, SearchRequestOptions } from './types';

const PIXABAY_API = 'https://pixabay.com/api';

interface PixabayHit {
  id: number;
  pageURL: string;
  type: 'photo' | 'film';
  tags: string;
  // 图片字段
  webformatURL?: string;
  largeImageURL?: string;
  fullHDURL?: string;
  imageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  // 视频字段
  videos?: {
    large?: { url: string; width: number; height: number; size: number };
    medium?: { url: string; width: number; height: number; size: number };
    small?: { url: string; width: number; height: number; size: number };
  };
  // 通用
  user: string;
  userImageURL: string;
  views: number;
  downloads: number;
  likes: number;
  duration?: number;
  picture_id?: string;
}

function getApiKey(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getPixabayApiKey } = require('@/lib/runtime-config');
    return getPixabayApiKey() || '';
  } catch {
    return typeof process !== 'undefined' ? (process.env.PIXABAY_API_KEY || '') : '';
  }
}

function mapHit(h: PixabayHit): MediaSearchResult {
  const isVideo = h.type === 'film';
  const bestVideo = h.videos?.large || h.videos?.medium || h.videos?.small;
  return {
    id: `pixabay-${h.id}`,
    type: isVideo ? 'video' : 'image',
    thumbnailUrl: h.webformatURL || h.picture_id || '',
    mediaUrl: isVideo
      ? (bestVideo?.url || '')
      : (h.largeImageURL || h.webformatURL || ''),
    hdUrl: isVideo ? undefined : (h.fullHDURL || h.largeImageURL),
    width: isVideo ? (bestVideo?.width || 1920) : (h.imageWidth || 0),
    height: isVideo ? (bestVideo?.height || 1080) : (h.imageHeight || 0),
    duration: h.duration,
    photographer: h.user,
    photographerUrl: `https://pixabay.com/users/${encodeURIComponent(h.user)}/`,
    provider: 'pixabay',
    providerUrl: h.pageURL,
    description: h.tags || '',
  };
}

export const pixabayProvider: MediaSearchProvider = {
  id: 'pixabay',
  name: 'Pixabay',

  async searchImages(query: string, options: SearchRequestOptions): Promise<MediaSearchResult[]> {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      image_type: 'photo',
      per_page: String(Math.min(options.perPage, 200)),
      page: String(options.page),
      safesearch: 'true',
    });
    if (options.orientation === 'landscape') params.set('orientation', 'horizontal');
    if (options.orientation === 'portrait') params.set('orientation', 'vertical');
    if (options.minWidth) params.set('min_width', String(options.minWidth));
    if (options.minHeight) params.set('min_height', String(options.minHeight));

    const res = await fetch(`${PIXABAY_API}/?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Pixabay] 图片搜索失败: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.hits || []).map(mapHit);
  },

  async searchVideos(query: string, options: SearchRequestOptions): Promise<MediaSearchResult[]> {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      video_type: 'film',
      per_page: String(Math.min(options.perPage, 200)),
      page: String(options.page),
      safesearch: 'true',
    });

    const res = await fetch(`${PIXABAY_API}/videos/?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Pixabay] 视频搜索失败: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.hits || []).map(mapHit);
  },
};
