// Unsplash API — 图片搜索
// API 文档: https://unsplash.com/documentation

import type { MediaSearchProvider, MediaSearchResult, SearchRequestOptions } from './types';
import { getUnsplashAccessKey } from '@/lib/runtime-config';

const UNSPLASH_API = 'https://api.unsplash.com';

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color: string;
  description: string | null;
  alt_description: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  links: { html: string; download: string };
  user: { name: string; links: { html: string } };
}

function getAccessKey(): string {
  return getUnsplashAccessKey() || '';
}

function mapPhoto(p: UnsplashPhoto): MediaSearchResult {
  return {
    id: `unsplash-${p.id}`,
    type: 'image',
    thumbnailUrl: p.urls.regular,
    mediaUrl: p.urls.raw,
    hdUrl: p.urls.full,
    width: p.width,
    height: p.height,
    photographer: p.user.name,
    photographerUrl: `${p.user.links.html}?utm_source=lingji&utm_medium=referral`,
    provider: 'unsplash',
    providerUrl: `${p.links.html}?utm_source=lingji&utm_medium=referral`,
    description: p.description || p.alt_description || '',
    avgColor: p.color || undefined,
  };
}

export const unsplashProvider: MediaSearchProvider = {
  id: 'unsplash',
  name: 'Unsplash',

  async searchImages(query: string, options: SearchRequestOptions): Promise<MediaSearchResult[]> {
    const accessKey = getAccessKey();
    if (!accessKey) return [];

    const params = new URLSearchParams({
      query,
      per_page: String(Math.min(options.perPage, 30)),
      page: String(options.page),
    });
    if (options.orientation) params.set('orientation', options.orientation);

    const res = await fetch(`${UNSPLASH_API}/search/photos?${params}`, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Unsplash] 图片搜索失败: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.results || []).map(mapPhoto);
  },

  async searchVideos(_query: string, _options: SearchRequestOptions): Promise<MediaSearchResult[]> {
    // Unsplash 不支持视频搜索
    return [];
  },
};
