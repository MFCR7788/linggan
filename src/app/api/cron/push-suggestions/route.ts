// 定时任务：为活跃用户生成主动选题建议
// GET /api/cron/push-suggestions?secret=xxx
// 建议每天 08:30 执行（ECS crontab）

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { getCronSecret } from '@/lib/runtime-config';
import { generateSuggestions, serializeProposals } from '@/lib/jobs/suggestion-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 分钟

export async function GET(request: Request) {
  const expectedSecret = getCronSecret();
  if (!expectedSecret) {
    return createApiError('CRON_SECRET 未配置', 500);
  }

  const { searchParams } = new URL(request.url);
  const secret =
    searchParams.get('secret') ||
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (secret !== expectedSecret) {
    return createApiError('Unauthorized', 401);
  }

  const maxUsers = Math.min(parseInt(searchParams.get('maxUsers') || '20', 10), 50);
  console.log(`[PushSuggestions] 开始为最多 ${maxUsers} 用户生成选题建议`);

  const supabase = createAdminClient();

  // 查询近 14 天活跃用户（有 chat_messages 记录）
  let activeUsers: { user_id: string }[] = [];
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: users } = await supabase
      .from('chat_messages')
      .select('user_id')
      .gte('created_at', fourteenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(maxUsers * 3);

    if (users) {
      // 去重
      const seen = new Set<string>();
      activeUsers = users.filter((u: any) => {
        if (seen.has(u.user_id)) return false;
        seen.add(u.user_id);
        return true;
      }).slice(0, maxUsers);
    }
  } catch (e) {
    console.warn('[PushSuggestions] 查询活跃用户失败:', e);
  }

  if (activeUsers.length === 0) {
    console.log('[PushSuggestions] 没有活跃用户，跳过');
    return createApiResponse({ generated: 0, message: '没有活跃用户' });
  }

  console.log(`[PushSuggestions] ${activeUsers.length} 位活跃用户`);

  let generated = 0;
  let failed = 0;

  // 逐个处理（避免并发过高）
  for (const { user_id } of activeUsers) {
    try {
      const result = await generateSuggestions(user_id, { count: 3 });

      if (result.proposals.length > 0) {
        const proposalsJson = serializeProposals(result.proposals);
        await supabase.from('content_suggestions').insert({
          user_id,
          proposals: JSON.parse(proposalsJson),
          account_type: result.accountType,
          hotspot_count: result.hotspotCount,
        });
        generated++;
        console.log(`[PushSuggestions] 用户 ${user_id}: ${result.proposals.length} 条提案 (热点:${result.hotspotCount})`);
      }
    } catch (e) {
      failed++;
      console.warn(`[PushSuggestions] 用户 ${user_id} 失败:`, e instanceof Error ? e.message : String(e));
    }
  }

  console.log(`[PushSuggestions] 完成：${generated} 成功，${failed} 失败`);

  return createApiResponse({
    generated,
    failed,
    totalUsers: activeUsers.length,
    message: `生成完成：${generated} 成功，${failed} 失败`,
  });
}
