// @deprecated — 已替换为 /api/ai/video/storyboard-v2（一步生成分镜+字幕）
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { callDeepSeek } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

const SCRIPT_TEMPLATE = `【开场·0-3s】
字幕：{开场金句}
画面：{开场画面描述}

【主体·3-8s】
字幕：{核心内容}
画面：{画面描述}
配音：{配音风格提示}

【结尾·8-10s】
字幕：{结尾引导语}
画面：{结尾画面描述}`;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const { action, script, topic, inspirations } = await request.json();

    if (!action || !['generate', 'optimize'].includes(action)) {
      return createApiError('无效操作', 400);
    }

    // 从素材中提取上下文
    let materialContext = '';
    if (inspirations && Array.isArray(inspirations) && inspirations.length > 0) {
      const parts = inspirations.map((insp: any, i: number) => {
        const lines: string[] = [`素材${i + 1}（类型：${insp.type || 'text'}）：`];
        if (insp.title) lines.push(`标题：${insp.title}`);
        if (insp.original_text) lines.push(`原文：${insp.original_text}`);
        if (insp.ai_summary) lines.push(`摘要：${insp.ai_summary}`);
        if (insp.source_url) lines.push(`来源链接：${insp.source_url}`);
        return lines.join('\n');
      });
      materialContext = `\n参考素材：\n${parts.join('\n\n')}\n`;
    }

    let prompt: string;

    if (action === 'generate') {
      prompt = `你是一个短视频脚本专家。请根据以下要求生成一个10秒短视频的完整脚本。

${topic ? `主题方向：${topic}` : ''}${materialContext}
请严格按照以下格式输出：

【开场·0-3s】
字幕：<开场金句，要抓眼球、有冲击力>
画面：<开场画面描述，要有视觉吸引力>

【主体·3-8s】
字幕：<核心内容，表达视频主题>
画面：<主体画面描述，展示核心内容>
配音：<配音风格建议>

【结尾·8-10s】
字幕：<结尾引导语，关注/点赞/收藏引导>
画面：<结尾画面描述+引导动画>

要求：
- 总时长控制在10秒
- 前3秒必须有冲击力抓住注意力
- ${inspirations?.length > 0 ? '基于参考素材创作，保留核心信息' : '自主创作'}
- 内容要精炼紧凑，不冗余
- 语言口语化，适合短视频平台
- 直接输出脚本，不要多余解释`;
    } else {
      // optimize
      if (!script) {
        return createApiError('请提供要优化的脚本', 400);
      }
      prompt = `你是一个专业的短视频脚本优化专家。请优化以下脚本，使其更具吸引力和完播率。

原始脚本：
${script}

优化要求：
1. 前3秒要更有冲击力，能立刻抓住观众注意力
2. 语言更加口语化、自然，去掉AI味
3. 内容节奏更紧凑，删掉冗余表达
4. 结尾引导要更有力
5. 控制在10秒以内

请严格按照以下格式输出优化后的脚本：

【开场·0-3s】
字幕：<优化后的开场金句>
画面：<优化后的开场画面描述>

【主体·3-8s】
字幕：<优化后的核心内容>
画面：<优化后的画面描述>
配音：<配音风格建议>

【结尾·8-10s】
字幕：<优化后的结尾引导语>
画面：<优化后的结尾画面描述>

直接输出优化后的脚本，不要多余解释。`;
    }

    const result = await callDeepSeek(prompt, { temperature: 0.8, maxTokens: 1024 });

    // 从返回中提取脚本内容
    let scriptContent = result;

    // 确保有分节结构
    if (!scriptContent.includes('【开场')) {
      scriptContent = SCRIPT_TEMPLATE;
    }

    return createApiResponse({ script: scriptContent }, action === 'generate' ? '脚本已生成' : '脚本已优化');
  } catch (error) {
    console.error('Video script error:', error);
    return createApiError('脚本生成失败', 500);
  }
}
