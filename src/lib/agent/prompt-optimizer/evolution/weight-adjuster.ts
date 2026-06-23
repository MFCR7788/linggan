// 权重调整器 — Bayesian 平滑成功率 + 动态权重更新
// 每日运行，根据 prompt_optimization_metrics 调整 frameworks 的 weight

import { createAdminClient } from '@/lib/supabase-server';
import { ALL_FRAMEWORKS } from '../frameworks';
import type { PromptFramework } from '../types';

interface AdjustmentResult {
  frameworkId: string;
  frameworkName: string;
  oldWeight: number;
  newWeight: number;
  successRate: number;
  totalFeedback: number;
  changeReason: string;
}

const MIN_FEEDBACK_FOR_ADJUST = 5;
const MAX_WEIGHT_CHANGE = 0.2;
const DEFAULT_WEIGHT = 0.5;

export class WeightAdjuster {
  private priorAlpha = 2;
  private priorBeta = 2;

  /**
   * 调整所有框架的权重
   * 算法：Bayesian 平滑成功率 + 渐进更新
   * newWeight = oldWeight + clamp((smoothedRate - 0.5) * rate, -MAX, +MAX)
   */
  async adjustAll(): Promise<{
    adjustments: AdjustmentResult[];
    log: string;
  }> {
    const supabase = createAdminClient();

    // 1. 获取所有指标
    const { data: metrics } = await supabase
      .from('prompt_optimization_metrics')
      .select('*')
      .is('industry', null)
      .is('task_type', null);

    const metricMap = new Map<string, { pos: number; neg: number; total: number; rate: number }>();
    if (metrics) {
      for (const m of metrics as Array<Record<string, unknown>>) {
        metricMap.set(m.framework_id as string, {
          pos: m.positive_feedback as number,
          neg: m.negative_feedback as number,
          total: m.total_feedback as number,
          rate: m.success_rate as number,
        });
      }
    }

    // 2. 计算新权重
    const adjustments: AdjustmentResult[] = [];

    for (const fw of ALL_FRAMEWORKS) {
      const metric = metricMap.get(fw.id);
      const oldWeight = fw.weight;

      if (!metric || metric.total < MIN_FEEDBACK_FOR_ADJUST) {
        // 数据不足 → 向默认值回归
        const newWeight = oldWeight + (DEFAULT_WEIGHT - oldWeight) * 0.1;
        if (Math.abs(newWeight - oldWeight) > 0.001) {
          fw.weight = newWeight;
          adjustments.push({
            frameworkId: fw.id,
            frameworkName: fw.name,
            oldWeight,
            newWeight: Math.round(newWeight * 1000) / 1000,
            successRate: metric?.rate ?? 0.5,
            totalFeedback: metric?.total ?? 0,
            changeReason: `数据不足(${metric?.total ?? 0}条)，回归默认值`,
          });
        }
        continue;
      }

      // Bayesian 平滑成功率
      const total = metric.pos + metric.neg;
      const smoothedRate = (metric.pos + this.priorAlpha) / (total + this.priorAlpha + this.priorBeta);

      // 渐进更新：朝平滑成功率方向调整
      const targetWeight = 0.3 + smoothedRate * 0.4; // 映射到 [0.3, 0.7]
      const delta = targetWeight - oldWeight;
      const clampedDelta = Math.max(-MAX_WEIGHT_CHANGE, Math.min(MAX_WEIGHT_CHANGE, delta));
      const newWeight = Math.max(0.1, Math.min(1.0, oldWeight + clampedDelta));

      fw.weight = Math.round(newWeight * 1000) / 1000;

      adjustments.push({
        frameworkId: fw.id,
        frameworkName: fw.name,
        oldWeight,
        newWeight: fw.weight,
        successRate: Math.round(smoothedRate * 1000) / 1000,
        totalFeedback: metric.total,
        changeReason: smoothedRate > 0.6 ? '表现优秀，提高权重'
          : smoothedRate < 0.4 ? '表现欠佳，降低权重'
          : '表现稳定，微调权重',
      });
    }

    // 3. 持久化到指标表 + 记录日志
    if (adjustments.length > 0) {
      const now = new Date().toISOString();
      for (const adj of adjustments) {
        await supabase.from('prompt_optimization_metrics').upsert(
          {
            framework_id: adj.frameworkId,
            framework_name: adj.frameworkName,
            success_rate: adj.successRate,
            total_feedback: adj.totalFeedback,
            updated_at: now,
          },
          { onConflict: 'framework_id,industry,task_type' },
        );
      }

      await supabase.from('prompt_evolution_log').insert({
        event_type: 'weight_adjust',
        details: { adjustments: adjustments.map((a) => ({
          fid: a.frameworkId,
          oldW: a.oldWeight,
          newW: a.newWeight,
          rate: a.successRate,
        })) },
        affected_frameworks: adjustments.map((a) => a.frameworkId),
        summary: `调整了 ${adjustments.length} 个框架权重`,
        triggered_by: 'cron',
      });
    }

    return {
      adjustments,
      log: adjustments.length > 0
        ? `调整了 ${adjustments.length} 个框架权重：\n` + adjustments
            .filter((a) => Math.abs(a.newWeight - a.oldWeight) > 0.01)
            .map((a) => `  ${a.frameworkName}: ${a.oldWeight.toFixed(3)} → ${a.newWeight.toFixed(3)} (${a.changeReason})`)
            .join('\n')
        : '无需调整（所有框架数据充足且表现稳定）',
    };
  }
}

export const weightAdjuster = new WeightAdjuster();
