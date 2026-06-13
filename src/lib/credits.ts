// Credit 计费系统核心 lib
// 关键设计:
// 1. 原子扣点(CAS 模式): 一次 SQL 同时校验余额 + 扣减,避免并发漏洞
// 2. 流水优先: balance_after 字段记录每次变动的最终值,审计/对账
// 3. 余额不足返特定错误类型,前端可触发 402 + 引导加油包
//
// 用法:
//   const balance = await getBalance(userId)
//   await consume(userId, 100, 'ai_video', '生成 1 条 10s standard 视频')
//   await grant(userId, 500, 'package_purchase', 'admin', '充值标准包', { packageId: 'standard' })

import { createAdminClient } from './supabase-server';
import type { Database } from '@/types/supabase';

export type CreditTier = 'free' | 'basic' | 'pro' | 'studio' | 'enterprise';
export type TransactionType =
  | 'subscription_grant'
  | 'package_purchase'
  | 'consume'
  | 'refund'
  | 'admin_adjust'
  | 'reset'
  | 'bonus_first_purchase';

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: TransactionType;
  balance_after: number;
  source: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  bonus_credits: number;
  price_cny: number;
  original_price_cny: number | null;
  validity_days: number;
  is_active: boolean;
  sort_order: number;
  badge: string | null;
}

export interface SubscriptionTier {
  tier: CreditTier;
  name: string;
  monthly_price_cny: number;
  monthly_credits: number;
  description: string | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

export class InsufficientCreditsError extends Error {
  constructor(public required: number, public available: number) {
    super(`余额不足:需要 ${required} 灵力，当前余额 ${available}`);
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * 查用户余额(若记录不存在则 lazy init,默认 free + 0 credits)
 */
export async function getBalance(userId: string): Promise<{ balance: number; tier: CreditTier; lifetimeConsumed: number; lifetimePurchased: number }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('user_credits')
    .select('balance, tier, lifetime_consumed, lifetime_purchased')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    return {
      balance: data.balance,
      tier: data.tier as CreditTier,
      lifetimeConsumed: data.lifetime_consumed,
      lifetimePurchased: data.lifetime_purchased,
    };
  }

  // Lazy init
  await supabase.from('user_credits').upsert({ user_id: userId, balance: 0, tier: 'free', lifetime_consumed: 0, lifetime_purchased: 0 }, { onConflict: 'user_id', ignoreDuplicates: true });
  return { balance: 0, tier: 'free', lifetimeConsumed: 0, lifetimePurchased: 0 };
}

/**
 * 扣点(原子操作)
 * @throws InsufficientCreditsError 余额不足
 */
export async function consume(
  userId: string,
  amount: number,
  source: string,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<{ balanceAfter: number }> {
  if (amount <= 0) throw new Error('amount 必须为正数');
  if (amount > 100000) throw new Error('amount 超上限(单次扣点不超过 10 万)');

  const supabase = createAdminClient();

  // 原子 RPC 扣减（移除前置余额查询，避免 TOCTOU 误判）
  const { data: updated, error: updateError } = await supabase
    .rpc('consume_credits_atomic', {
      p_user_id: userId,
      p_amount: amount,
    })
    .single();

  // RPC 不存在 → 降级到客户端两步
  if (updateError && /function.*consume_credits_atomic.*does not exist/i.test(updateError.message)) {
    console.warn('[credits] RPC consume_credits_atomic 不存在，使用降级方案。请执行 SQL 迁移创建该函数。');
    return await consumeCreditsFallback(userId, amount, source, description, metadata);
  }
  if (updateError) {
    // RPC 可能返回余额不足错误
    if (/INSUFFICIENT_CREDITS/i.test(updateError.message)) {
      const before = await getBalance(userId);
      throw new InsufficientCreditsError(amount, before.balance);
    }
    throw updateError;
  }

  const balanceAfter = (updated as { balance_after?: number } | null)?.balance_after;
  if (balanceAfter === undefined || balanceAfter === null) {
    throw new Error('RPC consume_credits_atomic 未返回 balance_after');
  }

  // 写流水（异步发起，不阻塞主流程；失败不影响扣点结果）
  supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type: 'consume',
    balance_after: balanceAfter,
    source,
    description,
    metadata,
  }).then(({ error }) => {
    if (error) console.error('[credits] 流水写入失败:', error.message);
  });

  return { balanceAfter };
}

