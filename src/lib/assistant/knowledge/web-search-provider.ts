// 联网搜索 Provider — 知识库无结果时的回退
// priority = 9（最低优先级，最后尝试）

import type { KnowledgeProvider } from './provider';
import type { KnowledgeResult, SearchOptions } from '../types';
import { callDeepSeek } from '@/lib/ai-services';

export class WebSearchProvider implements KnowledgeProvider {
  readonly name = 'web-search';
  readonly priority = 9;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async search(query: string, _embedding: number[], opts: SearchOptions): Promise<KnowledgeResult[]> {
    try {
      const prompt = `请联网搜索关于以下话题的最新信息，整理出关键要点：

话题：${query}

请以 JSON 格式返回搜索结果（不超过 3 条）：
{
  "results": [
    {
      "title": "信息标题",
      "content": "简要信息内容（200字以内）",
      "source": "来源说明"
    }
  ]
}

如果没有找到相关信息，返回空数组：{"results": []}`;

      const result = await callDeepSeek(prompt, {
        temperature: 0.1,
        maxTokens: 800,
        enableSearch: true,
      });

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      const results: { title: string; content: string; source: string }[] =
        parsed.results || [];

      return results.map((r, i) => ({
        id: `web-${Date.now()}-${i}`,
        title: r.title || '搜索结果',
        content: r.content || '',
        source: r.source || '联网搜索',
        similarity: 0.85,
      }));
    } catch (e) {
      console.warn('[WebSearch] 搜索失败:', e);
      return [];
    }
  }
}
