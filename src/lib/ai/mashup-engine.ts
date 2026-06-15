// AI 混剪引擎 — 多段素材智能编排 + FFmpeg 合成
// 素材分析 → LLM 编排 → concat+xfade+BGM 合成

import { join } from 'path';
import { execFileSync } from 'child_process';
import { writeFileSync, existsSync, copyFileSync } from 'fs';
import { callDeepSeek } from '@/lib/ai-services';

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

// ── 类型 ──

export type MashupStyle = '快节奏' | '舒缓Vlog' | '教程解说' | '产品开箱';
export type MashupRatio = '9:16' | '16:9' | '1:1' | '3:4';
export type BgmStyle = 'tech' | 'chill' | 'hype' | 'elegant' | 'energetic' | 'none';

const RATIO_MAP: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '3:4': { width: 1080, height: 1440 },
};

const BGM_FILES: Record<string, string> = {
  tech: 'tech.mp3',
  chill: 'chill.mp3',
  hype: 'hype.mp3',
  elegant: 'chill.mp3',
  energetic: 'hype.mp3',
};

export interface ClipInfo {
  index: number;
  videoUrl: string;
  localPath: string;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export interface ClipArrangement {
  clipIndex: number;
  startTime: number;  // 在素材中的裁剪起点（秒）
  duration: number;   // 使用时长（秒）
  transition: 'hard' | 'fade' | 'slide_left' | 'slide_right' | 'zoom';
  order: number;
  reasoning?: string;
}

export interface MashupPlan {
  arrangements: ClipArrangement[];
  totalDuration: number;
  bgmStyle: BgmStyle;
  bgmBpm?: number;
  hasSubtitles: boolean;
  summary: string;
}

export interface MashupOptions {
  videoUrls: string[];
  goal?: string;
  style?: MashupStyle;
  ratio?: MashupRatio;
  bgm?: BgmStyle;
  targetDuration?: number;  // 目标时长（秒）
  autoSubtitles?: boolean;
}

export type ProgressCallback = (step: string, percent: number) => void;

// ── 步骤 1: 分析素材 ──

function ffprobe(filePath: string): { duration: number; width: number; height: number; hasAudio: boolean } {
  try {
    const out = execFileSync(FFMPEG_PATH, [
      '-i', filePath,
      '-f', 'null', '-',
    ], { stdio: 'pipe', timeout: 15_000 }) as unknown as { stderr: Buffer };
    const info = out.stderr.toString();

    const durMatch = info.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    const duration = durMatch
      ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3])
      : 5;

    const resMatch = info.match(/(\d{2,4})x(\d{2,4})/);
    const width = resMatch ? parseInt(resMatch[1]) : 1920;
    const height = resMatch ? parseInt(resMatch[2]) : 1080;

    const hasAudio = info.includes('Stream #0:1') && !info.includes('Stream #0:1: Audio: none');

    return { duration, width, height, hasAudio };
  } catch {
    return { duration: 5, width: 1920, height: 1080, hasAudio: true };
  }
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}: ${url.substring(0, 80)}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(outputPath, buf);
}

export async function analyzeClips(
  videoUrls: string[],
  outputDir: string,
  onProgress?: ProgressCallback,
): Promise<ClipInfo[]> {
  const clips: ClipInfo[] = [];

  for (let i = 0; i < videoUrls.length; i++) {
    onProgress?.(`分析素材 ${i + 1}/${videoUrls.length}`, (i / videoUrls.length) * 80);
    const url = videoUrls[i];
    const localPath = join(outputDir, `clip_${i}.mp4`);

    await downloadVideo(url, localPath);

    const info = ffprobe(localPath);
    clips.push({
      index: i,
      videoUrl: url,
      localPath,
      duration: info.duration,
      width: info.width,
      height: info.height,
      hasAudio: info.hasAudio,
    });
  }

  return clips;
}

// ── 步骤 2: LLM 编排 ──

