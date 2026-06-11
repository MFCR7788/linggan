// Revideo 本地渲染函数（仅在 42 渲染服务器使用）
// tsconfig exclude 此文件，防止 101 构建时解析 @revideo/renderer
// 用法: import { renderRevideoComposition } from '../lib/revideo-local-render';

import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const { renderVideo } = require('@revideo/renderer');

export interface RevideoRenderParams {
  /** 模板 ID（scene name） */
  templateId: string;
  /** 视频变量 */
  variables: Record<string, unknown>;
  /** 输出文件名（不含扩展名） */
  outputName?: string;
  /** 输出目录 */
  outputDir?: string;
  /** 帧率 */
  fps?: number;
  /** 分辨率 [width, height] */
  size?: [number, number];
  /** 时长（帧数） */
  durationInFrames?: number;
}

export interface RevideoRenderResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  renderTimeMs?: number;
}

/**
 * 渲染 Revideo 视频合成
 */
export async function renderRevideoComposition(
  params: RevideoRenderParams,
): Promise<RevideoRenderResult> {
  const {
    templateId,
    variables,
    outputName = 'revideo-output',
    outputDir = './output/revideo',
    fps = 30,
    size = [1920, 1080],
    durationInFrames = 150,
  } = params;

  const startTime = Date.now();

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    const projectFile = path.resolve('src/revideo/project.ts');

    const outputPath = await renderVideo({
      projectFile,
      variables,
      settings: {
        outFile: `${outputName}.mp4`,
        outDir: outputDir,
        logProgress: false,
        projectSettings: {
          size: { x: size[0], y: size[1] },
          range: [0, durationInFrames],
        },
      },
    });

    return {
      success: true,
      outputPath,
      renderTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      renderTimeMs: Date.now() - startTime,
    };
  }
}
