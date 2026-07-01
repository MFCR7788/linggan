// Pexels API — 图片 + 视频搜索
// API 文档: https://www.pexels.com/api/documentation/

import type { MediaSearchProvider, MediaSearchResult, SearchRequestOptions } from './types';
import { getPexelsApiKey } from '@/lib/runtime-config';

const PEXELS_API = 'https://api.pexels.com';

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    tiny: string;
  };
  alt: string;
  avg_color: string;
}

interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  link: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  user: { name: string; url: string };
  video_files: PexelsVideoFile[];
}

function getApiKey(): string {
  return getPexelsApiKey() || '';
}

function mapPhoto(p: PexelsPhoto): MediaSearchResult {
  return {
    id: `pexels-photo-${p.id}`,
    type: 'image',
    thumbnailUrl: p.src.large,
    mediaUrl: p.src.original,
    hdUrl: p.src.large2x,
    width: p.width,
    height: p.height,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    provider: 'pexels',
    providerUrl: p.url,
    description: p.alt || '',
    avgColor: p.avg_color || undefined,
  };
}

function mapVideo(v: PexelsVideo): MediaSearchResult {
  // 取最佳质量的视频文件（优先 1080p HD）
  const files = v.video_files.filter(f => f.file_type === 'video/mp4');
  files.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const best = files[0];
  return {
    id: `pexels-video-${v.id}`,
    type: 'video',
    thumbnailUrl: v.image,
    mediaUrl: best?.link || v.video_files[0]?.link || '',
    width: v.width,
    height: v.height,
    duration: v.duration,
    photographer: v.user.name,
    photographerUrl: v.user.url,
    provider: 'pexels',
    providerUrl: v.url,
  };
}

export const pexelsProvider: MediaSearchProvider = {
  id: 'pexels',
  name: 'Pexels',

  async searchImages(query: string, options: SearchRequestOptions): Promise<MediaSearchResult[]> {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    const params = new URLSearchParams({
      query,
      per_page: String(Math.min(options.perPage, 80)),
      page: String(options.page),
    });
    if (options.orientation) params.set('orientation', options.orientation);
    if (options.minWidth) params.set('size', 'large');

    const res = await fetch(`${PEXELS_API}/v1/search?${params}`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Pexels] 图片搜索失败: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.photos || []).map(mapPhoto);
  },

  async searchVideos(query: string, options: SearchRequestOptions): Promise<MediaSearchResult[]> {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    const params = new URLSearchParams({
      query,
      per_page: String(Math.min(options.perPage, 80)),
      page: String(options.page),
    });
    if (options.orientation === 'portrait') params.set('orientation', 'portrait');
    if (options.orientation === 'landscape') params.set('orientation', 'landscape');

    const res = await fetch(`${PEXELS_API}/videos/search?${params}`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Pexels] 视频搜索失败: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.videos || []).map(mapVideo);
  },
};
