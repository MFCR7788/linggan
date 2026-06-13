// 主动建议引擎 — 生成今日内容选题提案
// 从 suggestContentIdeasTool 抽取核心逻辑，供 cron 主动推送和 Agent 按需调用复用

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

export interface SuggestionResult {
  proposals: ContentProposal[];
  accountType: string;
  hotspotCount: number;
}

/**
 * 为指定用户生成内容选题提案
 * 可同时被 Agent Tool 和 cron push-suggestions 调用
 */
export async function generateSuggestions(
  userId: string,
  options?: { focusArea?: string; count?: number }
): Promise<SuggestionResult> {
  const focusArea = options?.focusArea;
  const count = Math.min(options?.count || 3, 5);

  const supabase = createAdminClient();

  // 1. 获取用户账号类型
  const { data: userData } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', userId)
    .single();

  const accountType = userData?.account_type || null;
  const preset = getAccountTypePreset(accountType);

  // 2. 获取最近 7 天热点
  let hotspots: HotItem[] = [];
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: hotData } = await supabase
      .from('hot_items')
      .select('title, ai_summary, relevance_score, platform, published_at')
      .gte('published_at', sevenDaysAgo)
      .order('relevance_score', { ascending: false })
      .limit(5);

    if (hotData) hotspots = hotData;
  } catch {
    // 热点查询失败不阻断
  }

  // 3. 搜索用户创作偏好
  let memoryBlock = '';
  try {
    const manager = new MemoryManager();
    manager.addProvider(new BuiltinMemoryProvider());
    await manager.initialize(userId);
    const embedding = await generateEmbedding(focusArea || '创作偏好 内容风格 选题方向');
    memoryBlock = (await manager.prefetchAll(focusArea || '创作偏好 内容风格 选题方向', embedding)) || '';
  } catch {
    // Memory 查询失败不阻断
  }

  // 4. 构建 prompt → DeepSeek 生成提案
  const promptText = buildPrompt({
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

  return {
    proposals,
    accountType: accountType || '未设置',
    hotspotCount: hotspots.length,
  };
}

/**
 * 将提案格式化为内联 JSON 字符串，用于存储到 content_suggestions 表
 */
export function serializeProposals(proposals: ContentProposal[]): string {
  return JSON.stringify(proposals);
}

/**
 * 从存储的 JSON 反序列化提案
 */
export function deserializeProposals(json: string): ContentProposal[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed as ContentProposal[];
  } catch {
    // ignore
  }
  return [];
}

// ─── prompt 构建 ───

interface PromptInput {
  focusArea?: string;
  count: number;
  preset: AccountTypePreset | null;
  hotspots: HotItem[];
  memoryBlock: string;
}

function buildPrompt(input: PromptInput): string {
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
  const trimmed = raw.trim();

  let jsonStr = trimmed;
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

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
                Object.entries(item.prefill_params as Record<string, unknown>).map(([k, v]) => [k, String(v)])
              )
            : {},
      }));
    }
  } catch {
    // fall through to fallback
  }

  // 降级
  return [
    {
      angle_title: '今日热点选题',
      angle_description: '结合当前热点趋势，创作一条相关内容',
      suggested_pipeline: ['generate_copywriting', 'generate_agnes_video'],
      prefill_params: { topic: '今日热点' },
    },
  ];
}
