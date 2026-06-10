import type { ToolDefinition } from '../../types';
import { callDeepSeek } from '@/lib/ai-services';

export const analyzeLinkTool: ToolDefinition = {
  name: 'analyze_link',
  description: '分析URL链接内容。当用户提供了一个网址链接，需要获取或总结该链接的内容时使用。支持文章、图片、视频链接。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要分析的URL链接' },
    },
    required: ['url'],
  },
  async handler(params, _ctx) {
    const url = params.url as string;

    try {
      // 调用内部链接分析 API
      const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;

      const response = await fetch(jinaUrl, {
        headers: { Accept: 'text/plain' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return {
          success: false,
          output: `链接分析失败：HTTP ${response.status}。请尝试直接粘贴内容给我。`,
          error: `HTTP ${response.status}`,
        };
      }

      const rawContent = await response.text();

      // 用 AI 总结链接内容
      const maxLen = 3000;
      const truncated = rawContent.length > maxLen ? rawContent.substring(0, maxLen) + '...' : rawContent;

      const summary = await callDeepSeek(
        `请对以下网页内容进行总结，用中文输出。包含：标题、来源、主要内容摘要（200字内）、关键要点（3-5条）。\n\n网页内容：\n${truncated}`,
        { temperature: 0.3, maxTokens: 800 }
      );

      return {
        success: true,
        output: summary,
        data: { url, contentLength: rawContent.length },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `链接分析失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
