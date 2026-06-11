// Remotion 渲染客户端 — 供 Agent 工具和 API 路由使用
// 通过 HTTP 调用 42 上的渲染微服务（不依赖本地 Remotion 包）

export interface RenderResult {
  url: string;
  storagePath: string;
  renderId: string;
  compositionId: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  size: number;
}

/**
 * 通过 HTTP 调用远端 Remotion 渲染微服务
 */
export async function renderRemotionRemote(params: {
  compositionId: string;
  props: Record<string, unknown>;
  userId: string;
  durationInFrames?: number;
  fps?: number;
  outputFormat?: 'mp4' | 'webm';
}): Promise<RenderResult> {
  const url = process.env.REMOTION_RENDER_URL || '';
  const secret = process.env.REMOTION_SECRET || '';

  if (!url || !secret) {
    throw new Error('REMOTION_RENDER_URL 或 REMOTION_SECRET 未配置');
  }

  const resp = await fetch(`${url}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compositionId: params.compositionId,
      props: params.props,
      durationInFrames: params.durationInFrames,
      fps: params.fps,
      outputFormat: params.outputFormat,
      secret,
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((errBody as { error?: string }).error || `HTTP ${resp.status}`);
  }

  const json = await resp.json() as { success: boolean; data?: RenderResult; error?: string };
  if (!json.success || !json.data) {
    throw new Error(json.error || 'Remote render failed');
  }
  return json.data;
}
