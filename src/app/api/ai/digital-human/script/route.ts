// AI 写稿 — 为数字人生成口播脚本
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { generateOralScript } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user: _user }) => {
  try {
    const { topic, style, language, targetLength, variantCount, inspirations } = await request.json();

    if (!topic || !topic.trim()) {
      return createApiError('请输入主题', 400);
    }

    const scripts = await generateOralScript({
      topic: topic.trim(),
      style: style || 'oral',
      language: language || 'zh',
      // wan2.2-s2v 限制音频 ≤ 20s, 中文字符 5 字/秒 ≈ 100 字; 硬限 50-300 字防超
      targetLength: Math.min(Math.max(targetLength || 100, 50), 300),
      variantCount: Math.min(Math.max(variantCount || 1, 1), 3),
      inspirations,
    });

    return createApiResponse({ scripts }, '脚本已生成');
  } catch (error) {
    console.error('Script generation error:', error);
    return createApiError('脚本生成失败', 500);
  }
});
