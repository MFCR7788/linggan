// 子 Agent 委托 — 复杂任务拆分并行执行
// 当用户请求跨平台多版本内容时，拆为子任务并行调 LLM，合并结果
// 日期: 2026-06-13

import { callDeepSeek } from '@/lib/ai/chat';
import { callQwen } from '@/lib/ai-services';
import type { SkillDefinition } from '@/lib/assistant/types';

export interface SubTask {
  /** 子任务标签（如"小红书版""抖音版""公众号版"） */
  label: string;
  /** 子任务的 system prompt */
  systemPrompt: string;
  /** 子任务的 user prompt */
  userPrompt: string;
  /** 可选：额外参数 */
  params?: Record<string, string>;
}

export interface SubTaskResult {
  label: string;
  content: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

export interface DelegationResult {
  results: SubTaskResult[];
  totalDurationMs: number;
}

/** 多平台内容拆解 — 从用户请求中识别目标平台列表 */
const PLATFORM_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /小红书|薯片|红书|xiaohongshu|red\s*book/i, label: '小红书版' },
  { pattern: /抖音|douyin|tiktok.*(?:中文|中国)/i, label: '抖音版' },
  { pattern: /公众号|订阅号|微信.*?(?:推文|文章|长文)/i, label: '公众号版' },
  { pattern: /微博|weibo/i, label: '微博版' },
  { pattern: /知乎|zhihu/i, label: '知乎版' },
  { pattern: /B站|bilibili|b\s*站/i, label: 'B站版' },
  { pattern: /快手|kuaishou/i, label: '快手版' },
];

/** 检测用户请求中是否有跨平台意图 */
export function detectCrossPlatform(input: string): string[] {
  const platforms: string[] = [];
  for (const { pattern, label } of PLATFORM_PATTERNS) {
    if (pattern.test(input) && !platforms.includes(label)) {
      platforms.push(label);
    }
  }
  // 只有 ≥2 个平台才触发委托
  return platforms.length >= 2 ? platforms : [];
}

/** 跨平台内容适配模板 — 给每个平台的 system prompt 注入规则 */
const PLATFORM_PROMPTS: Record<string, string> = {
  '小红书版': '你是小红书爆款文案写手。风格：口语化+亲切+emoji点缀，标题用数字+痛点钩子，正文分段不超过3行，加话题标签。字数：300字以内。',
  '抖音版': '你是抖音短视频脚本写手。风格：快节奏+高信息密度+口语感。前3秒钩子+中间展开+结尾互动。字数：适合15-60秒口播量（约100-200字）。',
  '公众号版': '你是公众号长文写手。风格：正式有深度，可分段小标题，适当引用数据。字数：800-1500字，带开头引入和结尾总结。',
  '微博版': '你是微博文案写手。风格：短平快+话题感。字数：140字以内，带2-3个话题标签。',
  '知乎版': '你是知乎高赞答主。风格：专业+深度+个人经验。开头点题，正文展开论证。字数：500-1000字。',
  'B站版': '你是B站视频文案写手。风格：年轻化+弹幕感+幽默。适合做视频脚本。字数：200-400字。',
  '快手版': '你是快手文案写手。风格：接地气+真实感+老铁文化。字数：100-200字。',
};

/**
 * 执行多平台内容委托 — 将用户请求同时适配到多个平台
 * @param content 用户原始内容
 * @param platforms 目标平台列表（从 detectCrossPlatform 获取）
 * @returns 委托结果
 */
export async function delegateMultiPlatform(
  content: string,
  platforms: string[]
): Promise<DelegationResult> {
  const startTime = Date.now();

  // 为每个平台构建子任务
  const subTasks: SubTask[] = platforms.map((label) => ({
    label,
    systemPrompt:
      PLATFORM_PROMPTS[label] ||
      '你是一个专业的内容创作助手，请按指定平台的风格改写内容。',
    userPrompt: `请将以下内容改写为${label}风格：\n\n${content}`,
  }));

  // 并行执行（最多 5 个并发）
  const results = await Promise.allSettled(
    subTasks.map(async (task) => {
      const taskStart = Date.now();
      try {
        const response = await callDeepSeek(
          `${task.systemPrompt}\n\n${task.userPrompt}`,
          { temperature: 0.7, maxTokens: 2000 }
        );
        return {
          label: task.label,
          content: response.trim(),
          success: true,
          durationMs: Date.now() - taskStart,
        };
      } catch (e) {
        return {
          label: task.label,
          content: '',
          success: false,
          error: e instanceof Error ? e.message : String(e),
          durationMs: Date.now() - taskStart,
        };
      }
    })
  );

  return {
    results: results.map((r) =>
      r.status === 'fulfilled'
        ? r.value
        : { label: '未知', content: '', success: false, error: '子任务失败', durationMs: 0 }
    ),
    totalDurationMs: Date.now() - startTime,
  };
}

/** 格式化委托结果为对话消息 */
export function formatDelegationResult(result: DelegationResult): string {
  const succeeded = result.results.filter((r) => r.success);
  const failed = result.results.filter((r) => !r.success);

  if (succeeded.length === 0) {
    return '抱歉，多平台内容生成失败了，请稍后重试。';
  }

  const lines: string[] = [];
  lines.push(`已为你生成 ${succeeded.length} 个平台的版本：`);
  lines.push('');

  for (const r of succeeded) {
    lines.push(`### ${r.label}`);
    lines.push(r.content);
    lines.push('');
  }

  if (failed.length > 0) {
    lines.push(`> ${failed.length} 个版本生成失败，可稍后重试。`);
  }

  return lines.join('\n');
}
