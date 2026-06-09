import type { ToolDefinition } from '../../types';
import { generateEmbedding } from '@/lib/assistant/embedding';
import { KnowledgeManager } from '@/lib/assistant/knowledge/manager';
import { InspirationKnowledgeProvider } from '@/lib/assistant/knowledge/inspiration-provider';
import { PublicKnowledgeProvider } from '@/lib/assistant/knowledge/public-provider';

export const searchKnowledgeTool: ToolDefinition = {
  name: 'search_knowledge',
  description: '搜索知识库（灵感库 + 公共知识库）。当用户想查找之前保存的灵感或知识时使用。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索查询' },
    },
    required: ['query'],
  },
  async handler(params, ctx) {
    const query = params.query as string;
    try {
      const manager = new KnowledgeManager();
      manager.addProvider(new InspirationKnowledgeProvider(ctx.userId));
      manager.addProvider(new PublicKnowledgeProvider());
      const embedding = await generateEmbedding(query);
      const { results } = await manager.search(query, embedding, ctx.userId, 5);
      if (results.length === 0) {
        return { success: true, output: '知识库中未找到相关内容。' };
      }
      const output = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.content.substring(0, 300)}`)
        .join('\n\n');
      return { success: true, output, data: results };
    } catch (e) {
      return { success: false, output: '', error: `知识库搜索失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
