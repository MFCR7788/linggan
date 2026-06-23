// 报告生成器 — 周报/月报

import { createAdminClient } from '@/lib/supabase-server';

export interface OptimizationReport {
  id: string;
  period: 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  totalOptimizations: number;
  totalFeedback: number;
  overallSuccessRate: number;
  topFrameworks: Array<{ name: string; rate: number; feedback: number }>;
  worstFrameworks: Array<{ name: string; rate: number; feedback: number }>;
  industryBreakdown: Array<{ industry: string; rate: number; feedback: number }>;
  topPositiveTags: string[];
  topNegativeTags: string[];
  improvementSuggestions: string[];
  generatedAt: string;
}

/**
 * 生成指定周期的优化报告
 */
export async function generateReport(
  period: 'weekly' | 'monthly' = 'weekly',
): Promise<OptimizationReport | null> {
  const supabase = createAdminClient();
  const daysBack = period === 'weekly' ? 7 : 30;
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();
  const now = new Date().toISOString();

  // 1. 总览统计
  const { data: feedbacks } = await supabase
    .from('prompt_feedback')
    .select('rating, framework_used, feedback_tags')
    .gte('created_at', since);

  if (!feedbacks || feedbacks.length === 0) return null;

  const typed = feedbacks as Array<{ rating: number; framework_used: string; feedback_tags: string[] }>;
  const totalFeedback = typed.length;
  const positiveCount = typed.filter((f) => f.rating === 1).length;
  const successRate = positiveCount / totalFeedback;

  // 2. 框架排行
  const frameworkStats = new Map<string, { pos: number; neg: number }>();
  for (const f of typed) {
    const fid = f.framework_used || 'unknown';
    if (!frameworkStats.has(fid)) frameworkStats.set(fid, { pos: 0, neg: 0 });
    const stats = frameworkStats.get(fid)!;
    if (f.rating === 1) stats.pos++;
    else stats.neg++;
  }

  const frameworkList = Array.from(frameworkStats.entries())
    .map(([name, stats]) => ({
      name,
      rate: stats.pos / (stats.pos + stats.neg),
      feedback: stats.pos + stats.neg,
    }))
    .sort((a, b) => b.rate - a.rate);

  const topFrameworks = frameworkList.slice(0, 5);
  const worstFrameworks = frameworkList.slice(-5).reverse();

  // 3. 标签统计
  const tagStats = new Map<string, { pos: number; neg: number }>();
  for (const f of typed) {
    const tags = f.feedback_tags || [];
    for (const tag of tags) {
      if (!tagStats.has(tag)) tagStats.set(tag, { pos: 0, neg: 0 });
      const s = tagStats.get(tag)!;
      if (f.rating === 1) s.pos++;
      else s.neg++;
    }
  }

  const topPositive = Array.from(tagStats.entries())
    .filter(([, s]) => s.pos > s.neg)
    .sort((a, b) => b[1].pos - a[1].pos)
    .slice(0, 5)
    .map(([t]) => t);

  const topNegative = Array.from(tagStats.entries())
    .filter(([, s]) => s.neg > s.pos)
    .sort((a, b) => b[1].neg - a[1].neg)
    .slice(0, 5)
    .map(([t]) => t);

  // 4. 行业统计（从 metrics 表获取）
  const { data: industryData } = await supabase
    .from('prompt_optimization_metrics')
    .select('*')
    .not('industry', 'is', null)
    .gte('updated_at', since);

  const industryBreakdown = (industryData || []).map((r: Record<string, unknown>) => ({
    industry: r.industry as string,
    rate: r.success_rate as number,
    feedback: r.total_feedback as number,
  }));

  // 5. 改进建议
  const suggestions: string[] = [];
  if (worstFrameworks.length > 0) {
    suggestions.push(`优化低表现框架：${worstFrameworks.slice(0, 3).map((f) => f.name).join('、')}`);
  }
  if (topNegative.length > 0) {
    suggestions.push(`关注负面标签：${topNegative.slice(0, 3).join('、')}`);
  }
  if (successRate < 0.6) {
    suggestions.push('整体成功率偏低，建议审查框架选择策略');
  }
  if (totalFeedback < 20) {
    suggestions.push('反馈数据量较少，建议加强反馈收集引导');
  }

  const report: OptimizationReport = {
    id: crypto.randomUUID(),
    period,
    startDate: since,
    endDate: now,
    totalOptimizations: totalFeedback,
    totalFeedback,
    overallSuccessRate: Math.round(successRate * 1000) / 1000,
    topFrameworks,
    worstFrameworks,
    industryBreakdown,
    topPositiveTags: topPositive,
    topNegativeTags: topNegative,
    improvementSuggestions: suggestions,
    generatedAt: now,
  };

  // 6. 持久化
  await supabase.from('prompt_evolution_log').insert({
    event_type: 'report_generate',
    details: report as unknown as Record<string, unknown>,
    summary: `${period === 'weekly' ? '周报' : '月报'}: 成功率 ${(successRate * 100).toFixed(1)}%, ${totalFeedback} 条反馈`,
    triggered_by: 'cron',
  });

  return report;
}
