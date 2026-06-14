// 媒体素材搜索 API
// GET /api/media/search?q=&type=image|video&provider=all|pexels|pixabay|unsplash&page=1&per_page=20

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { searchMedia } from '@/lib/media-search';
import type { MediaType, MediaProviderId } from '@/lib/media-search/types';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();
  const type = (searchParams.get('type') || 'image') as MediaType;
  const provider = (searchParams.get('provider') || 'all') as MediaProviderId | 'all';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const perPage = Math.min(80, Math.max(1, parseInt(searchParams.get('per_page') || '20', 10) || 20));
  const orientation = searchParams.get('orientation') as 'landscape' | 'portrait' | 'square' | undefined;
  const minWidth = searchParams.get('min_width') ? parseInt(searchParams.get('min_width')!, 10) : undefined;
  const minHeight = searchParams.get('min_height') ? parseInt(searchParams.get('min_height')!, 10) : undefined;

  if (!query) {
    return createApiError('缺少搜索关键词参数 q', 400);
  }

  if (!['image', 'video'].includes(type)) {
    return createApiError('type 必须为 image 或 video', 400);
  }

  try {
    const result = await searchMedia({
      query,
      type,
      provider,
      page,
      perPage,
      orientation: orientation || undefined,
      minWidth,
      minHeight,
      language: 'zh',
    });

    return createApiResponse(result, `找到 ${result.total} 个${type === 'image' ? '图片' : '视频'}素材`);
  } catch (error) {
    console.error('[media/search] 搜索失败:', error);
    return createApiError('素材搜索失败，请稍后重试', 500);
  }
});
