// 统一发布端点
// POST /api/platforms/publish
// Body: {
//   platform: 'wechat_mp' | 'weibo',
//   accountId: string,           // 用哪个授权账号发
//   contentId?: string,          // 关联灵感库
//   title: string,
//   content: string,
//   coverUrl?: string,
//   tags?: string[],
//   scheduledPublishAt?: string  // ISO 8601 字符串,定时发布
// }

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { getAdapter, hasAdapter } from '@/lib/platforms/registry';
import { decryptTokenUnsafe, encryptTokenUnsafe } from '@/lib/platforms/encryption';
import { PLATFORMS, type PlatformId } from '@/lib/platforms/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const {
    platform,
    accountId,
    contentId,
    title,
    content,
    coverUrl,
    tags,
    scheduledPublishAt,
  } = body as {
    platform?: string;
    accountId?: string;
    contentId?: string;
    title?: string;
    content?: string;
    coverUrl?: string;
    tags?: string[];
    scheduledPublishAt?: string;
  };

  // 校验
  if (!platform || !hasAdapter(platform as PlatformId)) {
    return createApiError('platform 不支持自动发布(请用复制引导页)', 400);
  }
  if (!accountId) return createApiError('accountId 必填', 400);
  if (!title?.trim()) return createApiError('title 必填', 400);
  if (!content?.trim()) return createApiError('content 必填', 400);

  const supabase = createAdminClient();

  // 1) 校验 account ownership
  const { data: account } = await supabase
    .from('platform_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!account) return createApiError('账号不存在或已失效', 404);
  if (account.platform !== platform) return createApiError('账号与平台不匹配', 400);

  // 2) 定时发布 → 只创建草稿,定时任务到点再触发
  if (scheduledPublishAt) {
    const { data: pub, error } = await supabase
      .from('publications')
      .insert({
        user_id: user.id,
        content_id: contentId || null,
        platform,
        account_id: accountId,
        title: title.trim(),
        content: content.trim(),
        cover_url: coverUrl || null,
        tags: tags || [],
        status: 'scheduled',
        is_manual_post: false,
        scheduled_publish_at: scheduledPublishAt,
      })
      .select()
      .maybeSingle();

    if (error || !pub) return createApiError(error?.message || '创建发布记录失败', 500);
    return createApiResponse({ publication: pub }, `已加入定时队列, ${scheduledPublishAt} 自动发布`);
  }

  // 3) 立即发布
  try {
    // 先插入 publishing 状态的记录
    const { data: pub, error: insertErr } = await supabase
      .from('publications')
      .insert({
        user_id: user.id,
        content_id: contentId || null,
        platform,
        account_id: accountId,
        title: title.trim(),
        content: content.trim(),
        cover_url: coverUrl || null,
        tags: tags || [],
        status: 'publishing',
        is_manual_post: false,
      })
      .select()
      .maybeSingle();
    if (insertErr || !pub) throw new Error(insertErr?.message || '创建发布记录失败');

    // 调平台 SDK
    let accessToken = decryptTokenUnsafe(account.access_token_encrypted);

    // 过期检查 + 刷新
    if (account.expires_at && new Date(account.expires_at) < new Date(Date.now() + 60 * 1000)) {
      if (account.refresh_token_encrypted) {
        try {
          const refreshToken = decryptTokenUnsafe(account.refresh_token_encrypted);
          const adapter = getAdapter(platform as PlatformId);
          const newTokens = await adapter.refreshTokens(refreshToken);
          accessToken = newTokens.accessToken;
          // 存回去
          await supabase
            .from('platform_accounts')
            .update({
              access_token_encrypted: encryptTokenUnsafe(newTokens.accessToken),
              refresh_token_encrypted: newTokens.refreshToken
                ? encryptTokenUnsafe(newTokens.refreshToken)
                : account.refresh_token_encrypted,
              expires_at: newTokens.expiresAt.toISOString(),
            })
            .eq('id', accountId);
        } catch (refreshErr: any) {
          console.warn('[publish] refresh 失败:', refreshErr.message);
          // 继续用老 token 试试
        }
      }
    }

    const adapter = getAdapter(platform as PlatformId);
    const result = await adapter.publish(accessToken, {
      title: title.trim(),
      content: content.trim(),
      coverUrl,
      tags,
    }, account.open_id || undefined);

    // 4) 更新 publication
    const { data: updated, error: updateErr } = await supabase
      .from('publications')
      .update({
        status: 'published',
        external_url: result.externalUrl,
        external_post_id: result.externalPostId,
        published_at: (result.publishedAt || new Date()).toISOString(),
      })
      .eq('id', pub.id)
      .select()
      .maybeSingle();
    if (updateErr || !updated) throw new Error(updateErr?.message || '更新发布记录失败');

    // 5) 更新 last_used_at
    await supabase
      .from('platform_accounts')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', accountId);

    return createApiResponse(
      { publication: updated, externalUrl: result.externalUrl },
      `已发布到 ${PLATFORMS[platform as PlatformId].name}`
    );
  } catch (e: any) {
    console.error('[publish] 失败:', e);
    return createApiError(e.message || '发布失败', 500);
  }
});