/**
 * 降级方案:两步扣点(可能并发漏洞,仅作 RPC 不存在时的兜底)
 * 强烈建议执行一次 SQL 加 RPC:
 *   CREATE OR REPLACE FUNCTION consume_credits_atomic(p_user_id UUID, p_amount INT)
 *   RETURNS TABLE(balance_after INT) AS $$
 *   BEGIN
 *     UPDATE user_credits
 *     SET balance = balance - p_amount,
 *         lifetime_consumed = lifetime_consumed + p_amount,
 *         updated_at = NOW()
 *     WHERE user_id = p_user_id AND balance >= p_amount
 *     RETURNING balance INTO balance_after;
 *     IF NOT FOUND THEN
 *       RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
 *     END IF;
 *     RETURN NEXT;
 *   END;
 *   $$ LANGUAGE plpgsql;
 */
async function consumeCreditsFallback(
  userId: string,
  amount: number,
  source: string,
  description: string,
  metadata: Record<string, unknown>
): Promise<{ balanceAfter: number }> {
  const supabase = createAdminClient();

  // 二次校验余额(防 TOCTOU)
  const before = await getBalance(userId);
  if (before.balance < amount) {
    throw new InsufficientCreditsError(amount, before.balance);
  }

  const { data, error } = await supabase
    .from('user_credits')
    .update({
      balance: before.balance - amount,
      lifetime_consumed: before.lifetimeConsumed + amount,
    })
    .eq('user_id', userId)
    .eq('balance', before.balance) // 守卫:仅当余额未变才更新
    .select('balance')
    .single();

  if (error || !data) {
    // 并发扣点失败,重试一次
    const retry = await getBalance(userId);
    if (retry.balance < amount) {
      throw new InsufficientCreditsError(amount, retry.balance);
    }
    throw new Error('扣点失败(并发),请重试');
  }

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type: 'consume',
    balance_after: data.balance,
    source,
    description,
    metadata,
  });

  return { balanceAfter: data.balance };
}

/**
 * 加点(加油包 / 订阅赠送 / 退款 / 管理员调整)
 */
export async function grant(
  userId: string,
  amount: number,
  type: TransactionType,
  source: string,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<{ balanceAfter: number }> {
  if (amount <= 0) throw new Error('amount 必须为正数');

  const supabase = createAdminClient();

  // 原子 RPC: 一条 SQL 完成读-改-写，避免 TOCTOU 竞态
  const { data: updated, error: rpcErr } = await supabase
    .rpc('grant_credits_atomic', {
      p_user_id: userId,
      p_amount: amount,
      p_is_purchase: true,
    })
    .single();

  if (rpcErr) {
    return await grantCreditsFallback(userId, amount, type, source, description, metadata);
  }

  const balanceAfter = (updated as { balance_after?: number } | null)?.balance_after ?? amount;

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount,
    type,
    balance_after: balanceAfter,
    source,
    description,
    metadata,
  });

  return { balanceAfter };
}

async function grantCreditsFallback(
  userId: string,
  amount: number,
  type: TransactionType,
  source: string,
  description: string,
  metadata: Record<string, unknown>
): Promise<{ balanceAfter: number }> {
  const supabase = createAdminClient();
  const before = await getBalance(userId);

  const { data, error } = await supabase
    .from('user_credits')
    .update({
      balance: before.balance + amount,
      lifetime_purchased: before.lifetimePurchased + amount,
    })
    .eq('user_id', userId)
    .eq('balance', before.balance)
    .select('balance')
    .single();

  if (error || !data) {
    await supabase.from('user_credits').upsert(
      { user_id: userId, balance: amount, lifetime_purchased: amount, tier: 'free' },
      { onConflict: 'user_id' }
    );
    const retry = await getBalance(userId);
    await supabase.from('credit_transactions').insert({
      user_id: userId, amount, type, balance_after: retry.balance, source, description, metadata,
    });
    return { balanceAfter: retry.balance };
  }

  await supabase.from('credit_transactions').insert({
    user_id: userId, amount, type, balance_after: data.balance, source, description, metadata,
  });
  return { balanceAfter: data.balance };
}

/**
 * 退款(把已扣的 credits 加回余额,不更新 lifetime_purchased)
 *
 * 用法: AI 调用失败时退点
 *   await refund(userId, cost, 'ai_video', 'AI 视频生成失败', { taskId, errorMsg });
 *
 * 与 grant 的区别:
 *   - 不更新 lifetime_purchased(退款不是充值)
 *   - 写 type='refund' 流水,审计/对账清晰
 *   - 不允许金额过大(单次退款上限 10000 credits,防止 bug 导致余额爆炸)
 */
