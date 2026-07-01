import type { ToolDefinition } from '../../types';
import { createAdminClient } from '@/lib/supabase-server';

export const searchScheduleTool: ToolDefinition = {
  name: 'search_schedule',
  description:
    '查询用户的日程安排。当用户问"最近有什么安排""这周有什么事""明天几点有会""帮我查一下日程"等时使用。支持查询今天/本周/未来日程。',
  parameters: {
    type: 'object',
    properties: {
      time_range: {
        type: 'string',
        description:
          '时间范围：today(今天) | tomorrow(明天) | this_week(本周) | next_week(下周) | this_month(本月) | upcoming(所有未完成)',
      },
      keyword: {
        type: 'string',
        description: '按关键词搜索日程标题和描述，可选',
      },
    },
    required: [],
  },
  async handler(params, ctx) {
    const timeRange = (params.time_range as string) || 'upcoming';
    const keyword = params.keyword as string | undefined;

    try {
      const supabase = createAdminClient();
      const now = new Date();

      let startDate: string;
      let endDate: string;

      switch (timeRange) {
        case 'today': {
          const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
          startDate = s.toISOString();
          endDate = e.toISOString();
          break;
        }
        case 'tomorrow': {
          const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          const e = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);
          startDate = s.toISOString();
          endDate = e.toISOString();
          break;
        }
        case 'this_week': {
          const day = now.getDay();
          const mondayOffset = day === 0 ? -6 : 1 - day;
          const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
          const e = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + 6, 23, 59, 59);
          startDate = s.toISOString();
          endDate = e.toISOString();
          break;
        }
        case 'next_week': {
          const day = now.getDay();
          const mondayOffset = (day === 0 ? -6 : 1 - day) + 7;
          const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
          const e = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + 6, 23, 59, 59);
          startDate = s.toISOString();
          endDate = e.toISOString();
          break;
        }
        case 'this_month': {
          const s = new Date(now.getFullYear(), now.getMonth(), 1);
          const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
          startDate = s.toISOString();
          endDate = e.toISOString();
          break;
        }
        default: {
          startDate = now.toISOString();
          endDate = new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59).toISOString();
        }
      }

      let query = supabase
        .from('schedules')
        .select('*')
        .eq('user_id', ctx.userId)
        .eq('status', 'pending')
        .gte('scheduled_at', startDate)
        .lte('scheduled_at', endDate)
        .order('scheduled_at', { ascending: true })
        .limit(20);

      if (keyword) {
        query = query.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%`);
      }

      const { data, error } = await query;

      if (error) {
        return { success: false, output: '', error: `日程查询失败: ${error.message}` };
      }

      if (!data || data.length === 0) {
        const labels: Record<string, string> = {
          today: '今天', tomorrow: '明天', this_week: '本周', next_week: '下周',
          this_month: '本月', upcoming: '未来',
        };
        const label = labels[timeRange] || '当前时间段';
        return { success: true, output: `${label}暂无日程安排。` };
      }

      const lines = data
        .map((s: any, i: number) => {
          const time = new Date(s.scheduled_at).toLocaleString('zh-CN', {
            month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
          });
          let line = `${i + 1}. ${s.title} — ${time}`;
          if (s.location) line += ` 📍 ${s.location}`;
          if (s.description) line += `\n   ${s.description.slice(0, 200)}`;
          return line;
        })
        .join('\n');

      return {
        success: true,
        output: `查询到 ${data.length} 条日程：\n${lines}`,
        data,
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `日程查询失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
