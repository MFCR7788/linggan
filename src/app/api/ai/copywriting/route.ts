import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { generateCopywriting, researchTopic, logAiUsage } from '@/lib/ai-services';
import { findIndustry, renderIndustryInstruction, COPYWRITING_TYPES } from '@/lib/preset-templates';
import { consume, InsufficientCreditsError } from '@/lib/credits';

export const dynamic = 'force-dynamic';

// 单次文案消耗 2 credits;n 个变体按 n 倍扣
const CREDIT_PER_COPY = 2;

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { inspirations, type, style, noAiTaste, n, industry, userInstruction } = await request.json();

    if (!inspirations || !Array.isArray(inspirations)) {
      return createApiError('Inspirations array is required', 400);
    }

    // 将类型ID转换为中文描述
    const typeDef = COPYWRITING_TYPES.find(t => t.id === type);
    const typeLabel = typeDef?.label || type || '小红书笔记';
    const count = Math.min(n || 1, 5);

    // ─── Credit 扣点(在生成前) ──────────────────
    const creditCost = count * CREDIT_PER_COPY;
    try {
      await consume(user.id, creditCost, 'ai_copywriting', `AI 文案 ${count} 个变体`, { type, style, n: count });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            success: false,
            error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`,
            code: 'INSUFFICIENT_CREDITS',
            data: { required: creditCost, available: e.available },
          },
          { status: 402 }
        );
      }
      throw e;
    }

    // 行业模板注入
    const industryDef = industry ? findIndustry(industry) : undefined;
    const industryInstruction = industryDef ? renderIndustryInstruction(industryDef) : undefined;

    // 联网搜索研究：从灵感素材和用户指令中提取话题
    const topicTitles = inspirations
      .map((i: { title?: string }) => i.title)
      .filter(Boolean)
      .slice(0, 3)
      .join('、');
    const researchTopic_str = userInstruction || topicTitles || typeLabel;
    const researchContext = inspirations
      .map((i: { aiSummary?: string; originalText?: string }) => i.aiSummary || i.originalText || '')
      .filter(Boolean)
      .slice(0, 2)
      .join('\n');
    const researchResults = await researchTopic(researchTopic_str, researchContext || undefined);

    const result = await generateCopywriting(
      inspirations,
      typeLabel,
      style || '种草安利',
      noAiTaste || false,
      count,
      industryInstruction,
      userInstruction,
      researchResults || undefined
    );

    // 记录AI使用
    await logAiUsage(user.id, 'copywriting', 1000 * count);

    return createApiResponse({
      content: result,
      type,
      style,
      industry: industry || null,
      isBatch: count > 1,
      researchResults: researchResults || undefined,
    }, 'Copywriting generated');
  } catch (error) {
    console.error('AI copywriting error:', error);
    return createApiError('Failed to generate copywriting', 500);
  }
});
