// 标题优化器 Agent Tool — 多平台标题生成
// 底层引擎: title-optimizer.ts (纯 LLM，DeepSeek)

import type { ToolDefinition } from '../../types';
import { optimizeTitles } from '@/lib/ai/title-optimizer';
import type { Platform, TitleType } from '@/lib/ai/title-optimizer';

const PLATFORM_LABELS: Record<string, string> = {
  '抖音': '📱 抖音', '小红书': '📕 小红书', 'B站': '🎬 B站',
  '视频号': '📺 视频号', '快手': '⚡ 快手', 'YouTube': '🌍 YouTube',
};

export const titleOptimizerTool: ToolDefinition = {
  name: 'title_optimizer',
  description: `为视频内容生成多个平台的优化标题。支持 6 大平台（抖音/小红书/B站/视频号/快手/YouTube）和 7 种标题类型（悬念/信息/情绪/痛点/教程/对比/互动）。
使用场景：当用户要求"优化标题"、"生成标题"、"写几个标题"、"多平台标题"、"标题建议"时调用。

每个标题附带评分（1-5★）和简短理由，贴合各平台的字数限制和风格偏好。`,
  isLongRunning: false,
  parameters: {
    type: 'object',
    properties: {
      contentText: {
        type: 'string',
        description: '视频文案或转写内容（必填）。可以是口播文案、字幕文本、视频描述等',
      },
      platforms: {
        type: 'array',
        description: '目标平台列表。默认 抖音/小红书/B站',
        items: { type: 'string', enum: ['抖音', '小红书', 'B站', '视频号', '快手', 'YouTube'] },
      },
      titleTypes: {
        type: 'array',
        description: '标题类型列表。默认全部 7 种',
        items: { type: 'string', enum: ['悬念型', '信息型', '情绪型', '痛点型', '教程型', '对比型', '互动型'] },
      },
      customContext: {
        type: 'string',
        description: '额外上下文信息，如产品名、品牌调性、目标受众等',
      },
    },
    required: ['contentText'],
  },
  async handler(params, _ctx) {
    const contentText = params.contentText as string;
    const platforms = params.platforms as Platform[] | undefined;
    const titleTypes = params.titleTypes as TitleType[] | undefined;
    const customContext = params.customContext as string | undefined;

    try {
      const result = await optimizeTitles({
        contentText,
        platforms,
        titleTypes,
        customContext,
      });

      const lines: string[] = [
        `**标题优化完成！** 生成了 ${result.platforms.reduce((s, p) => s + p.candidates.length, 0)} 条标题。`,
        '',
        `📝 **内容摘要**: ${result.contentSummary}`,
        `🏷️ **关键词**: ${result.keywords.join(' / ')}`,
        '',
      ];

      for (const pt of result.platforms) {
        const label = PLATFORM_LABELS[pt.platform] || pt.platform;
        lines.push(`---`);
        lines.push(`### ${label}`);
        for (const c of pt.candidates) {
          const stars = '★'.repeat(c.score) + '☆'.repeat(5 - c.score);
          lines.push(`- ${stars} **${c.text}** (${c.type})`);
          if (c.reasoning) lines.push(`  > ${c.reasoning}`);
        }
        lines.push('');
      }

      return {
        success: true,
        output: lines.join('\n'),
        data: result,
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `标题生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
