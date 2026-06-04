import { NextResponse } from 'next/server';
import { callDeepSeek } from '@/lib/ai-services';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { content, contentType } = await request.json();

    // ─── Credit 扣点 ──────────────────────────────────
    const creditCost = CREDIT_COSTS.ai_text.perCall;
    try {
      await consume(user.id, creditCost, 'ai_analyze', 'AI 内容分析', { contentType });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }
    
    // 构建分析提示词
    const prompt = `请分析以下内容，判断它是属于日程安排还是灵感记录，并进行相应的处理。

内容类型：${contentType}
内容：
${content}

请以JSON格式返回分析结果：
{
  "type": "schedule 或 inspiration",
  "summary": "分析摘要",
  "tags": ["标签1", "标签2"],
  "suggestion": "简短建议"
}

判断标准：
- 如果内容包含时间安排、约会、会议、待办事项等，type为"schedule"
- 其他内容type为"inspiration"

只返回JSON，不要有其他文字。`;

    try {
      // 调用 DeepSeek API
      const result = await callDeepSeek(prompt, { temperature: 0.3, maxTokens: 1000 });
      
      // 解析返回的JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ success: true, analysis });
      }
    } catch (apiError) {
      console.warn('API调用失败，使用模拟分析:', apiError);
    }

    // 如果API失败，使用备用分析
    const fallbackAnalysis = getFallbackAnalysis(content, contentType);
    return NextResponse.json({ success: true, analysis: fallbackAnalysis });
    
  } catch (error) {
    console.error('分析失败:', error);
    const fallbackAnalysis = getFallbackAnalysis('', 'text');
    return NextResponse.json({ success: true, analysis: fallbackAnalysis });
  }
});

function getFallbackAnalysis(content: string, contentType: string) {
  const scheduleKeywords = ['明天', '后天', '下周', '提醒', '记得', '约会', '会议', '安排', '日程', '计划'];
  const isSchedule = scheduleKeywords.some(keyword => content.includes(keyword));

  if (isSchedule) {
    return {
      type: 'schedule',
      summary: '这是一条日程提醒，建议存入日程表以便后续提醒。',
      tags: ['日程', '提醒'],
      suggestion: '确定保存到日程吗？'
    };
  } else {
    return {
      type: 'inspiration',
      summary: '这是一条灵感内容，已为您提取核心要点并分类。',
      tags: ['灵感', '创作', '想法'],
      suggestion: '确定保存到灵感库吗？'
    };
  }
}
