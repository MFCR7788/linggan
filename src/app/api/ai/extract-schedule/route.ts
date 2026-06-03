// 日程提取 API — 从文本 + AI 分析中智能提取结构化日程
// 用于：AI 分析完成后，提取结构化日程数据供一键添加

import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek } from '@/lib/ai-services';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request: req }: { request: NextRequest }) => {
  const { text, aiResponse } = await req.json();

  // text 是用户原始输入，aiResponse 是 AI 的详细分析（可选，但强烈建议提供）
  const sourceText = text || '';
  if ((!sourceText || typeof sourceText !== 'string' || sourceText.trim().length < 5) && !aiResponse) {
    return NextResponse.json({ success: true, schedules: [] });
  }

  const today = new Date().toISOString().split('T')[0];
  const weekday = new Date().toLocaleDateString('zh-CN', { weekday: 'long' });
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const tomorrowWeekday = new Date(Date.now() + 86400000).toLocaleDateString('zh-CN', { weekday: 'long' });

  // 构建 AI 分析上下文
  let analysisContext = '';
  if (aiResponse && typeof aiResponse === 'string' && aiResponse.trim().length > 10) {
    analysisContext = `
AI 已对用户需求做了详细分析，以下是分析内容（包含执行方案、备选方案、优化建议等）：
---
${aiResponse.trim().substring(0, 4000)}
---

请从以上 AI 分析中提取关键信息，填充到每个日程的 description 和 suggestions 字段中。
- description：应包含时间、地点、参与方、主要目的，以及 AI 给出的核心执行要点（精简到 100 字以内）
- suggestions：从 AI 分析中提取 2-4 条具体可执行的建议（如备选方案、注意事项、准备事项等），每条建议 15-30 字
`;
  }

  const prompt = `你是一位日程提取助手。从以下文本中提取所有日程事件，每个独立事件创建一条记录。

识别规则：
- 每条日程 = 一个独立的时间 + 一个独立的事项
- 不同时间点、不同参与方、不同地点 → 视为不同日程
- 只提取有明确时间信息的事件（"明天"、"下周X"、"X月X日"、"上午/下午X点"等）
- 如果没有找到任何包含时间信息的事件，返回空数组 []

时间解析：
- 今天 = ${today}（${weekday}）
- 明天 = ${tomorrow}（${tomorrowWeekday}）
- "明天上午" → 09:00，"明天下午" → 14:00
- "上午X点" → X:00，"下午X点" → (X+12):00
- 用 ISO 8601 带时区：2026-06-01T09:00:00+08:00

字段要求：
- title：10-20字的简洁标题，包含人物/事项关键词
- scheduled_at：ISO 8601 日期时间
- description：一句话描述，包含目的和关键信息（可选）
- location：地点，没有则为空字符串（可选）
- suggestions：2-4条具体可执行的建议（可选）
${analysisContext}
严格只返回 JSON，不要任何其他文字：
{
  "schedules": [
    {
      "title": "日程标题",
      "scheduled_at": "2026-06-01T09:00:00+08:00",
      "description": "描述信息",
      "location": "地点",
      "suggestions": ["建议1", "建议2"]
    }
  ]
}

要提取的用户输入：
${sourceText.trim().substring(0, 3000)}`;

  try {
    const result = await callDeepSeek(
      `你是日程提取助手，严格只返回JSON，不要任何多余文字。\n\n${prompt}`,
      { temperature: 0.1 }
    );

    // 提取 JSON
    let json: any = null;
    const match = result.match(/```(?:json)?\s*([\s\S]*?)```/) || result.match(/(\{[\s\S]*\})/);
    if (match) {
      try { json = JSON.parse(match[1] || match[0]); } catch {}
    }
    if (!json) {
      try { json = JSON.parse(result); } catch {}
    }

    const schedules = json?.schedules || [];
    return NextResponse.json({ success: true, schedules });
  } catch (e: any) {
    console.error('[extract-schedule] 失败:', e.message);
    return NextResponse.json({ success: true, schedules: [] });
  }
});
