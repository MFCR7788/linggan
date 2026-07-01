// Agent 工具：创建日程（支持关联灵感）
import type { ToolDefinition } from '../../types';
import { createAdminClient } from '@/lib/supabase-server';

export const createScheduleTool: ToolDefinition = {
  name: 'create_schedule',
  description: `创建用户的日程安排。当用户在对话中提到"帮我安排""加到日程""提醒我""定个时间"等时使用。
支持设置标题、时间、地点、描述，并可关联灵感来源。`,
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '日程标题，简洁描述要做的事',
      },
      scheduled_at: {
        type: 'string',
        description: '日程时间，ISO 8601 格式，如 2026-06-25T14:00:00。支持相对时间如"明天下午3点"',
      },
      description: {
        type: 'string',
        description: '日程描述/备注，可选',
      },
      location: {
        type: 'string',
        description: '地点，可选',
      },
      inspiration_id: {
        type: 'string',
        description: '关联的灵感 ID（content_items 的 id），可选。如果日程是从某条灵感创建的，传入此字段建立关联。',
      },
    },
    required: ['title', 'scheduled_at'],
  },
  async handler(params, ctx) {
    const title = (params.title as string)?.trim();
    const scheduledAt = params.scheduled_at as string;
    const description = params.description as string | undefined;
    const location = params.location as string | undefined;
    const inspirationId = params.inspiration_id as string | undefined;

    if (!title) {
      return { success: false, output: '', error: '日程标题不能为空' };
    }

    // 尝试解析相对时间
    let finalTime = scheduledAt;
    if (!/^\d{4}-\d{2}-\d{2}/.test(scheduledAt)) {
      const now = new Date();
      const text = scheduledAt.toLowerCase();

      // 简单相对时间解析
      const timeMatch = text.match(/(\d{1,2})[点:：](\d{0,2})/);
      let hour = timeMatch ? parseInt(timeMatch[1]) : 9;
      let minute = timeMatch ? parseInt(timeMatch[2] || '0') : 0;

      if (text.includes('下午') || text.includes('晚上')) {
        if (hour < 12) hour += 12;
      }

      let targetDate = new Date(now);
      if (text.includes('明天')) {
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      } else if (text.includes('后天')) {
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
      } else if (text.includes('下周')) {
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
      }

      targetDate.setHours(hour, minute, 0, 0);
      finalTime = targetDate.toISOString();
    }

    try {
      const supabase = createAdminClient();

      // 如果关联了灵感，更新灵感的 last_action_at 和 lifecycle
      if (inspirationId) {
        await supabase
          .from('content_items')
          .update({ last_action_at: new Date().toISOString(), lifecycle: 'sprout' })
          .eq('id', inspirationId)
          .eq('user_id', ctx.userId);
      }

      const { data, error } = await supabase
        .from('schedules')
        .insert({
          user_id: ctx.userId,
          title,
          description: description || null,
          scheduled_at: finalTime,
          location: location || null,
          color: '#8B5CF6',
          remind_before: 30,
          source_content_id: inspirationId || null,
        })
        .select()
        .maybeSingle();

      if (error || !data) {
        return { success: false, output: '', error: `日程创建失败: ${error?.message || '未知错误'}` };
      }

      const timeStr = new Date(finalTime).toLocaleString('zh-CN', {
        month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
      });

      let output = `已创建日程：${title} — ${timeStr}`;
      if (location) output += `\n📍 ${location}`;
      if (description) output += `\n📝 ${description}`;
      if (inspirationId) output += `\n🔗 已关联灵感`;

      return { success: true, output, data };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `日程创建失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
