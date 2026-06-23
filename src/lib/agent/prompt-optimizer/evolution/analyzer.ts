// 反馈分析器 — 从 prompt_feedback + prompt_optimization_metrics 提取洞察

import { createAdminClient } from '@/lib/supabase-server';

export interface FrameworkInsight {
  frameworkId: string;
  frameworkName: string;
  totalFeedback: number;
  positiveRatio: number;
  negativeRatio: number;
  successRate: number;
  commonPositiveTags: string[];
  commonNegativeTags: string[];
  /** 分析时间段起始 */
  since: string;
  /** 分析时间段结束 */
  until: string;
}

export interface IndustryInsight {
  industry: string;
  frameworkCount: number;
  avgSuccessRate: number;
  totalFeedback: number;
  topFramework: string;
}

/**
 * 获取各框架的详细洞察（最近 N 天）
 */
export async function getFrameworkInsights(daysBack = 30): Promise<FrameworkInsight[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();

  const { data: metrics } = await supabase
    .from('prompt_optimization_metrics')
    .select('*')
    .gte('updated_at', since)
    .order('total_feedback', { ascending: false })
    .limit(30);

  if (!metrics || metrics.length === 0) return [];

  const { data: feedbacks } = await supabase
    .from('prompt_feedback')
    .select('framework_used, feedback_tags, rating')
    .gte('created_at', since)
    .not('feedback_tags', 'is', null);

  const tagStats = new Map<string, { pos: string[]; neg: string[] }>();
  if (feedbacks) {
    for (const f of feedbacks as Array<{ framework_used: string; feedback_tags: string[]; rating: number }>) {
      const fid = f.framework_used || 'unknown';
      if (!tagStats.has(fid)) tagStats.set(fid, { pos: [], neg: [] });
      const stats = tagStats.get(fid)!;
      const tags = f.feedback_tags || [];
      if (f.rating === 1) stats.pos.push(...tags);
      else stats.neg.push(...tags);
    }
  }

  return (metrics as Array<Record<string, unknown>>).map((m) => {
    const fid = m.framework_id as string;
    const tags = tagStats.get(fid) || { pos: [], neg: [] };
    return {
      frameworkId: fid,
      frameworkName: (m.framework_name as string) || fid,
      totalFeedback: m.total_feedback as number,
      positiveRatio: (m.positive_feedback as number) / Math.max(m.total_feedback as number, 1),
      negativeRatio: (m.negative_feedback as number) / Math.max(m.total_feedback as number, 1),
      successRate: m.success_rate as number,
      commonPositiveTags: topTags(tags.pos),
      commonNegativeTags: topTags(tags.neg),
      since,
      until: new Date().toISOString(),
    };
  });
}

/**
 * 按行业聚合框架表现
 */
export async function getIndustryInsights(): Promise<IndustryInsight[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('prompt_optimization_metrics')
    .select('*')
    .not('industry', 'is', null);

  if (!data || data.length === 0) return [];

  const industryMap = new Map<string, Array<{ fid: string; rate: number; fb: number }>>();
  for (const r of data as Array<Record<string, unknown>>) {
    const ind = r.industry as string;
    if (!industryMap.has(ind)) industryMap.set(ind, []);
    industryMap.get(ind)!.push({
      fid: r.framework_id as string,
      rate: r.success_rate as number,
      fb: r.total_feedback as number,
    });
  }

  return Array.from(industryMap.entries()).map(([industry, frameworks]) => {
    const totalFb = frameworks.reduce((sum, f) => sum + f.fb, 0);
    const avgRate = frameworks.reduce((sum, f) => sum + f.rate * f.fb, 0) / Math.max(totalFb, 1);
    const top = frameworks.sort((a, b) => b.rate - a.rate)[0];
    return {
      industry,
      frameworkCount: frameworks.length,
      avgSuccessRate: avgRate,
      totalFeedback: totalFb,
      topFramework: top?.fid || 'unknown',
    };
  });
}

function topTags(tags: string[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const t of tags) {
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
}
