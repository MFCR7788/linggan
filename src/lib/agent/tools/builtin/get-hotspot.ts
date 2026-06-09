import type { ToolDefinition } from '../../types';
import { analyzeContent } from '@/lib/analysis/hotspot-analyzer';

export const getHotspotTool: ToolDefinition = {
  name: 'get_hotspot',
  description: '分析热点话题趋势。当用户询问最近有什么热点、流行话题时使用。',
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: '可选：指定话题领域，如"科技"、"娱乐"' },
    },
    required: [],
  },
  async handler(params, _ctx) {
    const topic = (params.topic as string) || '热门话题';
    try {
      const result = await analyzeContent(
        `请分析当前关于"${topic}"的热点趋势和关键信息`,
        'hotspot'
      );
      if (!result || !result.summary) {
        return { success: true, output: `关于"${topic}"暂无热点数据。` };
      }
      return {
        success: true,
        output: result.summary,
        data: result,
      };
    } catch (e) {
      return { success: false, output: '', error: `热点分析失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
