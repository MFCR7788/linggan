// 今日创作提案 — 基于热点+账号类型+用户偏好，生成选题建议
// 用户问"今天做什么"→ 返回 <choices> 卡片 → 选择后自动调用生成工具链

import type { ToolDefinition } from '../../types';
import { createAdminClient } from '@/lib/supabase-server';
import { getAccountTypePreset } from '@/lib/account-presets';
import { MemoryManager } from '@/lib/assistant/memory/manager';
import { BuiltinMemoryProvider } from '@/lib/assistant/memory/builtin-provider';
import { generateEmbedding } from '@/lib/assistant/embedding';
import { callDeepSeek } from '@/lib/ai/chat';
import type { AccountTypePreset } from '@/lib/account-presets';

interface HotItem {
  title: string;
  ai_summary: string | null;
  relevance_score: number;
  platform: string;
  published_at: string;
}

interface ContentProposal {
  angle_title: string;
  angle_description: string;
  suggested_pipeline: string[];
  prefill_params: Record<string, string>;
}

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
      const supabase = createAdminClient();

      // 1. 获取用户账号类型
      const { data: userData } = await supabase
        .from('users')
        .select('account_type')
        .eq('id', ctx.userId)
        .single();

      const accountType = userData?.account_type || null;
      const preset = getAccountTypePreset(accountType);

      // 2. 获取最近 7 天热点（按相关度排序，取前 5）
      let hotspots: HotItem[] = [];
      try {
        const sevenDaysAgo = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000
        ).toISOString();
        const { data: hotData } = await supabase
          .from('hot_items')
          .select('title, ai_summary, relevance_score, platform, published_at')
          .gte('published_at', sevenDaysAgo)
          .order('relevance_score', { ascending: false })
          .limit(5);

        if (hotData) hotspots = hotData;
      } catch {
        // 热点查询是增强项，失败不阻断
      }

      // 3. 搜索用户创作偏好（best-effort）
      let memoryBlock = '';
      try {
        const manager = new MemoryManager();
        manager.addProvider(new BuiltinMemoryProvider());
        await manager.initialize(ctx.userId);
        const embedding = await generateEmbedding(
          focusArea || '创作偏好 内容风格 选题方向'
        );
        memoryBlock =
          (await manager.prefetchAll(
            focusArea || '创作偏好 内容风格 选题方向',
            embedding
          )) || '';
      } catch {
        // Memory 查询是增强项
      }

      // 4. 构建 prompt → DeepSeek 生成提案
      const promptText = buildProposalPrompt({
        focusArea,
        count,
        preset,
        hotspots,
        memoryBlock,
      });

      const rawResponse = await callDeepSeek(promptText, {
        temperature: 0.8,
        maxTokens: 2000,
      });

      // 5. 解析 JSON
      const proposals = parseProposals(rawResponse, count);

      // 6. 格式化 choices 输出
      const choicesBlock = formatChoicesBlock(proposals);

      return {
        success: true,
        output: choicesBlock,
        data: { proposals, accountType: accountType || '未设置', hotspotCount: hotspots.length },
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

// ─── prompt 构建 ───

interface PromptInput {
  focusArea?: string;
  count: number;
  preset: AccountTypePreset | null;
  hotspots: HotItem[];
  memoryBlock: string;
}

function buildProposalPrompt(input: PromptInput): string {
  const lines: string[] = [];

  lines.push(`你是灵集AI的创作合伙人。请根据以下信息，为用户生成 ${input.count} 个今日内容选题提案。`);
  lines.push('');
  lines.push('## 用户画像');

  if (input.preset) {
    lines.push(`- 账号类型：${input.preset.emoji} ${input.preset.label}`);
    lines.push(`- 目标受众：${input.preset.audience}`);
    lines.push(`- 推荐风格：${input.preset.recommendedStyles.join('、')}`);
    lines.push(`- 推荐行业：${input.preset.recommendedIndustries.join('、')}`);
    lines.push(`- 推荐平台：${input.preset.recommendedPlatforms.join('、')}`);
  } else {
    lines.push('- 账号类型：未设置（通用创作者）');
  }

  if (input.focusArea) {
    lines.push(`- 当前关注：${input.focusArea}`);
  }

  if (input.memoryBlock) {
    lines.push(`- 创作偏好：${input.memoryBlock.substring(0, 500)}`);
  }

  lines.push('');
  lines.push('## 今日热点');

  if (input.hotspots.length > 0) {
    input.hotspots.forEach((h, i) => {
      const summary = h.ai_summary || h.title;
      lines.push(`${i + 1}. [${h.platform}] ${summary}（相关度: ${h.relevance_score || '?'}）`);
    });
  } else {
    lines.push('暂无热点数据，可根据行业趋势自由发挥。');
  }

  lines.push('');
  lines.push('## 可用生成工具（suggested_pipeline 只能从以下选）');
  lines.push('- generate_agnes_video: 照片+文案 → 口播视频（口型同步+运镜）');
  lines.push('- video_face_swap: 原视频+新照片 → 换脸保留场景');
  lines.push('- generate_hyperframes: 文案 → 动态文字动画视频');
  lines.push('- compose_video: 多张图+BGM+字幕 → 合成视频');
  lines.push('- generate_video: 文字描述 → AI 生成视频');
  lines.push('- generate_digital_human: 照片+音频 → 数字人口播');
  lines.push('- generate_image: 文字描述 → AI 图片');
  lines.push('- generate_copywriting: 主题+平台 → AI 文案');
  lines.push('');
  lines.push('## 输出要求');
  lines.push('输出一个 JSON 数组，每个元素格式：');
  lines.push('{');
  lines.push('  "angle_title": "选题角度（10字以内，吸引人）",');
  lines.push('  "angle_description": "一句话说明（30字以内，解释为什么这个选题现在做合适）",');
  lines.push('  "suggested_pipeline": ["工具名1", "工具名2"],');
  lines.push('  "prefill_params": { "topic": "预填主题", "style": "预填风格" }');
  lines.push('}');
  lines.push('');
  lines.push(`请直接输出 JSON 数组（${input.count} 个），不要有其他文字。`);
  lines.push('选题要有差异化，覆盖不同角度。pipeline 建议 1-3 步，推荐最合适的工具组合。');

  return lines.join('\n');
}

// ─── JSON 解析 ───

function parseProposals(raw: string, expectedCount: number): ContentProposal[] {
  // 尝试提取 JSON 数组
  const trimmed = raw.trim();

  // 去掉可能的 markdown 代码块包裹
  let jsonStr = trimmed;
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // 尝试找到 JSON 数组边界
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    jsonStr = arrayMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, expectedCount).map((item: Record<string, unknown>) => ({
        angle_title: String(item.angle_title || '未命名选题'),
        angle_description: String(item.angle_description || ''),
        suggested_pipeline: Array.isArray(item.suggested_pipeline)
          ? item.suggested_pipeline.map(String)
          : [],
        prefill_params:
          typeof item.prefill_params === 'object' && item.prefill_params !== null
            ? Object.fromEntries(
                Object.entries(item.prefill_params as Record<string, unknown>).map(
                  ([k, v]) => [k, String(v)]
                )
              )
            : {},
      }));
    }
  } catch {
    // JSON 解析失败，尝试从文本中提取
  }

  // 降级：返回占位提案
  return [
    {
      angle_title: '今日热点选题',
      angle_description: '结合当前热点趋势，创作一条相关内容',
      suggested_pipeline: ['generate_copywriting', 'generate_agnes_video'],
      prefill_params: { topic: '今日热点' },
    },
  ];
}

// ─── choices 格式化 ───

function formatChoicesBlock(proposals: ContentProposal[]): string {
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
