// 用量记录辅助函数
// 统一封装 usage_records 表的读写，避免每个调用方重复拼 SQL

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
    monthlyUploads: 0, // 简化：v1 不持久化月计数，由 quota 检查在内存中维护
  };
}

export async function addStorageUsage(userId: string, bytes: number): Promise<void> {
  const supabase = createAdminClient();
  const month = currentMonth();
  const additionalMB = bytes / 1024 / 1024;

  // 1) 确保当月记录存在
  await supabase
    .from('usage_records')
    .upsert(
      { user_id: userId, month, storage_used_mb: 0 },
      { onConflict: 'user_id,month', ignoreDuplicates: true }
    );

  // 2) 累加（用 SQL 表达式避免读-改-写竞态）
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
    .eq('month', month);
}

export async function subtractStorageUsage(userId: string, bytes: number): Promise<void> {
  const supabase = createAdminClient();
  const month = currentMonth();
  const subMB = bytes / 1024 / 1024;

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
    .eq('month', month);
}
