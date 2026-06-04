// 诊断端点: 检查 Credit 系统配置状态
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasAnonKey = !!process.env.SUPABASE_ANON_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';

  // 测试 user_credits 表
  let dbAccess = 'unknown';
  let dbError = '';
  let userCreditsCount: number | null = null;

  // 测试 credit_transactions 表
  let txAccess = 'unknown';
  let txError = '';
  let txCount: number | null = null;

  // 测试 credit_packages 表
  let pkgAccess = 'unknown';
  let pkgError = '';
  let pkgCount: number | null = null;

  // 测试 subscription_tiers 表
  let tierAccess = 'unknown';
  let tierError = '';
  let tierCount: number | null = null;

  if (hasServiceRoleKey) {
    const supabase = createAdminClient();

    try {
      const { error, count } = await supabase
        .from('user_credits')
        .select('*', { count: 'exact', head: true });
      if (error) { dbAccess = 'error'; dbError = error.message; }
      else { dbAccess = 'ok'; userCreditsCount = count; }
    } catch (e: any) { dbAccess = 'exception'; dbError = e?.message || 'unknown'; }

    try {
      const { error, count } = await supabase
        .from('credit_transactions')
        .select('*', { count: 'exact', head: true });
      if (error) { txAccess = 'error'; txError = error.message; }
      else { txAccess = 'ok'; txCount = count; }
    } catch (e: any) { txAccess = 'exception'; txError = e?.message || 'unknown'; }

    try {
      const { error, count } = await supabase
        .from('credit_packages')
        .select('*', { count: 'exact', head: true });
      if (error) { pkgAccess = 'error'; pkgError = error.message; }
      else { pkgAccess = 'ok'; pkgCount = count; }
    } catch (e: any) { pkgAccess = 'exception'; pkgError = e?.message || 'unknown'; }

    try {
      const { error, count } = await supabase
        .from('subscription_tiers')
        .select('*', { count: 'exact', head: true });
      if (error) { tierAccess = 'error'; tierError = error.message; }
      else { tierAccess = 'ok'; tierCount = count; }
    } catch (e: any) { tierAccess = 'exception'; tierError = e?.message || 'unknown'; }
  }

  return NextResponse.json({
    env: {
      hasServiceRoleKey,
      hasAnonKey,
      nodeEnv: process.env.NODE_ENV,
      cwd: process.cwd(),
    },
    tables: {
      user_credits: { status: dbAccess, count: userCreditsCount, error: dbError || undefined },
      credit_transactions: { status: txAccess, count: txCount, error: txError || undefined },
      credit_packages: { status: pkgAccess, count: pkgCount, error: pkgError || undefined },
      subscription_tiers: { status: tierAccess, count: tierCount, error: tierError || undefined },
    },
    hasEnvLocal: (() => {
      try { require('fs').accessSync(require('path').resolve(process.cwd(), '.env.local')); return true; }
      catch { return false; }
    })(),
  });
}
