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
          { success: false, error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
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

    const prompt = `你是一个 AI 生图提示词专家。根据用户的素材、输入和预设，把它们提炼成一段精准的提示词，用于驱动 wanx2.1-t2i-turbo 生图模型。

模型特性：擅长写实摄影、中国风、插画、动漫等多种风格，支持中英文 prompt。高质量的 prompt 应包含：主体描述、构图景别、光线氛围、色调风格、细节纹理。

要求：
1. 清晰描述画面主体（人物/物品/场景），包含外观、姿态、表情等细节
2. 指定构图方式（特写/中景/全景）、视角（平视/俯视/仰视）、画幅比例
3. 描述光线（柔光/硬光/逆光/侧光）、氛围（温暖/冷峻/梦幻）、色调
4. 明确艺术风格（写实摄影/国风水墨/赛博朋克/日系插画等）
5. 加入质感细节（材质、纹理、光影层次）
6. 如果预设指定了风格/比例/色调，必须体现
7. 直接输出 prompt 文本，不要有"提示词："等前缀
8. 输出不超过 300 字，必须使用中文

${systemContext}

只输出最终 prompt，不要有其他内容。`;

    try {
      const result = await callDeepSeek(prompt, { temperature: 0.5, maxTokens: 400 });
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
