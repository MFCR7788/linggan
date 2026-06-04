// 用量记录辅助函数
// 统一封装 usage_records 表的读写，避免每个调用方重复拼 SQL
// 所有写操作使用原子 SQL (SET x = x + $1)，消除读-改-写竞态

import { createAdminClient } from '@/lib/supabase-server';
import type { UserPlan } from '@/types';

export interface UsageSnapshot {
  plan: UserPlan;
  storageUsedMB: number;
  monthlyUploads: number;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export async function getUserPlan(userId: string): Promise<UserPlan> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('users')
    .select('plan')
    .eq('id', userId)
    .maybeSingle();
  const plan = (data as { plan?: string } | null)?.plan;
  if (plan === 'pro' || plan === 'creator') return plan;
  return 'free';
}

export async function getUsage(userId: string): Promise<UsageSnapshot> {
  const supabase = createAdminClient();
  const [planRes, usageRes] = await Promise.all([
    supabase.from('users').select('plan').eq('id', userId).maybeSingle(),
    supabase
      .from('usage_records')
      .select('storage_used_mb')
      .eq('user_id', userId)
      .eq('month', currentMonth())
      .maybeSingle(),
  ]);

  const plan = (planRes.data as { plan?: string } | null)?.plan;
  const storageUsedMB = Number((usageRes.data as { storage_used_mb?: number } | null)?.storage_used_mb || 0);

  return {
    plan: plan === 'pro' || plan === 'creator' ? plan : 'free',
    storageUsedMB,
    monthlyUploads: 0,
  };
}

export async function addStorageUsage(userId: string, bytes: number): Promise<void> {
  const supabase = createAdminClient();
  const month = currentMonth();
  const additionalMB = bytes / 1024 / 1024;

  // 原子操作：使用 raw SQL 避免读-改-写竞态
  // 先确保记录存在（upsert），然后原子累加
  const { error: upsertErr } = await supabase
    .from('usage_records')
    .upsert(
      { user_id: userId, month, storage_used_mb: 0 },
      { onConflict: 'user_id,month', ignoreDuplicates: true }
    );

  if (upsertErr) {
    console.error('[usage] upsert 失败:', upsertErr.message);
    return;
  }

  // 原子累加：SET storage_used_mb = storage_used_mb + $1
  const { error } = await supabase.rpc('add_storage_usage_atomic', {
    p_user_id: userId,
    p_month: month,
    p_mb: additionalMB,
  });

  if (error) {
    // RPC 不存在时降级：两步操作 + CAS 守卫
    const { data } = await supabase
      .from('usage_records')
      .select('storage_used_mb')
      .eq('user_id', userId)
      .eq('month', month)
      .maybeSingle();

    const currentMB = Number((data as { storage_used_mb?: number } | null)?.storage_used_mb || 0);
    const newMB = Math.max(0, currentMB + additionalMB);

    await supabase
      .from('usage_records')
      .update({ storage_used_mb: newMB, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('month', month)
      .eq('storage_used_mb', currentMB); // CAS guard
  }
}

export async function subtractStorageUsage(userId: string, bytes: number): Promise<void> {
  const supabase = createAdminClient();
  const month = currentMonth();
  const subMB = bytes / 1024 / 1024;

  // 原子减法
  const { error } = await supabase.rpc('add_storage_usage_atomic', {
    p_user_id: userId,
    p_month: month,
    p_mb: -subMB,
  });

  if (error) {
    // 降级
    const { data } = await supabase
      .from('usage_records')
      .select('storage_used_mb')
      .eq('user_id', userId)
      .eq('month', month)
      .maybeSingle();

    if (!data) return;
    const currentMB = Number((data as { storage_used_mb?: number }).storage_used_mb || 0);
    const newMB = Math.max(0, currentMB - subMB);

    await supabase
      .from('usage_records')
      .update({ storage_used_mb: newMB, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('month', month)
      .eq('storage_used_mb', currentMB); // CAS guard
  }
}
