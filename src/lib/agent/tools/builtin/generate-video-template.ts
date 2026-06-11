import type { ToolDefinition } from '../../types';
import { callDeepSeek } from '@/lib/ai-services';
import { renderRemotionRemote } from '@/lib/remotion-render';

interface TemplateProps {
  compositionId: 'TikTokShort' | 'TitleIntro';
  props: Record<string, unknown>;
  reasoning: string;
}

const TEMPLATE_INFO: Record<string, { description: string }> = {
  TikTokShort: {
    description: '短视频模板 (1080×1920 9:16 竖屏)，适合抖音/小红书。',
  },
  TitleIntro: {
    description: '标题开场动画模板 (1920×1080 16:9 横屏)，适合B站/YouTube片头。',
  },
};

export const generateVideoTemplateTool: ToolDefinition = {
  name: 'generate_video_template',
  description: `根据用户需求自动生成视频。当用户说"帮我生成一段视频"、"做一个片头"、"生成抖音视频"、"做一段关于XX的宣传片"等时调用此工具。

工具会自动完成全流程：
1. 分析用户意图，选择合适模板（TikTokShort 竖版/TitleIntro 横版）
2. 生成标题、副标题等创作参数
3. 调用 Remotion 渲染引擎渲染视频
4. 上传到云存储
5. 返回视频的公网 URL

整个流程自动完成，用户只需一句话描述需求。渲染需要 1-3 分钟，请让用户稍等。

注意：当前为免费版 PoC，视频会带 Remotion 水印，最长 30 秒。`,

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
        description: '目标发布平台，抖音/小红书选竖版，B站/YouTube选横版。',
      },
    },
    required: ['request'],
  },

  // 标记为长时间运行（渲染需要 1-3 分钟）
  isLongRunning: true,

  async handler(params, ctx) {
    const request = params.request as string;
    const platform = (params.platform as string) || '';
    const userId = ctx.userId;

    const prefersTikTok = ['抖音', '小红书'].includes(platform);
    const prefersIntro = ['B站', 'YouTube'].includes(platform);

    // Step 1: 用 DeepSeek 生成模板参数
    const prompt = `你是视频创作专家。根据用户需求，选择合适模板并生成渲染参数。

用户需求: ${request}
${platform ? `目标平台: ${platform}` : ''}
${prefersTikTok ? '请选择 TikTokShort (竖版短视频 1080×1920)' : ''}
${prefersIntro ? '请选择 TitleIntro (横版片头 1920×1080)' : ''}

可用模板：
1. TikTokShort — 竖版短视频 1080×1920 (9:16)
   参数: title(标题,必填), subtitle(副标题), clips(视频片段数组[{url,startFrame?,durationFrames?}],可空数组), bgmUrl(背景音乐URL), bgmVolume(音量0-1,默认0.3), accentColor(主题色)

2. TitleIntro — 横版片头 1920×1080 (16:9)
   参数: title(标题,必填), subtitle(副标题), backgroundColor(背景色,默认#0A1629), accentColor(强调色), showParticles(粒子动画,默认true)

输出 JSON（只输出 JSON，不要任何其他文字）：
{
  "compositionId": "TikTokShort 或 TitleIntro",
  "reasoning": "选择理由",
  "props": { ... }
}

规则：
- title 控制在15字以内，有新媒体的吸引力
- subtitle 控制在25字以内
- accentColor 从 #8B5CF6(紫) #3B82F6(蓝) #F59E0B(金) #EC4899(粉) #10B981(绿) 中选最合适的
- clips 如无素材留空数组 []
- 用户未指定平台时，根据内容判断：生活/娱乐类→TikTokShort，知识/教程类→TitleIntro

只输出 JSON。`;

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

    // Step 2: 自动调用 Remotion 渲染
    try {
      const result = await renderRemotionRemote({
        compositionId: template.compositionId,
        props: template.props,
        userId,
        durationInFrames: template.compositionId === 'TitleIntro' ? 150 : 900,
        fps: 30,
        outputFormat: 'mp4',
      });

      const sizeMB = (result.size / 1024 / 1024).toFixed(1);

      const output = `${template.reasoning}

视频已生成完成：

📹 **视频链接**: ${result.url}
📐 **模板**: ${template.compositionId} (${result.width}×${result.height})
⏱ **时长**: ${(result.durationInFrames / result.fps).toFixed(1)} 秒
📦 **大小**: ${sizeMB} MB

${template.props.title ? `🎬 **标题**: ${template.props.title}` : ''}
${template.props.subtitle ? `📝 **副标题**: ${template.props.subtitle}` : ''}

> 当前为免费版，视频带 Remotion 水印。可直接点击链接预览。`;

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
