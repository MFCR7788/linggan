// 诊断端点: 检查 Credit 系统配置状态（不暴露密钥值）
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';

  let dbAccess = 'unknown';
  let dbError = '';
  let userCreditsCount: number | null = null;

  if (hasServiceRoleKey) {
    try {
      const supabase = createAdminClient();
      const { data, error, count } = await supabase
        .from('user_credits')
        .select('*', { count: 'exact', head: true });

      if (error) {
        dbAccess = 'error';
        dbError = error.message;
      } else {
        dbAccess = 'ok';
        userCreditsCount = count;
      }
    } catch (e: any) {
      dbAccess = 'exception';
      dbError = e?.message || 'unknown';
    }
  } else {
    dbAccess = 'no_service_role_key';
  }

  return NextResponse.json({
    hasServiceRoleKey,
    supabaseUrl: supabaseUrl ? supabaseUrl.replace(/\/\/.*@/, '//***@') : '',
    dbAccess,
    dbError: dbError || undefined,
    userCreditsCount,
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV,
    hasEnvLocal: (() => {
      try {
        require('fs').accessSync(require('path').resolve(process.cwd(), '.env.local'));
        return true;
      } catch { return false; }
    })(),
    hasEnv: (() => {
      try {
        require('fs').accessSync(require('path').resolve(process.cwd(), '.env'));
        return true;
      } catch { return false; }
    })(),
  });
}