export async function generateArrangement(
  clips: ClipInfo[],
  options: {
    goal?: string;
    style?: MashupStyle;
    targetDuration?: number;
  } = {},
): Promise<MashupPlan> {
  const clipDescriptions = clips.map((c) =>
    `素材${c.index}: 时长${c.duration.toFixed(1)}s, ${c.width}x${c.height}, ${c.hasAudio ? '有声音' : '无声'}`
  ).join('\n');

  const totalAvailable = clips.reduce((s, c) => s + c.duration, 0);
  const target = options.targetDuration || Math.min(30, totalAvailable);

  const prompt = `你是短视频混剪编排专家。根据以下素材和需求，生成最优镜头编排方案。

## 素材
${clipDescriptions}

## 需求
- 风格: ${options.style || '快节奏'}
- 目标时长: ${target}秒
${options.goal ? `- 创作目标: ${options.goal}` : ''}
- 素材总可用时长: ${totalAvailable.toFixed(0)}秒

## 输出格式
返回 JSON：
{
  "arrangements": [
    {
      "clipIndex": 0,
      "startTime": 0,
      "duration": 5,
      "transition": "hard",
      "order": 0,
      "reasoning": "开场吸引注意"
    }
  ],
  "bgmStyle": "hype",
  "hasSubtitles": true,
  "summary": "方案简介"
}

规则：
1. 每个素材可用一段或多段（clipIndex 可重复）
2. transition: hard(硬切), fade(淡入淡出), slide_left(左滑), slide_right(右滑), zoom(放大)
3. 总 duration 之和尽量接近目标时长 ${target}s
4. 重点素材多给时间，空镜/过渡镜头给短时间
5. 第一段和最后一段用 hard cut，中间可用转场
6. order 从 0 开始递增
7. 只返回 JSON，不包含解释`;

  const systemPrompt = '你是视频混剪编排专家。只返回 JSON。';
  const response = await callDeepSeek(
    `${systemPrompt}\n\n${prompt}`,
    { temperature: 0.5, maxTokens: 2000 },
  );

  const match = response.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`编排方案解析失败: ${response.substring(0, 200)}`);

  const plan = JSON.parse(match[0]) as MashupPlan;
  plan.arrangements.sort((a, b) => a.order - b.order);
  plan.totalDuration = plan.arrangements.reduce((s, a) => s + a.duration, 0);

  return plan;
}

// ── 步骤 3: FFmpeg 合成 ──

const XFADE_MAP: Record<string, string> = {
  fade: 'fade',
  slide_left: 'slideleft',
  slide_right: 'slideright',
  zoom: 'zoomin',
};

export async function compositeMashup(
  clips: ClipInfo[],
  plan: MashupPlan,
  outputDir: string,
  options: {
    ratio?: MashupRatio;
    bgm?: BgmStyle;
    bgmVolume?: number;
  } = {},
  onProgress?: ProgressCallback,
): Promise<string> {
  const resolution = RATIO_MAP[options.ratio || '9:16'];
  const { width, height } = resolution;
  const { arrangements, bgmStyle } = plan;

  // 1. 裁剪 + 统一分辨率 each segment
  onProgress?.('处理素材片段', 10);
  const segmentPaths: string[] = [];

  for (let i = 0; i < arrangements.length; i++) {
    const arr = arrangements[i];
    const clip = clips[arr.clipIndex];
    if (!clip) continue;

    const segPath = join(outputDir, `seg_${i}.mp4`);
    const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;

    execFileSync(FFMPEG_PATH, [
      '-y', '-ss', String(arr.startTime), '-i', clip.localPath,
      '-t', String(arr.duration),
      '-vf', scaleFilter,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-r', '30',
      '-an',
      segPath,
    ], { stdio: 'pipe', timeout: 120_000 });

    segmentPaths.push(segPath);
    onProgress?.(`处理片段 ${i + 1}/${arrangements.length}`, 10 + (i / arrangements.length) * 40);
  }

  // 2. 合并（带转场）
  onProgress?.('合成视频', 55);

  if (segmentPaths.length === 1) {
    // 单片段直接复制
    const finalPath = join(outputDir, 'final.mp4');
    copyFileSync(segmentPaths[0], finalPath);

    // 处理 BGM
    let resultPath = finalPath;
    if (bgmStyle !== 'none') {
      resultPath = await addBGM(finalPath, bgmStyle, outputDir, options.bgmVolume || 0.18);
    }

    onProgress?.('完成', 100);
    return resultPath;
  }

  // 多片段：用 concat filter（支持 xfade 转场）
  const finalPath = join(outputDir, 'final.mp4');
  await concatWithTransitions(segmentPaths, arrangements, finalPath, outputDir, onProgress);

  // 3. BGM
  let resultPath = finalPath;
  if (bgmStyle !== 'none') {
    onProgress?.('添加BGM', 90);
    resultPath = await addBGM(finalPath, bgmStyle, outputDir, options.bgmVolume || 0.18);
  }

  onProgress?.('完成', 100);
  return resultPath;
}

