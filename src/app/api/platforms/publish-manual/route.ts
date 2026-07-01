// 手动发布端点(4 平台: 抖音/小红书/视频号/B站)
// POST /api/platforms/publish-manual
// Body: {
//   platform: 'douyin' | 'xiaohongshu' | 'wechat_video' | 'bilibili',
//   contentId?: string,
//   title: string,
//   content: string,
//   coverUrl?: string,
//   tags?: string[],
//   scheduledPublishAt?: string
// }

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { PLATFORMS, type PlatformId } from '@/lib/platforms/types';

export const dynamic = 'force-dynamic';

const MANUAL_PLATFORMS: PlatformId[] = ['douyin', 'xiaohongshu', 'wechat_video', 'bilibili'];

export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { platform, contentId, title, content, coverUrl, tags, scheduledPublishAt } = body as {
    platform?: string;
    contentId?: string;
    title?: string;
    content?: string;
    coverUrl?: string;
    tags?: string[];
    scheduledPublishAt?: string;
  };

  if (!platform || !MANUAL_PLATFORMS.includes(platform as PlatformId)) {
    return createApiError('platform 不支持手动发布', 400);
  }
  if (!title?.trim()) return createApiError('title 必填', 400);
  if (!content?.trim()) return createApiError('content 必填', 400);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('publications')
    .insert({
      user_id: user.id,
      content_id: contentId || null,
      platform,
      account_id: null,
      title: title.trim(),
      content: content.trim(),
      cover_url: coverUrl || null,
      tags: tags || [],
      status: scheduledPublishAt ? 'scheduled' : 'draft',
      is_manual_post: true,
      scheduled_publish_at: scheduledPublishAt || null,
    })
    .select()
    .maybeSingle();

  if (error || !data) return createApiError(error?.message || '创建发布记录失败', 500);
  return createApiResponse(
    { publication: data },
    `已创建草稿,去 ${PLATFORMS[platform as PlatformId].name} 发布并回填`
  );
});
