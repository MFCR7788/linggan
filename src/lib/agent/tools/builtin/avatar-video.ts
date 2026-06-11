import type { ToolDefinition } from '../../types';
import { callDeepSeek } from '@/lib/ai-services';

export const generateAvatarVideoTool: ToolDefinition = {
  name: 'generate_avatar_video',
  description: '使用用户预配置的数字分身（HeyGen）生成口播视频。需要用户已在"AI数字人"页面训练好数字分身（有 avatarId）。如果用户没有预配置分身，引导用户去"AI数字人"页面先创建分身。',
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: '讲解主题/脚本内容' },
      style: { type: 'string', description: '口播风格: oral(自然口播), livestream(直播带货), news(新闻播报), emotional(情感讲述)。默认 oral' },
    },
    required: ['topic'],
  },
  async handler(params, ctx) {
    const topic = params.topic as string;
    const style = (params.style as string) || 'oral';

    // 检查预配置分身
    if (!ctx.presets?.avatar || ctx.presets.avatar.status !== 'ready') {
      return {
        success: false,
        output: '尚未配置数字分身，请先去"AI数字人"页面创建你的数字分身。创建后即可在此直接生成口播视频。',
        error: 'no_avatar_preset',
      };
    }

    const { avatarId, name } = ctx.presets.avatar;

    const styleDesc: Record<string, string> = {
      oral: '自然口播风格，像在和朋友聊天，语气亲切自然',
      livestream: '直播带货风格，热情有感染力，有号召性语言',
      news: '新闻播报风格，正式专业，语句工整',
      emotional: '情感讲述风格，温柔舒缓，有故事感',
    };

    // 判断 topic 是否已经是脚本（长文本）还是短主题
    const isScript = topic.length > 80;

    let script: string;
    if (isScript) {
      script = topic;
    } else {
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
        script = await callDeepSeek(genPrompt, { temperature: 0.8, maxTokens: 800 });
      } catch (e) {
        return {
          success: false,
          output: '',
          error: `脚本生成失败: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    // 调用 HeyGen 生成视频
    try {
      const { generateAvatarVideo } = await import('@/lib/ai-services');
      const result = await generateAvatarVideo({
        avatarId,
        script: script.slice(0, 5000),
      });

      if (!result.ok) {
        return {
          success: false,
          output: `分身 "${name}" 视频生成提交失败: ${result.error}`,
          error: result.error,
        };
      }

      return {
        success: true,
        output: `数字分身视频已提交！\n分身: ${name}\n任务ID: ${result.videoId}\n预计耗时: 1-3 分钟\n\n脚本内容:\n\n${script}`,
        data: { taskId: result.videoId, script, avatarName: name, status: 'processing' },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `视频生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