async function concatWithTransitions(
  segmentPaths: string[],
  arrangements: ClipArrangement[],
  outputPath: string,
  outputDir: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  // 检查是否有转场
  const hasTransitions = arrangements.some((a) => a.transition && a.transition !== 'hard');

  if (!hasTransitions) {
    // 纯硬切：用 concat demuxer
    const filelist = join(outputDir, 'filelist.txt');
    writeFileSync(filelist, segmentPaths.map((p) => `file '${p}'`).join('\n'));
    execFileSync(FFMPEG_PATH, [
      '-y', '-f', 'concat', '-safe', '0', '-i', filelist,
      '-c', 'copy', outputPath,
    ], { stdio: 'pipe', timeout: 120_000 });
    return;
  }

  // 有转场：用 concat filter + xfade
  // 构建 filter_complex
  const inputs: string[] = [];
  const filterParts: string[] = [];
  const labels: string[] = [];

  for (let i = 0; i < segmentPaths.length; i++) {
    inputs.push('-i', segmentPaths[i]);
    labels.push(`[${i}:v]`);
  }

  let prevLabel = labels[0];
  let totalStreams = segmentPaths.length;

  for (let i = 1; i < segmentPaths.length; i++) {
    const transition = arrangements[i]?.transition || 'hard';

    if (transition === 'hard') {
      // 硬切：用 concat
      const outLabel = `[v${i}]`;
      filterParts.push(`${prevLabel}${labels[i]}concat=n=2:v=1:a=0${outLabel}`);
      prevLabel = outLabel;
    } else {
      // xfade 转场
      const xfadeType = XFADE_MAP[transition] || 'fade';
      const xfadeDuration = 0.5;
      const outLabel = `[v${i}]`;
      filterParts.push(`${prevLabel}${labels[i]}xfade=transition=${xfadeType}:duration=${xfadeDuration}:offset=${xfadeDuration}${outLabel}`);
      prevLabel = outLabel;
    }
  }

  // 最后 map 输出
  filterParts.push(`${prevLabel}format=yuv420p[vout]`);

  const filterComplex = filterParts.join(';');

  execFileSync(FFMPEG_PATH, [
    '-y', ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-pix_fmt', 'yuv420p',
    outputPath,
  ], { stdio: 'pipe', timeout: 300_000 });
}

async function addBGM(
  videoPath: string,
  bgmStyle: string,
  outputDir: string,
  volume: number = 0.18,
): Promise<string> {
  const bgmFile = BGM_FILES[bgmStyle] || 'chill.mp3';
  const bgmPath = join(process.cwd(), 'public', 'bgm', bgmFile);

  if (!existsSync(bgmPath)) return videoPath;

  const outputPath = join(outputDir, 'with_bgm.mp4');
  const volMap: Record<string, string> = { tech: '0.18', chill: '0.22', hype: '0.15', elegant: '0.18', energetic: '0.18' };
  const vol = volMap[bgmStyle] || String(volume);

  // 获取视频时长
  const probeOut = execFileSync(FFMPEG_PATH, [
    '-i', videoPath, '-f', 'null', '-',
  ], { stdio: 'pipe', timeout: 15_000 }) as unknown as { stderr: Buffer };
  const durMatch = probeOut.stderr.toString().match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  const duration = durMatch
    ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3])
    : 30;

  execFileSync(FFMPEG_PATH, [
    '-y', '-i', videoPath, '-i', bgmPath,
    '-filter_complex',
    `[1:a]volume=${vol},afade=t=in:d=2,afade=t=out:st=${Math.max(0, duration - 2)}:d=2[bgm];[0:a][bgm]amix=inputs=2:duration=first,volume=1.3[aout]`,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'copy', '-shortest',
    outputPath,
  ], { stdio: 'pipe', timeout: 120_000 });

  return outputPath;
}

// ── 完整流水线 ──

export async function runMashupPipeline(
  videoUrls: string[],
  outputDir: string,
  options: MashupOptions,
  onProgress?: ProgressCallback,
): Promise<{ plan: MashupPlan; outputPath: string }> {
  // 1. 分析素材
  onProgress?.('下载素材', 5);
  const clips = await analyzeClips(videoUrls, outputDir, (step, pct) => {
    onProgress?.(step, 5 + pct * 0.2);
  });

  // 2. LLM 编排
  onProgress?.('生成编排方案', 30);
  const plan = await generateArrangement(clips, {
    goal: options.goal,
    style: options.style,
    targetDuration: options.targetDuration,
  });

  // 3. 合成
  onProgress?.('合成视频', 40);
  const outputPath = await compositeMashup(
    clips, plan, outputDir,
    {
      ratio: options.ratio,
      bgm: options.bgm || plan.bgmStyle,
    },
    (step, pct) => onProgress?.(step, 40 + pct * 0.55),
  );

  onProgress?.('完成', 100);
  return { plan, outputPath };
}
