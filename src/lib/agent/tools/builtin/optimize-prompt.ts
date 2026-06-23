// optimize_prompt — Agent 可调用的提示词优化工具

import type { ToolDefinition } from '../../types';
import { defaultPromptOptimizer } from '../../prompt-optimizer/optimizer';

export const optimizePromptTool: ToolDefinition = {
  name: 'optimize_prompt',
  description:
    '优化用户的提示词。当用户对生成结果不满意、要求改进、或需要换风格时调用。可选择指定框架（AIDA/PAS/SCQA/SWOT等）或优化方向（更详细/更简洁/增加emoji/更专业/更口语化）。',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '需要优化的原始提示词或内容',
      },
      framework: {
        type: 'string',
        description: '可选：指定框架名称，如 AIDA、PAS、SCQA。不指定则自动选择最佳框架。',
      },
      aspect: {
        type: 'string',
        description: '可选：优化方向，如 "更详细"、"更简洁"、"增加emoji"、"更专业"、"更口语化"、"SEO优化"',
      },
    },
    required: ['prompt'],
  },
  async handler(params, ctx) {
    const prompt = params.prompt as string;
    const aspect = params.aspect ? `\n优化方向：${params.aspect}` : '';

    const result = await defaultPromptOptimizer.optimize({
      originalPrompt: prompt + aspect,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      frameworkId: params.framework as string | undefined,
    });

    return {
      success: true,
      output: result.optimized,
      data: {
        original: result.original,
        framework: result.frameworkUsed.name,
        confidence: result.frameworkUsed.confidence,
        reasoning: result.reasoning,
      },
    };
  },
};
