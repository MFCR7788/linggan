import type { ToolDefinition } from '../../types';
import { callDeepSeek } from '@/lib/ai-services';

export const generateCopywritingTool: ToolDefinition = {
  name: 'generate_copywriting',
  description: '根据主题或灵感生成多平台多风格的文案。支持小红书、公众号、抖音、微博等平台，支持种草、测评、教程等风格。',
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: '文案主题或内容描述' },
      platform: { type: 'string', description: '目标平台: xiaohongshu(小红书), wechat(公众号), douyin(抖音), weibo(微博), bilibili(B站)。默认 xiaohongshu' },
      style: { type: 'string', description: '文案风格: recommend(种草推荐), review(测评), tutorial(教程), story(故事), news(资讯), oral(口播)。默认 recommend' },
      count: { type: 'number', description: '生成变体数量（1-5），默认 1' },
      noAiTaste: { type: 'boolean', description: '是否去AI味（更自然的表达）' },
    },
    required: ['topic'],
  },
  async handler(params, _ctx) {
    const topic = params.topic as string;
    const platform = (params.platform as string) || 'xiaohongshu';
    const style = (params.style as string) || 'recommend';
    const count = Math.min(Math.max((params.count as number) || 1, 1), 5);
    const noAiTaste = (params.noAiTaste as boolean) || false;

    const platformLabels: Record<string, string> = {
      xiaohongshu: '小红书', wechat: '微信公众号', douyin: '抖音', weibo: '微博', bilibili: 'B站',
    };
    const styleLabels: Record<string, string> = {
      recommend: '种草推荐风格', review: '深度测评风格', tutorial: '实用教程风格',
      story: '故事叙述风格', news: '新闻资讯风格', oral: '口语化表达风格',
    };
    const platformLabel = platformLabels[platform] || platform;
    const styleLabel = styleLabels[style] || style;

    try {
      const prompt = `请创作一篇${platformLabel}平台的文案。

主题：${topic}
风格：${styleLabel}
${noAiTaste ? '要求：去掉AI味，使用自然的口语化表达，增加个性化语气，避免过于工整的排比和模板化表达。' : ''}
${count > 1 ? `请生成${count}个不同角度的版本` : ''}

${platformLabel}平台特点：
${platform === 'xiaohongshu' ? '短段落、大量emoji、#标签、口语化、突出个人体验' : ''}
${platform === 'wechat' ? '深度长文、结构化排版、专业知识、引用数据' : ''}
${platform === 'douyin' ? '短句快节奏、网络热词、强互动感、前3秒抓眼球' : ''}
${platform === 'weibo' ? '140字内精炼、话题标签、互动性强、适合转发' : ''}

请直接输出最终文案${count > 1 ? '，每个版本用 --- 分隔' : ''}。`;

      const result = await callDeepSeek(prompt, {
        temperature: 0.8,
        maxTokens: count > 1 ? 2500 : 1500,
      });

      return {
        success: true,
        output: result,
        data: { platform: platformLabel, style: styleLabel, topic, count },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `文案生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
