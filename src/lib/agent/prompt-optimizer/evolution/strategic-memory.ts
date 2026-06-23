// 战略记忆 — 跨会话学习（复用 user_memories + pgvector 语义检索）
// 从多会话的反馈数据中提炼长期框架偏好，持久化到 user_memories 表

import { createAdminClient } from '@/lib/supabase-server';

const MEMORY_CATEGORY = 'prompt_optimization';
const MEMORY_KEY_PREFIX = 'framework_pref';

interface StrategicPreference {
  frameworkId: string;
  frameworkName: string;
  totalFeedback: number;
  positiveCount: number;
  negativeCount: number;
  lastUsedAt: string;
  /**
   * Bayesian 平滑成功率：
   * (positiveCount + priorAlpha) / (totalFeedback + priorAlpha + priorBeta)
   * 默认 priorAlpha=2, priorBeta=2 → 先验 0.5
   */
  smoothedRate: number;
}

export class StrategicMemory {
  private readonly priorAlpha = 2;
  private readonly priorBeta = 2;

  /** 从 user_memories 表读取用户对某框架的长期偏好 */
  async getPreference(userId: string, frameworkId: string): Promise<StrategicPreference | null> {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('user_memories')
      .select('value')
      .eq('user_id', userId)
      .eq('category', MEMORY_CATEGORY)
      .eq('key', `${MEMORY_KEY_PREFIX}:${frameworkId}`)
      .maybeSingle();

    if (!data) return null;
    try {
      const pref = JSON.parse((data as { value: string }).value) as StrategicPreference;
      pref.smoothedRate = this.calcSmoothedRate(pref.positiveCount, pref.negativeCount);
      return pref;
    } catch {
      return null;
    }
  }

  /** 获取用户所有框架偏好（用于优化器加权） */
  async getAllPreferences(userId: string): Promise<Map<string, StrategicPreference>> {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('user_memories')
      .select('key, value')
      .eq('user_id', userId)
      .eq('category', MEMORY_CATEGORY)
      .like('key', `${MEMORY_KEY_PREFIX}:%`);

    const prefs = new Map<string, StrategicPreference>();
    if (!data) return prefs;

    for (const row of data as Array<{ key: string; value: string }>) {
      try {
        const pref = JSON.parse(row.value) as StrategicPreference;
        pref.smoothedRate = this.calcSmoothedRate(pref.positiveCount, pref.negativeCount);
        prefs.set(pref.frameworkId, pref);
      } catch { /* skip corrupt entries */ }
    }
    return prefs;
  }

  /** 根据反馈更新/创建用户框架偏好 */
  async recordFeedback(
    userId: string,
    frameworkId: string,
    frameworkName: string,
    rating: 1 | -1,
  ): Promise<void> {
    const supabase = createAdminClient();
    const existing = await this.getPreference(userId, frameworkId);

    const pref: StrategicPreference = existing
      ? {
          frameworkId,
          frameworkName,
          totalFeedback: existing.totalFeedback + 1,
          positiveCount: existing.positiveCount + (rating === 1 ? 1 : 0),
          negativeCount: existing.negativeCount + (rating === -1 ? 1 : 0),
          lastUsedAt: new Date().toISOString(),
          smoothedRate: 0, // 会在 getPreference 重新计算
        }
      : {
          frameworkId,
          frameworkName,
          totalFeedback: 1,
          positiveCount: rating === 1 ? 1 : 0,
          negativeCount: rating === -1 ? 1 : 0,
          lastUsedAt: new Date().toISOString(),
          smoothedRate: 0,
        };

    pref.smoothedRate = this.calcSmoothedRate(pref.positiveCount, pref.negativeCount);

    const key = `${MEMORY_KEY_PREFIX}:${frameworkId}`;
    const value = JSON.stringify(pref);

    await supabase.from('user_memories').upsert(
      {
        user_id: userId,
        category: MEMORY_CATEGORY,
        key,
        value,
        importance: Math.min(10, 3 + pref.totalFeedback),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,category,key' },
    );
  }

  /** 获取用户最偏好的框架 ID（平滑成功率最高） */
  async getTopFramework(userId: string): Promise<string | null> {
    const prefs = await this.getAllPreferences(userId);
    if (prefs.size === 0) return null;

    let best: string | null = null;
    let bestRate = -1;
    for (const [fid, pref] of prefs) {
      if (pref.totalFeedback >= 3 && pref.smoothedRate > bestRate) {
        bestRate = pref.smoothedRate;
        best = fid;
      }
    }
    return best;
  }

  private calcSmoothedRate(positives: number, negatives: number): number {
    return (positives + this.priorAlpha) / (positives + negatives + this.priorAlpha + this.priorBeta);
  }
}

export const strategicMemory = new StrategicMemory();
