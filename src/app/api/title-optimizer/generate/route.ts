// 标题优化 API — 为多平台生成最优标题
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { optimizeTitles } from '@/lib/ai/title-optimizer';
import type { Platform, TitleType } from '@/lib/ai/title-optimizer';

export const maxDuration = 30;

interface GenerateBody {
  contentText?: string;
  videoUrl?: string;
  platforms?: Platform[];
  titleTypes?: TitleType[];
  customContext?: string;
}

export const POST = withAuth(async ({ request }) => {
  const body: GenerateBody = await request.json();

  if (!body.contentText && !body.videoUrl) {
    return createApiError('请提供内容文本或视频链接', 400);
  }

  try {
    const result = await optimizeTitles({
      contentText: body.contentText,
      platforms: body.platforms,
      titleTypes: body.titleTypes,
      customContext: body.customContext,
    });

    return createApiResponse(result, '标题生成成功');
  } catch (e) {
    console.error('[title-optimizer] 错误:', e);
    return createApiError(`标题生成失败: ${e instanceof Error ? e.message : '未知错误'}`, 500);
  }
});
