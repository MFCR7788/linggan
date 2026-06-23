// Tier-based feature limits
// Free/Basic 不能使用某些功能或档位，Pro/Studio/Enterprise 有月度次数限制

import type { CreditTier } from '@/lib/credits';
import { createAdminClient } from '@/lib/supabase-server';

// ─── 视频档位 ──────────────────────────────────────────

export type VideoQuality = 'fast' | 'standard' | 'premium';

const TIER_VIDEO_QUALITIES: Record<CreditTier, VideoQuality[]> = {
  free: ['fast'],
  basic: ['fast', 'standard'],
  pro: ['fast', 'standard', 'premium'],
  studio: ['fast', 'standard', 'premium'],
  enterprise: ['fast', 'standard', 'premium'],
};

// ─── 月度次数限制 ──────────────────────────────────────

interface TierMonthlyLimits {
  voiceClone: number;       // 声音复刻
  digitalAvatar: number;    // 数字分身训练
  animate: boolean;         // Animate 角色动作迁移
}

const TIER_MONTHLY_LIMITS: Record<CreditTier, TierMonthlyLimits> = {
  free:    { voiceClone: 0, digitalAvatar: 0,  animate: false },
  basic:   { voiceClone: 0, digitalAvatar: 0,  animate: false },
  pro:     { voiceClone: 1, digitalAvatar: 3,  animate: true },
  studio:  { voiceClone: 2, digitalAvatar: 5,  animate: true },
  enterprise: { voiceClone: 5, digitalAvatar: 10, animate: true },
};

const TIER_NAMES: Record<string, string> = {
  free: '免费版', basic: '个人版', pro: '创作者版', studio: '工作室版', enterprise: '企业版',
};

// ─── 公开 API ─────────────────────────────────────────

/** 检查用户 tier 是否允许指定视频档位 */
export function checkVideoQuality(tier: CreditTier, quality: VideoQuality): { allowed: boolean; message?: string } {
  const allowed = TIER_VIDEO_QUALITIES[tier] || ['fast'];
  if (!allowed.includes(quality)) {
    const tierName = TIER_NAMES[tier] || '当前套餐';
    const maxLabel = allowed.includes('premium') ? 'premium' : allowed.includes('standard') ? 'standard' : 'fast';
    return {
      allowed: false,
      message: `${tierName}仅支持 ${maxLabel} 及以下档位，请升级套餐使用 ${quality} 档`,
    };
  }
  return { allowed: true };
}

/** 获取当前 tier 允许的最高视频档位 */
export function getMaxVideoQuality(tier: CreditTier): VideoQuality {
  const allowed = TIER_VIDEO_QUALITIES[tier] || ['fast'];
  if (allowed.includes('premium')) return 'premium';
  if (allowed.includes('standard')) return 'standard';
  return 'fast';
}

/** 查询本月已使用次数（从 credit_transactions 按 source 统计） */
async function countMonthlyUsage(userId: string, source: string): Promise<number> {
  const supabase = createAdminClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const { count, error } = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', source)
    .gte('created_at', startOfMonth)
    .lt('created_at', endOfMonth);

  if (error) {
    console.warn('[tier-limits] countMonthlyUsage error:', error.message);
    return 0;
  }
  return count ?? 0;
}

/** 检查月度限制并返回是否允许 */
export async function checkMonthlyLimit(
  userId: string,
  tier: CreditTier,
  type: 'voiceClone' | 'digitalAvatar'
): Promise<{ allowed: boolean; message?: string; current: number; max: number }> {
  const limits = TIER_MONTHLY_LIMITS[tier] ?? TIER_MONTHLY_LIMITS.free;
  const max = limits[type] as number;
  if (max === Infinity) return { allowed: true, current: 0, max: Infinity };

  const source = type === 'voiceClone' ? 'ai_voice_clone' : 'ai_digital_twin';
  const current = await countMonthlyUsage(userId, source);

  if (current >= max) {
    const tierName = TIER_NAMES[tier] || '当前套餐';
    const label = type === 'voiceClone' ? '声音复刻' : '数字分身训练';
    return {
      allowed: false,
      current,
      max,
      message: `${tierName}每月${label}限 ${max} 次（本月已用 ${current} 次）。请升级套餐或等待下月重置`,
    };
  }

  return { allowed: true, current, max };
}

/** 检查 Animate 功能是否可用 */
export function checkAnimateEnabled(tier: CreditTier): { allowed: boolean; message?: string } {
  const limits = TIER_MONTHLY_LIMITS[tier] ?? TIER_MONTHLY_LIMITS.free;
  if (!limits.animate) {
    const tierName = TIER_NAMES[tier] || '当前套餐';
    return {
      allowed: false,
      message: `Animate（角色动作迁移）需要创作者版及以上套餐，${tierName}暂不可用。请升级套餐`,
    };
  }
  return { allowed: true };
}
