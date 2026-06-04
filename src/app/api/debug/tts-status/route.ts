// 诊断端点: 检查 TTS / ASR / 天气等服务配置状态（不暴露密钥值）
import { NextResponse } from 'next/server';
import { getDashScopeApiKey, getVolcTtsAppId, getVolcTtsAccessToken, getFunASRUrl, getKokoroApiUrl } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dashScope = !!getDashScopeApiKey();
  const volcTts = !!(getVolcTtsAppId() && getVolcTtsAccessToken());
  const funasrUrl = getFunASRUrl();
  const kokoroUrl = getKokoroApiUrl();

  // 检查本地 FunASR 是否可达
  let funasrStatus = 'not_configured';
  if (funasrUrl) {
    try {
      const res = await fetch(`${funasrUrl}/health`, { signal: AbortSignal.timeout(3000) });
      funasrStatus = res.ok ? 'ok' : 'error';
    } catch {
      funasrStatus = 'unreachable';
    }
  }

  // 检查本地 Kokoro 是否可达
  let kokoroStatus = 'not_configured';
  if (kokoroUrl) {
    try {
      const res = await fetch(`${kokoroUrl}/health`, { signal: AbortSignal.timeout(3000) });
      kokoroStatus = res.ok ? 'ok' : 'error';
    } catch {
      kokoroStatus = 'unreachable';
    }
  }

  return NextResponse.json({
    cosyvoice: dashScope ? 'ok' : 'missing_api_key',
    volcengine_tts: volcTts ? 'ok' : 'missing_config',
    funasr: funasrStatus,
    funasr_url: funasrUrl || null,
    kokoro: kokoroStatus,
    kokoro_url: kokoroUrl || null,
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
