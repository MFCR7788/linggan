// 诊断端点: 模拟 /api/credits 的完整调用链（需要 ?secret=xxx 防滥用）
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getBalance, getTransactions, getPackages, getTiers } from '@/lib/credits';
import { getDebugSecret, getSupabaseServiceRoleKey } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 生产环境完全禁用 debug 端点
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const debugSecret = getDebugSecret();
  if (!debugSecret) {
    return NextResponse.json({ error: 'Debug 端点未配置' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const userId = searchParams.get('userId') || '4bd17fdf-dfe9-4a15-8e3f-9f3a70be74a6';

  if (secret !== debugSecret) {
    return NextResponse.json({ error: '需要有效 secret 参数' }, { status: 401 });
  }

  const result: Record<string, unknown> = {};

  // 1. 环境
  result.env = {
    hasServiceRoleKey: !!getSupabaseServiceRoleKey(),
    hasAnonKey: !!process.env.SUPABASE_ANON_KEY,
    nodeEnv: process.env.NODE_ENV,
    cwd: process.cwd(),
  };

  // 2. 模拟 getBalance
  try {
    const balance = await getBalance(userId);
    result.getBalance = { success: true, data: balance };
  } catch (e: any) {
    result.getBalance = { success: false, error: e?.message || String(e), stack: e?.stack };
  }

  // 3. 模拟 getTransactions
  try {
    const txs = await getTransactions(userId, 10);
    result.getTransactions = { success: true, count: txs.length, sample: txs.slice(0, 3) };
  } catch (e: any) {
    result.getTransactions = { success: false, error: e?.message || String(e) };
  }

  // 4. 模拟 getPackages
  try {
    const packages = await getPackages();
    result.getPackages = { success: true, count: packages.length, data: packages };
  } catch (e: any) {
    result.getPackages = { success: false, error: e?.message || String(e) };
  }

  // 5. 模拟 getTiers
  try {
    const tiers = await getTiers();
    result.getTiers = { success: true, count: tiers.length, data: tiers };
  } catch (e: any) {
    result.getTiers = { success: false, error: e?.message || String(e) };
  }

  return NextResponse.json(result);
}
