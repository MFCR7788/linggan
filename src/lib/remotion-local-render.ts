// Remotion 本地渲染 — 仅在开发环境或独立渲染微服务（42）上使用
// 此文件包含 @remotion/bundler 和 @remotion/renderer 的静态引用
// 生产 LingJi 服务器（101）不加载此文件

import { join } from 'path';
import { tmpdir } from 'os';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { createAdminClient } from './supabase-server';
import type { RenderResult } from './remotion-render';

const MAX_DURATION_FRAMES = 900;

export async function renderRemotionComposition(params: {
  compositionId: string;
  props: Record<string, unknown>;
  userId: string;
  durationInFrames?: number;
  fps?: number;
  outputFormat?: 'mp4' | 'webm';
}): Promise<RenderResult> {
  const {
    compositionId,
    props,
    userId,
    durationInFrames,
    fps,
    outputFormat = 'mp4',
  } = params;

  if (durationInFrames && durationInFrames > MAX_DURATION_FRAMES) {
    throw new Error(`最多渲染 ${MAX_DURATION_FRAMES} 帧`);
  }

  const renderId = randomUUID();
  const outputFile = join(tmpdir(), `remotion-${renderId}.${outputFormat}`);

  try {
    const { bundle } = await import('@remotion/bundler');
    const entryPoint = join(process.cwd(), 'src/remotion/index.ts');
    const serveUrl = await bundle({ entryPoint });

    const { selectComposition } = await import('@remotion/renderer');
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: props,
    });

    const finalDuration = durationInFrames || composition.durationInFrames;
    const finalFps = fps || composition.fps;

    const { renderMedia } = await import('@remotion/renderer');
    await renderMedia({
      composition: {
        ...composition,
        durationInFrames: finalDuration,
        fps: finalFps,
      },
      serveUrl,
      codec: outputFormat === 'webm' ? 'vp8' : 'h264',
      outputLocation: outputFile,
      inputProps: props,
    });

    const videoBuffer = readFileSync(outputFile);
    const storagePath = `remotion/${userId}/${renderId}.${outputFormat}`;

    const supabase = createAdminClient();
    const { error: uploadError } = await supabase.storage
      .from('lingji-media')
      .upload(storagePath, videoBuffer, {
        contentType: outputFormat === 'webm' ? 'video/webm' : 'video/mp4',
        upsert: true,
      });

    if (uploadError) throw new Error(`上传失败: ${uploadError.message}`);

    const { data: urlData } = supabase.storage
      .from('lingji-media')
      .getPublicUrl(storagePath);

    return {
      url: urlData.publicUrl,
      storagePath,
      renderId,
      compositionId,
      durationInFrames: finalDuration,
      fps: finalFps,
      width: composition.width,
      height: composition.height,
      size: videoBuffer.length,
    };
  } finally {
    try { if (existsSync(outputFile)) unlinkSync(outputFile); } catch { /* ignore */ }
  }
}
