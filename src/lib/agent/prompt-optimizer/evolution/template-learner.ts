// 模板学习器 — 从成功反馈中自动归纳行业提示词模板

import { createAdminClient } from '@/lib/supabase-server';
import type { PromptFramework } from '../types';

export interface LearnedTemplate {
  id: string;
  name: string;
  industry: string;
  taskType: string;
  template: string;
  /** 基于的正面反馈样本数 */
  sampleCount: number;
  /** 成功率 */
  successRate: number;
  parentFrameworkId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 从 prompt_feedback 表提取高质量样本，用 LLM 归纳模板
 */
export async function learnTemplates(
  industry?: string,
  minSamples = 5,
): Promise<LearnedTemplate[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from('prompt_feedback')
    .select('original_prompt, optimized_prompt, framework_used, feedback_tags, rating')
    .eq('rating', 1)
    .order('created_at', { ascending: false })
    .limit(200);

  if (industry) {
    // 通过 feedback_tags 过滤行业
    query = query.contains('feedback_tags', [industry]);
  }

  const { data: feedbacks } = await query;

  if (!feedbacks || feedbacks.length < minSamples) return [];

  // 按框架分组
  const grouped = new Map<string, Array<{ original: string; optimized: string }>>();
  for (const f of feedbacks as Array<{ original_prompt: string; optimized_prompt: string; framework_used: string }>) {
    const fid = f.framework_used || 'unknown';
    if (!grouped.has(fid)) grouped.set(fid, []);
    grouped.get(fid)!.push({ original: f.original_prompt, optimized: f.optimized_prompt || f.original_prompt });
  }

  const learned: LearnedTemplate[] = [];
  for (const [fid, samples] of grouped) {
    if (samples.length < minSamples) continue;

    // 归纳：取常见模式
    const template = await induceTemplate(fid, samples);
    if (!template) continue;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // 持久化
    await supabase.from('learned_prompt_templates').upsert(
      {
        id,
        name: `${fid}_learned`,
        industry: industry || '通用',
        task_type: findTaskType(fid),
        template,
        sample_count: samples.length,
        parent_framework_id: fid,
        updated_at: now,
      },
      { onConflict: 'parent_framework_id,industry,task_type' },
    );

    learned.push({
      id,
      name: `${fid}_learned`,
      industry: industry || '通用',
      taskType: findTaskType(fid),
      template,
      sampleCount: samples.length,
      successRate: 1.0,
      parentFrameworkId: fid,
      createdAt: now,
      updatedAt: now,
    });
  }

  return learned;
}

/**
 * 从样本中归纳模板
 * 简化版：取最常见的优化后 prompt 结构作为模板骨架
 */
async function induceTemplate(
  frameworkId: string,
  samples: Array<{ original: string; optimized: string }>,
): Promise<string | null> {
  // 简化归纳策略：
  // 1. 提取优化后 prompt 的共性结构（角色设定 / 输出格式 / 约束条件）
  // 2. 构造 {prompt} 占位模板

  const optimizedSamples = samples.map((s) => s.optimized).filter((s) => s.length > 0);
  if (optimizedSamples.length < 3) return null;

  // 取中等长度的样本作为模板基础（避免过长/过短）
  const sorted = [...optimizedSamples].sort((a, b) => a.length - b.length);
  const median = sorted[Math.floor(sorted.length / 2)];

  // 简化：取中间样本，替换具体内容为 {prompt} 占位符
  // 保留结构特征：角色词 / 格式说明 / 约束词
  const roleMarkers = ['你是', '作为', '请扮演', '你是一位', '角色', '身份'];
  const formatMarkers = ['格式', '输出', '返回', '按以下', '结构', '步骤'];
  const constraintMarkers = ['要求', '必须', '不要', '禁止', '注意', '确保', '限制'];

  const hasRole = roleMarkers.some((m) => median.includes(m));
  const hasFormat = formatMarkers.some((m) => median.includes(m));
  const hasConstraint = constraintMarkers.some((m) => median.includes(m));

  // 构造模板骨架
  const parts: string[] = [];
  if (hasRole) parts.push('[角色设定 — 从样本学习]');
  parts.push('{prompt}');
  if (hasFormat) parts.push('[输出格式 — 从样本学习]');
  if (hasConstraint) parts.push('[质量标准 — 从样本学习]');

  return parts.join('\n\n');
}

function findTaskType(frameworkId: string): string {
  const mapping: Record<string, string> = {
    aida: 'copywriting',
    pas: 'copywriting',
    scqa: 'copywriting',
    bab: 'copywriting',
    scamper: 'brainstorming',
    crispe: 'image_generation',
    risen: 'image_generation',
    race: 'analysis',
    ape: 'planning',
    tag: 'analysis',
    smart: 'planning',
    swot: 'analysis',
    eli5: 'education',
    socratic: 'education',
    spark: 'copywriting',
    trace: 'analysis',
    era: 'planning',
    rtf: 'copywriting',
    care: 'copywriting',
  };
  return mapping[frameworkId] || 'general';
}

/**
 * 加载已学习的模板
 */
export async function loadLearnedTemplates(industry?: string): Promise<LearnedTemplate[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from('learned_prompt_templates')
    .select('*')
    .order('sample_count', { ascending: false })
    .limit(20);

  if (industry) {
    query = query.eq('industry', industry);
  }

  const { data } = await query;
  if (!data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    industry: r.industry as string,
    taskType: r.task_type as string,
    template: r.template as string,
    sampleCount: r.sample_count as number,
    successRate: (r.total_feedback ? (r.positive_feedback as number) / (r.total_feedback as number) : 0.5),
    parentFrameworkId: r.parent_framework_id as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}
