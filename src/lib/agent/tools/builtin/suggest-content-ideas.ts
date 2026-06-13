// 今日创作提案 — 基于热点+账号类型+用户偏好，生成选题建议
// 用户问"今天做什么"→ 返回 <choices> 卡片 → 选择后自动调用生成工具链
// 核心逻辑已抽取到 src/lib/jobs/suggestion-generator.ts

import type { ToolDefinition } from '../../types';
import { generateSuggestions } from '@/lib/jobs/suggestion-generator';

export const suggestContentIdeasTool: ToolDefinition = {
  name: 'suggest_content_ideas',
  description:
    '基于今日热点趋势、账号类型和用户创作偏好，生成内容选题提案。每个提案包含选题角度、一句话说明、推荐生成流程和预填参数。用户问"今天做什么"、"有什么好点子"、"推荐选题"、"给我一些灵感"时调用。',
  parameters: {
    type: 'object',
    properties: {
      focus_area: {
        type: 'string',
        description: '可选：关注的内容领域，如"科技"、"美食"、"美妆"',
      },
      count: {
        type: 'number',
        description: '提案数量（默认 3，最多 5）',
      },
    },
    required: [],
  },
  async handler(params, ctx) {
    const focusArea = (params.focus_area as string) || undefined;
    const count = Math.min((params.count as number) || 3, 5);

    try {
      const result = await generateSuggestions(ctx.userId, { focusArea, count });
      const choicesBlock = formatChoicesBlock(result.proposals);

      return {
        success: true,
        output: choicesBlock,
        data: {
          proposals: result.proposals,
          accountType: result.accountType,
          hotspotCount: result.hotspotCount,
        },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `选题提案生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

function formatChoicesBlock(proposals: { angle_title: string; angle_description: string; suggested_pipeline: string[] }[]): string {
  const lines: string[] = [];

  lines.push('为你找到以下创作提案，选一个开始吧：');
  lines.push('');
  lines.push('<choices multi="false">');

  for (const p of proposals) {
    const pipeline = p.suggested_pipeline.length > 0
      ? `（流程: ${p.suggested_pipeline.join(' → ')}）`
      : '';
    lines.push(`${p.angle_title}: ${p.angle_description} ${pipeline}`);
  }

  lines.push('</choices>');

  return lines.join('\n');
}
