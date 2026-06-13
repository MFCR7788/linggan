import type { ToolDefinition } from '../../types';

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
  async handler(params, _ctx) {
    const title = params.title as string;
    const content = params.content as string;
    const contentType = (params.contentType as string) || 'ai';
    const tags = params.tags ? (params.tags as string).split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/inspiration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          original_text: content,
          type: contentType,
          tags,
          source: 'agent',
          status: 'pending',
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, output: `保存失败: ${err}` };
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
