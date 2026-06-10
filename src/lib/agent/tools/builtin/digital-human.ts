import type { ToolDefinition } from '../../types';
import { callDeepSeek } from '@/lib/ai-services';

export const generateDigitalHumanTool: ToolDefinition = {
  name: 'generate_digital_human',
  description: '生成数字人讲解视频。需要提供肖像图片和音频。如果没有音频，可先生成口播脚本，再通过 synthesize_speech 工具合成语音。',
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: '讲解主题' },
      style: { type: 'string', description: '口播风格: oral(自然口播), livestream(直播带货), news(新闻播报), emotional(情感讲述)。默认 oral' },
      imageUrl: { type: 'string', description: '数字人肖像图片URL（可选，如无则仅生成脚本）' },
      audioUrl: { type: 'string', description: '配音音频URL（可选，如无则仅生成脚本）' },
    },
    required: ['topic'],
  },
  async handler(params, _ctx) {
    const topic = params.topic as string;
    const style = (params.style as string) || 'oral';
    const imageUrl = params.imageUrl as string | undefined;
    const audioUrl = params.audioUrl as string | undefined;

    const styleDesc: Record<string, string> = {
      oral: '自然口播风格，像在和朋友聊天，语气亲切自然',
      livestream: '直播带货风格，热情有感染力，有号召性语言',
      news: '新闻播报风格，正式专业，语句工整',
      emotional: '情感讲述风格，温柔舒缓，有故事感',
    };

    // 生成口播脚本
    const genPrompt = `请写一个${styleDesc[style] || styleDesc.oral}的口播脚本。
主题：${topic}
要求：
1. 纯口语化表达，适合朗读，不要书面语
2. 不要使用markdown格式（不要标题、列表、符号、加粗等）
3. 短句为主，每句不超过25个字
4. 加入自然的语气停顿和转折词
5. 开头要有吸引力，结尾有总结或互动
6. 直接输出脚本文字，不要任何其他说明或前缀`;

    try {
      const script = await callDeepSeek(genPrompt, { temperature: 0.8, maxTokens: 800 });

      // 如果提供了图片和音频，提交数字人任务
      if (imageUrl && audioUrl) {
        try {
          const { submitDigitalHumanTask } = await import('@/lib/ai-services');
          const result = await submitDigitalHumanTask({
            imageUrl,
            audioUrl,
            resolution: '720P',
          });

          if (result.taskId) {
            return {
              success: true,
              output: `数字人视频已提交生成！\n任务ID: ${result.taskId}\n预计耗时: 2-5分钟`,
              data: { taskId: result.taskId, script, status: 'processing' },
            };
          }
        } catch {
          // 降级：返回脚本
        }
      }

      // 无图片/音频时，返回脚本 + 引导
      return {
        success: true,
        output: `口播脚本已生成（${styleDesc[style] || styleDesc.oral}）：\n\n${script}\n\n${!imageUrl ? '💡 提示: 需要提供数字人肖像图片才能生成视频。' : ''}${!audioUrl ? '💡 提示: 需要提供配音音频，可用 synthesize_speech 工具合成语音。' : ''}`,
        data: { script, hasImage: !!imageUrl, hasAudio: !!audioUrl },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `数字人脚本生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