export async function refund(
  userId: string,
  amount: number,
  source: string,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<{ balanceAfter: number }> {
  if (amount <= 0) throw new Error('refund amount 必须为正数');
  if (amount > 10000) throw new Error('单次退款超过 10000 credits 上限');

  const supabase = createAdminClient();

  // 原子 RPC: 避免读-改-写竞态
  const { data: updated, error: rpcErr } = await supabase
    .rpc('grant_credits_atomic', {
      p_user_id: userId,
      p_amount: amount,
      p_is_purchase: false,
    })
    .single();

  if (rpcErr) {
    // 降级：两步操作 + CAS 守卫
    const before = await getBalance(userId);
    const { data, error } = await supabase
      .from('user_credits')
      .update({
        balance: before.balance + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('balance', before.balance)
      .select('balance')
      .single();

    if (error || !data) {
      throw new Error('退款失败:用户记录不存在或并发冲突');
    }

    await supabase.from('credit_transactions').insert({
      user_id: userId, amount, type: 'refund', balance_after: data.balance, source, description, metadata,
    });
    return { balanceAfter: data.balance };
  }

  const balanceAfter = (updated as { balance_after?: number } | null)?.balance_after ?? amount;

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount,
    type: 'refund',
    balance_after: balanceAfter,
    source,
    description,
    metadata,
  });

  return { balanceAfter };
}

/**
 * 检查某个 taskId 是否已经退过款(避免异步任务状态轮询时重复退)
 * 通过 credit_transactions 表的 metadata->>taskId 查询
 *
 * @returns true = 已退过, false = 没退过
 */
export async function hasRefunded(
  userId: string,
  taskId: string
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'refund')
    .eq('metadata->>taskId', taskId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * 查最近 N 条流水
 */
export async function getTransactions(userId: string, limit = 50): Promise<CreditTransaction[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as CreditTransaction[];
}

/**
 * 查加油包目录(只返 is_active=true)
 */
export async function getPackages(): Promise<CreditPackage[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('credit_packages')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as CreditPackage[];
}

/**
 * 查订阅档位
 */
export async function getTiers(): Promise<SubscriptionTier[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('subscription_tiers')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []).map((t) => ({
    ...t as Record<string, unknown>,
    features: Array.isArray((t as Record<string, unknown>).features) ? (t as Record<string, unknown>).features as string[] : [],
  })) as SubscriptionTier[];
}

/**
 * 月底清零订阅赠送的 credits（由 cron 调用）
 *
 * 安全规则：
 * - 订阅到期时仅降级 tier → 'free'，清零 tier_expires_at
 * - 不触及 balance：加油包余额（6-12 个月有效）不清零
 * - 按订阅档位扣除本月赠送额度，保留用户自购点数
 *
 * TODO: 实现 ledger 区分「订阅余额」vs「加油包余额」，只扣减订阅赠送未消耗部分
 */
export async function resetMonthlyCredits(): Promise<{ processed: number; totalReset: number }> {
  const supabase = createAdminClient();

  // 订阅档位月赠点数额度映射
  const TIER_MONTHLY_CREDITS: Record<string, number> = {
    free: 0,
    basic: 100,
    pro: 500,
    studio: 2000,
    enterprise: 10000,
  };

  // 找所有订阅到期的用户（tier_expires_at <= now）
  const { data: expiringUsers, error } = await supabase
    .from('user_credits')
    .select('user_id, balance, tier')
    .not('tier_expires_at', 'is', null)
    .lte('tier_expires_at', new Date().toISOString());

  if (error) throw error;
  if (!expiringUsers || expiringUsers.length === 0) {
    return { processed: 0, totalReset: 0 };
  }

  let totalReset = 0;
  for (const u of expiringUsers) {
    const monthlyGrant = TIER_MONTHLY_CREDITS[u.tier] || 0;
    // 安全上限：最多扣除本月赠送额度，不低于当前余额，保留用户自购点数
    const deductAmount = Math.min(monthlyGrant, u.balance);

    if (deductAmount > 0) {
      const newBalance = u.balance - deductAmount;

      // 写清零流水
      await supabase.from('credit_transactions').insert({
        user_id: u.user_id,
        amount: -deductAmount,
        type: 'reset',
        balance_after: newBalance,
        source: 'cron',
        description: `订阅到期(${u.tier})，扣除本月赠送额度 ${deductAmount}，保留余额 ${newBalance}`,
        metadata: { tier: u.tier, previousBalance: u.balance, deductedAmount: deductAmount },
      });

      // 更新余额和过期时间
      await supabase.from('user_credits').update({
        balance: newBalance,
        tier: 'free',
        last_reset_at: new Date().toISOString(),
        tier_expires_at: null,
      }).eq('user_id', u.user_id);
    } else {
      // 无赠送额度可扣，仅降级 tier
      await supabase.from('user_credits').update({
        tier: 'free',
        last_reset_at: new Date().toISOString(),
        tier_expires_at: null,
      }).eq('user_id', u.user_id);
    }

    totalReset += deductAmount;
  }

  return { processed: expiringUsers.length, totalReset };
}
