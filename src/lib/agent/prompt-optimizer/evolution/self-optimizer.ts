// 自我优化编排器 — 每日定时运行，调整权重 + 更新关键词 + 生成报告

import { weightAdjuster } from './weight-adjuster';
import { updateTriggerKeywords } from './keyword-updater';
import { generateReport } from './report-generator';
import { createAdminClient } from '@/lib/supabase-server';

export interface SelfOptimizeResult {
  success: boolean;
  weightAdjustment?: { adjustments: number; log: string };
  keywordUpdate?: { updates: number; log: string };
  report?: { period: string; successRate: number; feedback: number };
  errors: string[];
  durationMs: number;
}

/**
 * 每日自我优化主流程
 * 1. 调整框架权重（Bayesian 平滑）
 * 2. 更新技能触发关键词（高频词提取）
 * 3. 生成周报（仅周一）
 */
export async function runSelfOptimization(): Promise<SelfOptimizeResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const supabase = createAdminClient();

  // 记录开始
  await supabase.from('prompt_evolution_log').insert({
    event_type: 'self_optimize_start',
    details: { timestamp: new Date().toISOString() },
    summary: '开始每日自我优化',
    triggered_by: 'cron',
  });

  const result: SelfOptimizeResult = {
    success: true,
    errors: [],
    durationMs: 0,
  };

  // Step 1: 权重调整
  try {
    const wResult = await weightAdjuster.adjustAll();
    result.weightAdjustment = {
      adjustments: wResult.adjustments.length,
      log: wResult.log,
    };
  } catch (e) {
    errors.push(`权重调整失败: ${(e as Error).message}`);
  }

  // Step 2: 关键词更新
  try {
    const kResult = await updateTriggerKeywords();
    result.keywordUpdate = {
      updates: kResult.updates.length,
      log: kResult.log,
    };
  } catch (e) {
    errors.push(`关键词更新失败: ${(e as Error).message}`);
  }

  // Step 3: 周报（仅周一）
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 1) {
    try {
      const report = await generateReport('weekly');
      if (report) {
        result.report = {
          period: 'weekly',
          successRate: report.overallSuccessRate,
          feedback: report.totalFeedback,
        };
      }
    } catch (e) {
      errors.push(`周报生成失败: ${(e as Error).message}`);
    }
  }

  result.success = errors.length === 0;
  result.errors = errors;
  result.durationMs = Date.now() - startedAt;

  // 记录结束
  await supabase.from('prompt_evolution_log').insert({
    event_type: 'self_optimize_end',
    details: result as unknown as Record<string, unknown>,
    summary: `自我优化完成: 权重${result.weightAdjustment?.adjustments ?? 0}个, 关键词${result.keywordUpdate?.updates ?? 0}个, 耗时${result.durationMs}ms`,
    triggered_by: 'cron',
  });

  return result;
}
