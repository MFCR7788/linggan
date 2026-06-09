import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { ok: boolean; ms: number; error?: string }> = {};

  // DB 连通性
  const dbStart = Date.now();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('users').select('id').limit(1);
    checks.db = { ok: !error, ms: Date.now() - dbStart };
    if (error) checks.db.error = error.message;
  } catch (e) {
    checks.db = { ok: false, ms: Date.now() - dbStart, error: String(e) };
  }

  const allOk = Object.values(checks).every(c => c.ok);

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
