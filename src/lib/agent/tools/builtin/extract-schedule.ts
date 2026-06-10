import type { ToolDefinition } from '../../types';
import { callDeepSeek } from '@/lib/ai-services';

export const extractScheduleTool: ToolDefinition = {
  name: 'extract_schedule',
  description: '从用户输入的自然语言中提取日程安排。当用户提到时间、日期、会议、提醒等时自动使用。返回结构化的日程信息。',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '需要提取日程的文本内容' },
    },
    required: ['text'],
  },
  async handler(params, _ctx) {
    const text = params.text as string;

    try {
      const now = new Date();
      const todayStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
      const nowIso = now.toISOString();

      const prompt = `当前日期时间：${todayStr} (${nowIso})

请从以下文本中提取日程信息，以JSON数组格式返回。每个日程包含以下字段：
- title: 日程标题
- scheduled_at: ISO 8601 格式的日期时间（如 "${now.toISOString().substring(0, 10)}T15:00:00"）
- description: 日程描述（可选）
- location: 地点（可选）

注意：
1. 识别相对时间（如"明天下午3点"→根据当前日期转换为具体日期时间）
2. 如果文本中没有指定年份，默认使用当前年份 ${now.getFullYear()}
3. 识别多个日程（如"下周一到周三每天下午开会"）
4. 如果没有明确的日程信息，返回空数组 []
5. 只返回JSON数组，不要其他文字

文本内容：
${text}`;

      const result = await callDeepSeek(prompt, { temperature: 0.1, maxTokens: 1000 });
      const jsonMatch = result.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const schedules = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(schedules) || schedules.length === 0) {
          return { success: false, output: '未在文本中发现日程信息。' };
        }
        const lines = schedules.map((s: any, i: number) => {
          const time = s.scheduled_at ? new Date(s.scheduled_at).toLocaleString('zh-CN') : '待定';
          return `${i + 1}. ${s.title} — ${time}${s.location ? ` @ ${s.location}` : ''}`;
        }).join('\n');
        return {
          success: true,
          output: `发现 ${schedules.length} 个日程：\n${lines}`,
          data: { schedules },
        };
      }

      return { success: false, output: '未在文本中发现日程信息。' };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `日程提取失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
