// 智能剪辑 FFmpeg 执行器 — trim+concat / 多段提取 / 后处理
// 复用 ffmpeg-utils.ts 的 concatVideos, burnSubtitles, addBGM, getTempDir, cleanupTempDir

import { join } from 'path';
import { writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  concatVideos,
  burnSubtitles,
  addBGM,
  getTempDir,
  cleanupTempDir,
  generateSRT,
  type StoryboardScene,
} from '@/lib/ffmpeg-utils';
import { execFileSync } from 'child_process';
import type { TimedSentence } from '@/lib/video-transcriber';

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

export interface PostProcessOptions {
  ratio?: '9:16' | '16:9' | '1:1' | 'original';
  subtitles?: boolean;
  bgm?: 'tech' | 'chill' | 'hype' | 'elegant' | 'energetic' | 'none';
  endCard?: boolean;
}

export type ProgressCallback = (step: string, percent: number) => void;

const RATIO_DIMS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

// ── 工具函数 ──

function ffmpeg(args: string[], timeoutMs = 300_000): void {
  try {
    execFileSync(FFMPEG_PATH, args, { stdio: 'pipe', timeout: timeoutMs });
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const detail =
      (err.stderr?.toString() || '') + (err.stdout?.toString() || '') ||
      (e instanceof Error ? e.message : String(e));
    throw new Error(`ffmpeg 失败: ${detail.substring(0, 300)}`);
  }
}

async function downloadFile(url: string, outputPath: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}: ${url.substring(0, 80)}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(outputPath, buf);
  return outputPath;
}

// ── 核心执行 ──

export async function trimAndConcat(
  videoPath: string,
  segments: Array<{ start: number; end: number; action: 'keep' | 'cut' }>,
  outputDir: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const keepSegments = segments
    .filter((s) => s.action === 'keep')
    .sort((a, b) => a.start - b.start);

  if (keepSegments.length === 0) {
    throw new Error('没有保留的片段');
  }

  // 单段直接 copy，无需 concat
  if (keepSegments.length === 1) {
    onProgress?.('切割片段 1/1', 50);
    const output = join(outputDir, 'output.mp4');
    ffmpeg([
      '-y', '-ss', String(keepSegments[0].start),
      '-to', String(keepSegments[0].end),
      '-i', videoPath,
      '-c', 'copy', '-avoid_negative_ts', 'make_zero',
      output,
    ]);
    onProgress?.('切割完成', 100);
    return output;
  }

  // 多段：逐段 trim，再 concat
  const segPaths: string[] = [];
  const total = keepSegments.length;

  for (let i = 0; i < total; i++) {
    const seg = keepSegments[i];
    onProgress?.(`切割片段 ${i + 1}/${total}`, Math.round((i / total) * 80));
    const segPath = join(outputDir, `seg_${i}.mp4`);
    ffmpeg([
      '-y', '-ss', String(seg.start),
      '-to', String(seg.end),
      '-i', videoPath,
      '-c', 'copy', '-avoid_negative_ts', 'make_zero',
      segPath,
    ]);
    segPaths.push(segPath);
  }

  onProgress?.('拼接合并中', 85);
  const output = join(outputDir, 'output.mp4');
  await concatVideos(segPaths, output);
  onProgress?.('拼接完成', 100);
  return output;
}

export async function extractSlices(
  videoPath: string,
  slices: Array<{ start: number; end: number; enabled: boolean; title?: string }>,
  outputDir: string,
  postProcess?: PostProcessOptions,
  onProgress?: ProgressCallback
): Promise<string[]> {
  const enabled = slices.filter((s) => s.enabled);
  if (enabled.length === 0) throw new Error('没有启用的切片');

  const outputPaths: string[] = [];
  const sliceDir = join(outputDir, 'slices');
  if (!existsSync(sliceDir)) mkdirSync(sliceDir, { recursive: true });

  for (let i = 0; i < enabled.length; i++) {
    const slice = enabled[i];
    onProgress?.(`提取切片 ${i + 1}/${enabled.length}`, Math.round((i / enabled.length) * 90));

    const safeName = (slice.title || `slice_${i + 1}`).replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
    let slicePath = join(sliceDir, `${safeName}.mp4`);

    ffmpeg([
      '-y', '-ss', String(slice.start),
      '-to', String(slice.end),
      '-i', videoPath,
      '-c', 'copy', '-avoid_negative_ts', 'make_zero',
      slicePath,
    ]);

    // 后处理（如有）
    if (postProcess) {
      const processedPath = await applyPostProcess(slicePath, undefined, postProcess, sliceDir);
      slicePath = processedPath;
    }

    outputPaths.push(slicePath);
  }

  onProgress?.('切片提取完成', 100);
  return outputPaths;
}

export async function applyPostProcess(
  videoPath: string,
  subtitles?: TimedSentence[],
  options?: PostProcessOptions,
  outputDir?: string
): Promise<string> {
  if (!options) return videoPath;

  const dir = outputDir || getTempDir('postprocess');
  let current = videoPath;

  // 1. 分辨率调整
  if (options.ratio && options.ratio !== 'original' && RATIO_DIMS[options.ratio]) {
    const { width, height } = RATIO_DIMS[options.ratio];
    const resized = join(dir, `resized_${randomUUID()}.mp4`);
    ffmpeg([
      '-y', '-i', current,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
      '-c:a', 'copy',
      resized,
    ]);
    current = resized;
  }

  // 2. 字幕
  if (options.subtitles && subtitles && subtitles.length > 0) {
    const srtPath = join(dir, `sub_${randomUUID()}.srt`);
    const storyboard: StoryboardScene[] = subtitles.map((s, i) => ({
      index: i,
      timeStart: s.begin_time / 1000,
      timeEnd: s.end_time / 1000,
      duration: (s.end_time - s.begin_time) / 1000,
      subtitle: s.text,
    }));
    generateSRT(storyboard, srtPath);

    const subbed = join(dir, `subbed_${randomUUID()}.mp4`);
    await burnSubtitles(current, srtPath, '白色粗体', '底部', subbed);
    current = subbed;
  }

  // 3. BGM
  if (options.bgm && options.bgm !== 'none') {
    const withBgm = join(dir, `bgm_${randomUUID()}.mp4`);
    await addBGM(current, options.bgm, withBgm);
    current = withBgm;
  }

  // 4. 片尾
  if (options.endCard) {
    const endedPath = join(dir, `ended_${randomUUID()}.mp4`);
    const endCard = join(process.cwd(), 'public', 'end-card.mp4');
    if (existsSync(endCard)) {
      const filelist = join(dir, 'filelist.txt');
      writeFileSync(filelist, `file '${current}'\nfile '${endCard}'\n`);
      await concatVideos([current, endCard], endedPath);
      current = endedPath;
    }
  }

  return current;
}
