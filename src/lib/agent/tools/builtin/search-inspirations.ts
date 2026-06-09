import type { ToolDefinition } from '../../types';
import { generateEmbedding } from '@/lib/assistant/embedding';
import { KnowledgeManager } from '@/lib/assistant/knowledge/manager';
import { InspirationKnowledgeProvider } from '@/lib/assistant/knowledge/inspiration-provider';

export const searchInspirationsTool: ToolDefinition = {
  name: 'search_inspirations',
  description: '搜索用户的灵感收藏。当用户想找之前收藏的灵感素材时使用。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
    },
    required: ['query'],
  },
  async handler(params, ctx) {
    const query = params.query as string;
    try {
      const manager = new KnowledgeManager();
      manager.addProvider(new InspirationKnowledgeProvider(ctx.userId));
      const embedding = await generateEmbedding(query);
      const { results } = await manager.search(query, embedding, ctx.userId, 5);
      if (results.length === 0) {
        return { success: true, output: '灵感库中未找到相关内容。' };
      }
      const output = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.content.substring(0, 300)}`)
        .join('\n\n');
      return { success: true, output, data: results };
    } catch (e) {
      return { success: false, output: '', error: `灵感搜索失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
