import type { ToolDefinition } from '../../types';
import { callDeepSeek } from '@/lib/ai-services';
import { renderRevideoRemote } from '@/lib/revideo-render';

interface TemplateProps {
  compositionId: 'TitleIntro';
  props: Record<string, unknown>;
  reasoning: string;
}

const TEMPLATE_INFO: Record<string, { description: string }> = {
  TitleIntro: {
    description: '标题开场动画模板 (1920×1080 16:9 横屏)，适合B站/YouTube片头。MIT 许可，无水印。',
  },
};

export const generateVideoTemplateTool: ToolDefinition = {
  name: 'generate_video_template',
  description: `根据用户需求自动生成视频。当用户说"帮我生成一段视频"、"做一个片头"、"生成抖音视频"、"做一段关于XX的宣传片"等时调用此工具。

工具自动完成全流程：
1. 分析用户意图，生成标题、副标题等创作参数
2. 调用 Revideo 渲染引擎（MIT 许可，无水印）
3. 上传到云存储
4. 返回视频的公网 URL

整个流程自动完成，用户只需一句话描述需求。渲染需要约 10-30 秒。

可用模板：TitleIntro — 横版片头开场动画 (1920×1080)，含标题 spring 弹入、装饰线展开、光晕呼吸动画。`,

  parameters: {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description: '用户的视频需求描述。包含主题、风格、平台偏好等信息。',
      },
      platform: {
        type: 'string',
        enum: ['抖音', 'B站', '小红书', '微信', 'YouTube'],
        description: '目标发布平台。',
      },
    },
    required: ['request'],
  },

  async handler(params, ctx) {
    const request = params.request as string;
    const platform = (params.platform as string) || '';
    const userId = ctx.userId;

    const prompt = `你是视频创作专家。根据用户需求，生成 TitleIntro 片头动画的渲染参数。

用户需求: ${request}
${platform ? `目标平台: ${platform}` : ''}

可用模板：
- TitleIntro — 横版片头 1920×1080 (16:9)
  参数: title(标题,必填,15字内), subtitle(副标题,25字内), backgroundColor(背景色,默认#0A1629), accentColor(强调色)

输出 JSON（只输出 JSON，不要任何其他文字）：
{
  "compositionId": "TitleIntro",
  "reasoning": "选择理由",
  "props": { "title": "...", "subtitle": "...", "backgroundColor": "...", "accentColor": "..." }
}

规则：
- title 控制在15字以内，有吸引力
- subtitle 控制在25字以内
- accentColor 从 #8B5CF6(紫) #3B82F6(蓝) #F59E0B(金) #EC4899(粉) #10B981(绿) 中选最合适的
- 只输出 JSON`;

    let template: TemplateProps;
    try {
      const result = await callDeepSeek(prompt, { temperature: 0.7, maxTokens: 1000 });

      try {
        const cleaned = result
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .trim();
        template = JSON.parse(cleaned) as TemplateProps;
      } catch {
        const match = result.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('无法解析 JSON');
        template = JSON.parse(match[0]) as TemplateProps;
      }

      if (!template.compositionId || !template.props) {
        throw new Error('模板参数不完整');
      }
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `参数生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const tInfo = TEMPLATE_INFO[template.compositionId];
    if (!tInfo) {
      return { success: false, output: '', error: `未知模板: ${template.compositionId}` };
    }

    // 调用 Revideo 渲染引擎（MIT 许可，无水印）
    try {
      const result = await renderRevideoRemote({
        compositionId: template.compositionId,
        props: template.props,
        userId,
        durationInFrames: 150,
        fps: 30,
      });

      const sizeMB = (result.size / 1024 / 1024).toFixed(1);

      const output = `${template.reasoning}

视频已生成完成：

📹 **视频链接**: ${result.url}
🎬 **模板**: TitleIntro 片头动画 (${result.width}×${result.height})
⏱ **时长**: ${(result.durationInFrames / result.fps).toFixed(1)} 秒
📦 **大小**: ${sizeMB} MB

${template.props.title ? `🎬 **标题**: ${template.props.title}` : ''}
${template.props.subtitle ? `📝 **副标题**: ${template.props.subtitle}` : ''}

> Revideo MIT 许可渲染，无水印。可直接下载使用。`;

      return {
        success: true,
        output,
        data: result,
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `视频渲染失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
