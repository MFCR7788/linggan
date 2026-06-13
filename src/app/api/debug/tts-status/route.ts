// 诊断端点: 检查 TTS / 天气等服务配置状态（生产环境禁用）
import { NextResponse } from 'next/server';
import { getDashScopeApiKey, getVolcTtsAppId, getVolcTtsAccessToken } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  // 生产环境完全禁用
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const dashScope = !!getDashScopeApiKey();
  const volcTts = !!(getVolcTtsAppId() && getVolcTtsAccessToken());

  return NextResponse.json({
    cosyvoice: dashScope ? 'ok' : 'missing_api_key',
    volcengine_tts: volcTts ? 'ok' : 'missing_config',
  });
}
