// 诊断端点: 检查 TTS / 天气等服务配置状态（不暴露密钥值）
import { NextResponse } from 'next/server';
import { getDashScopeApiKey, getVolcTtsAppId, getVolcTtsAccessToken } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dashScope = !!getDashScopeApiKey();
  const volcTts = !!(getVolcTtsAppId() && getVolcTtsAccessToken());

  return NextResponse.json({
    cosyvoice: dashScope ? 'ok' : 'missing_api_key',
    volcengine_tts: volcTts ? 'ok' : 'missing_config',
    // 运行时环境信息
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV,
    hasEnvLocal: (() => {
      try {
        require('fs').accessSync(require('path').resolve(process.cwd(), '.env.local'));
        return true;
      } catch { return false; }
    })(),
  });
}
