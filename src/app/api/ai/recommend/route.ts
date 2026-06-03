// 智能推荐 API — 根据用户账号类型返回推荐视频组合
// 前端目前直接从 src/lib/account-presets.ts 读(避免多一跳网络请求)
// 此 API 主要是给未来扩展预留:基于用户历史的动态推荐 / 个性化排序

import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { createApiResponse, createUnauthorizedResponse } from '@/lib/api-utils';
import { getRecommendations, getAccountTypePreset } from '@/lib/account-presets';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return createUnauthorizedResponse();

  // 优先从 query 参数读,其次从 user.account_type,最后 null(给默认通用推荐)
  const { searchParams } = new URL(request.url);
  const accountType =
    searchParams.get('accountType') ||
    (user as any).account_type ||
    null;

  const preset = getAccountTypePreset(accountType);
  const recommendations = getRecommendations(accountType);

  return createApiResponse({
    accountType,
    preset: preset
      ? {
          id: preset.id,
          label: preset.label,
          emoji: preset.emoji,
          desc: preset.desc,
          audience: preset.audience,
          recommendedStyles: preset.recommendedStyles,
          recommendedIndustries: preset.recommendedIndustries,
          recommendedPlatforms: preset.recommendedPlatforms,
        }
      : null,
    recommendations,
  }, '推荐组合已获取');
}
