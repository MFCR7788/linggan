// AI 生图的"智能提示"端点
// 接收 {inspirations, userInput, presetId} → 用 DeepSeek 提炼成 50-150 字的精准 prompt
import { NextResponse } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { callDeepSeek } from '@/lib/ai-services';
import { findImagePreset } from '@/lib/preset-templates';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

interface SmartPromptBody {
  inspirations?: Array<{ title?: string; originalText?: string; aiSummary?: string }>;
  userInput?: string;
  presetId?: string;
  style?: string;
  ratio?: string;
  paletteName?: string;
}

export const POST = withAuth(async ({ request, user }) => {
  try {
    const body: SmartPromptBody = await request.json().catch(() => ({}));
    const { inspirations = [], userInput = '', presetId, style, ratio, paletteName } = body;

    const creditCost = CREDIT_COSTS.ai_text.perCall;
    try {
      await consume(user.id, creditCost, 'ai_smart_prompt', 'AI 生图提示词提炼', { presetId });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    // 拼接素材上下文
    const inspContext = inspirations
      .filter(Boolean)
      .map((i, idx) => {
        const parts = [
          i.title ? `标题：${i.title}` : '',
          i.aiSummary ? `AI摘要：${i.aiSummary}` : '',
          i.originalText ? `原文：${i.originalText}` : '',
        ].filter(Boolean);
        return parts.length > 0 ? `[素材${idx + 1}] ${parts.join(' | ')}` : '';
      })
      .filter(Boolean)
      .join('\n');

    // 拼接预设上下文
    const preset = presetId ? findImagePreset(presetId) : null;
    const presetContext = preset
      ? [
          `预设：${preset.label}`,
          `比例：${preset.ratio}`,
          `风格：${preset.style}`,
          `模板：${preset.promptHint}`,
          preset.recommendedWords ? `推荐关键词：${preset.recommendedWords}` : '',
        ].filter(Boolean).join('\n')
      : '';

    const userContext = userInput.trim() ? `用户输入：${userInput.trim()}` : '';

    if (!inspContext && !userContext && !presetContext) {
      return createApiError('需要至少提供素材、用户输入或预设之一', 400);
    }

    // 控制 token：素材 + 用户输入 截到 2000 字
    const truncatedInsp = inspContext.slice(0, 2000);

    const systemContext = [
      '【素材】',
      truncatedInsp || '（无）',
      '',
      '【用户输入】',
      userContext || '（无）',
      '',
      presetContext ? '【生图预设】\n' + presetContext : '',
      style ? `\n补充风格：${style}` : '',
      ratio ? `\n补充比例：${ratio}` : '',
      paletteName ? `\n主色调：${paletteName}` : '',
    ].filter(Boolean).join('\n');

    const prompt = `你是一个 AI 生图提示词专家。根据用户的素材、输入和预设，把它们提炼成一段精准的英文或中文提示词（不超过 150 字），用于驱动 AI 生图模型。

要求：
1. 用 1-2 句精炼描述画面主体、场景、氛围、风格
2. 包含构图、视角、光线、色调等具体细节
3. 如果预设指定了风格/比例/色调，必须体现
4. 直接输出 prompt 文本，不要有"提示词："等前缀
5. 不要用换行，不要用项目符号
6. 中文/英文皆可，匹配用户输入语言

${systemContext}

只输出最终 prompt，不要有其他内容。`;

    try {
      const result = await callDeepSeek(prompt, { temperature: 0.5, maxTokens: 250 });
      const finalPrompt = result.trim().replace(/^["「『]+|["」』]+$/g, '').slice(0, 400);

      return createApiResponse({
        prompt: finalPrompt,
        reasoning: '基于素材 + 用户输入 + 预设生成',
      }, 'Smart prompt generated');
    } catch (e) {
      // 失败 fallback：直接拼接
      const fallback = [userInput.trim(), preset?.promptHint].filter(Boolean).join('，').slice(0, 200);
      return createApiResponse({
        prompt: fallback || '精美画面',
        reasoning: 'AI 提炼失败，使用原始拼接',
      }, 'Fallback prompt');
    }
  } catch (error) {
    console.error('Smart prompt error:', error);
    return createApiError('生成提示词失败', 500);
  }
});
