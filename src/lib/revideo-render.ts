// Revideo 渲染客户端 — 供 Agent 工具和 API 路由使用
// 通过 HTTP 调用 42 上的 Revideo 渲染微服务（MIT 许可，免费无水印）

import type { RenderResult } from './remotion-render';

export type { RenderResult };

/**
 * 通过 HTTP 调用远端 Revideo 渲染微服务
 */
export async function renderRevideoRemote(params: {
  compositionId: string;
  props: Record<string, unknown>;
  userId: string;
  durationInFrames?: number;
  fps?: number;
}): Promise<RenderResult> {
  const url = process.env.REVIDEO_RENDER_URL || '';
  const secret = process.env.REVIDEO_SECRET || '';

  if (!url || !secret) {
    throw new Error('REVIDEO_RENDER_URL 或 REVIDEO_SECRET 未配置');
  }

  const resp = await fetch(`${url}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compositionId: params.compositionId,
      props: params.props,
      durationInFrames: params.durationInFrames,
      fps: params.fps,
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
