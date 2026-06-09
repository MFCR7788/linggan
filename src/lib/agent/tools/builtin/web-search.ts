import type { ToolDefinition } from '../../types';
import { aggregateSearch } from '@/lib/search/aggregator';

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: '搜索互联网获取最新信息。当需要查找实时资讯、事实核查、或获取用户记忆和知识库之外的信息时使用。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      limit: { type: 'number', description: '返回结果数（默认5）' },
    },
    required: ['query'],
  },
  async handler(params, _ctx) {
    const query = params.query as string;
    const limit = (params.limit as number) || 5;
    try {
      const { results } = await aggregateSearch(query, { maxResults: limit, sourceTimeout: 5000 });
      if (results.length === 0) {
        return { success: true, output: `搜索 "${query}" 未找到相关结果。` };
      }
      const output = results
        .slice(0, limit)
        .map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.content?.substring(0, 200) || ''}`)
        .join('\n\n');
      return { success: true, output, data: results.slice(0, limit) };
    } catch (e) {
      return { success: false, output: '', error: `搜索失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
