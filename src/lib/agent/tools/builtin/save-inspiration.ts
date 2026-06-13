import type { ToolDefinition } from '../../types';
import { createAdminClient } from '@/lib/supabase-server';

export const saveToInspirationTool: ToolDefinition = {
  name: 'save_to_inspiration',
  description: '将对话中生成的内容保存到用户的灵感库。当用户对文案/图片/视频等内容表示满意，或主动要求保存时使用。保存时必须打标签：tags 参数传 "source:xxx,tool:xxx,topic:xxx"（source: inspiration/web/ai/user, tool: 使用的工具名, topic: 主题关键词）。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '内容标题' },
      content: { type: 'string', description: '要保存的内容（文本）' },
      contentType: { type: 'string', description: '内容类型: text(文本), image(图片), video(视频), audio(音频), ai(AI作品)。默认 ai' },
      tags: { type: 'string', description: '标签，用逗号分隔（可选）' },
    },
    required: ['title', 'content'],
  },
  async handler(params, ctx) {
    const title = params.title as string;
    const content = params.content as string;
    const contentType = (params.contentType as string) || 'ai';
    const tags = params.tags ? (params.tags as string).split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

    try {
      // 直接写 Supabase，避免 HTTP 回环（无需 NEXT_PUBLIC_SITE_URL）
      const supabase = createAdminClient();
      const { error } = await supabase.from('inspirations').insert({
        user_id: ctx.userId,
        title,
        original_text: content,
        type: contentType,
        tags,
        source: 'agent',
        status: 'pending',
      });

      if (error) {
        return { success: false, output: `保存失败: ${error.message}` };
      }

      return {
        success: true,
        output: `已保存到灵感库：${title}`,
        data: { title, contentType, tags },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `保存失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
