// Revideo 本地渲染 — 仅在 42 渲染服务器使用
// 此文件包含 @revideo/renderer 的静态引用（需 Chromium）
// 生产 LingJi 服务器（101）不加载此文件（tsconfig exclude）
// 用法: import { renderRevideoComposition } from '../lib/revideo-local-render';

import { createRequire } from 'module';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { createAdminClient } from './supabase-server';
import type { RenderResult } from './remotion-render';

const require = createRequire(import.meta.url);
const { renderVideo } = require('@revideo/renderer');

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';

export async function renderRevideoComposition(params: {
  compositionId: string;
  props: Record<string, unknown>;
  userId: string;
  durationInFrames?: number;
  fps?: number;
  outputFormat?: 'mp4';
}): Promise<RenderResult> {
  const {
    compositionId,
    props,
    userId,
    durationInFrames = 150,
    fps = 30,
  } = params;

  const renderId = randomUUID();
  const outputDir = join(tmpdir(), 'revideo-output');
  mkdirSync(outputDir, { recursive: true });
  const outName = `revideo-${renderId}`;
  const outputFile = join(outputDir, `${outName}.mp4`);

  try {
    const projectFile = join(process.cwd(), 'src/revideo/project.ts');

    await renderVideo({
      projectFile,
      variables: props,
      settings: {
        outFile: `${outName}.mp4`,
        outDir: outputDir,
        logProgress: false,
        puppeteer: {
          executablePath: CHROMIUM_PATH,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
        viteConfig: {
          server: {
            headers: {
              'Cross-Origin-Opener-Policy': 'same-origin',
              'Cross-Origin-Embedder-Policy': 'require-corp',
            },
          },
        },
        projectSettings: {
          size: { x: 1920, y: 1080 },
          range: [0, durationInFrames],
        },
      },
    });

    const videoBuffer = readFileSync(outputFile);
    const storagePath = `revideo/${userId}/${renderId}.mp4`;

    const supabase = createAdminClient();
    const { error: uploadError } = await supabase.storage
      .from('lingji-media')
      .upload(storagePath, videoBuffer, {
        contentType: 'video/mp4',
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
      durationInFrames,
      fps,
      width: 1920,
      height: 1080,
      size: videoBuffer.length,
    };
  } finally {
    try { if (existsSync(outputFile)) unlinkSync(outputFile); } catch { /* ignore */ }
  }
}
