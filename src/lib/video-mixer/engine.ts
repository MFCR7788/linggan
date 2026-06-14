// 视频混剪引擎 — FFmpeg 复杂 filtergraph 构建
// 核心：用 xfade filter 替代 concat -c copy，实现带转场的视频拼接

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { MixProject, MixSegment, MixTransition } from './types';
import { getXfadeParam } from './transitions';

const execAsync = promisify(exec);
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

/** 混剪引擎配置 */
export interface MixEngineOptions {
  /** 临时文件目录 */
  tempDir?: string;
  /** 输出文件路径 */
  outputPath?: string;
  /** ffmpeg 超时(ms) */
  timeout?: number;
}

/**
 * 构建 xfade filtergraph
 *
 * 为每段视频：
 *   [0:v]trim=start:end,setpts=PTS-STARTPTS,fps=30[v0]
 * 段间转场：
 *   [v0][v1]xfade=transition=fade:duration=0.5:offset=trimDur-0.5[v01]
 *
 * 同时处理音频流：
 *   [0:a]atrim=...,asetpts=PTS-STARTPTS[a0]
 *   段间 crossfade：
 *   [a0][a1]acrossfade=d=0.5[a01]
 */
function buildFiltergraph(
  segments: MixSegment[],
  transitions: MixTransition[]
): { videoFilter: string; audioFilter: string; totalDuration: number } {
  const videoChains: string[] = [];
  const audioChains: string[] = [];
  let totalDuration = 0;
  const segDurations: number[] = [];

  // 为每个片段构建 trim + setpts
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const clipDuration = seg.trimEnd - seg.trimStart;
    segDurations.push(clipDuration);
    totalDuration += clipDuration;

    // 视频流
    videoChains.push(
      `[${i}:v]trim=start=${seg.trimStart}:end=${seg.trimEnd},setpts=PTS-STARTPTS,fps=30[v${i}]`
    );

    // 音频流
    audioChains.push(
      `[${i}:a]atrim=start=${seg.trimStart}:end=${seg.trimEnd},asetpts=PTS-STARTPTS[a${i}]`
    );
  }

  const videoFilterParts: string[] = [...videoChains];
  const audioFilterParts: string[] = [...audioChains];

  // 构建转场链
  let lastVideoLabel = `v0`;
  let lastAudioLabel = `a0`;
  let offset = segDurations[0];

  for (let i = 1; i < segments.length; i++) {
    const transition = transitions[i - 1];
    const transDur = transition.type === 'none' ? 0 : transition.duration;
    const xfadeOffset = offset - transDur;

    if (transition.type === 'none') {
      // 无转场：直接 concat
      videoFilterParts.push(
        `[${lastVideoLabel}][v${i}]concat=n=2:v=1:a=0[v_out${i}]`
      );
      lastVideoLabel = `v_out${i}`;
      audioFilterParts.push(
        `[${lastAudioLabel}][a${i}]concat=n=2:v=0:a=1[a_out${i}]`
      );
      lastAudioLabel = `a_out${i}`;
    } else {
      const xfade = getXfadeParam(transition.type, transition.duration);
      videoFilterParts.push(
        `[${lastVideoLabel}][v${i}]${xfade}:offset=${xfadeOffset.toFixed(2)}[v_out${i}]`
      );
      lastVideoLabel = `v_out${i}`;
      // 音频 crossfade
      audioFilterParts.push(
        `[${lastAudioLabel}][a${i}]acrossfade=d=${transDur.toFixed(2)}[a_out${i}]`
      );
      lastAudioLabel = `a_out${i}`;
      totalDuration -= transDur; // 转场会重叠时间
    }

    offset += segDurations[i];
  }

  const videoFilter = videoFilterParts.join(';\n');
  const audioFilter = audioFilterParts.join(';\n');

  return { videoFilter, audioFilter, totalDuration };
}

/**
 * 执行混剪 — 主要入口
 *
 * @param project 混剪项目
 * @param options 引擎选项
 * @returns 输出视频文件路径
 */
export async function mixVideos(
  project: MixProject,
  options: MixEngineOptions = {}
): Promise<string> {
  const { segments, transitions } = project;
  if (segments.length === 0) throw new Error('混剪: 没有素材片段');
  if (transitions.length !== segments.length - 1) {
    throw new Error(`混剪: 转场数量(${transitions.length})与片段数量(${segments.length})不匹配`);
  }

  const tempDir = options.tempDir || join(tmpdir(), `lingji-mix-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });

  const outputPath = options.outputPath || join(tempDir, 'output.mp4');
  const timeout = options.timeout || 300_000;

  // 构建输入参数
  const inputs = segments.map(s => `-i "${s.videoUrl}"`).join(' ');

  // 构建 filtergraph
  const { videoFilter } = buildFiltergraph(segments, transitions);
  const lastVLabel = segments.length === 1 ? 'v0' : `v_out${segments.length - 1}`;
  const lastALabel = segments.length === 1 ? 'a0' : `a_out${segments.length - 1}`;

  const filterComplex = `${videoFilter}`;
  const mapArgs = `-map "[${lastVLabel}]" -map "[${lastALabel}]"`;

  // 输出分辨率
  const scaleMap: Record<string, string> = {
    '720p': 'scale=1280:720',
    '1080p': 'scale=1920:1080',
  };
  const scale = scaleMap[project.outputResolution] || 'scale=1280:720';

  const aspectMap: Record<string, string> = {
    '16:9': 'setsar=1/1',
    '9:16': 'setsar=1/1',
    '1:1': 'setsar=1/1',
  };

  const cmd = `${FFMPEG_PATH} -y ${inputs} ` +
    `-filter_complex "${filterComplex};[${lastVLabel}]${scale},${aspectMap[project.outputAspect] || 'setsar=1/1'}[outv]" ` +
    `-map "[outv]" -map "[${lastALabel}]" ` +
    `-c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k ` +
    `-movflags +faststart "${outputPath}"`;

  console.log('[video-mixer] 执行混剪命令:', cmd.substring(0, 200) + '...');

  try {
    await execAsync(cmd, { timeout });
    return outputPath;
  } catch (e: unknown) {
    const execError = e as { stderr?: string; stdout?: string; message?: string };
    const detail = (execError.stderr || '') + (execError.stdout || '') ||
      (e instanceof Error ? e.message : String(e));
    console.error('[video-mixer] 混剪失败:', detail.substring(0, 300));
    throw new Error(`视频混剪失败: ${detail.substring(0, 300)}`);
  }
}

/**
 * 为视频添加 BGM（支持闪避效果）
 */
export async function mixBGM(
  videoPath: string,
  bgmPath: string,
  outputPath: string,
  options?: { volume?: number; ducking?: boolean }
): Promise<string> {
  const volume = options?.volume ?? 0.2;
  const ducking = options?.ducking ?? false;

  if (ducking) {
    // 闪避: 人声时降低 BGM 音量
    const cmd = `${FFMPEG_PATH} -y -i "${videoPath}" -i "${bgmPath}" ` +
      `-filter_complex ` +
      `"[1:a]volume=${volume}[bgm];` +
      `[0:a]asplit[a_orig][a_side];` +
      `[a_side]astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-` +
      `- | stdbuf -oL grep RMS | ...` +
      // 简化版：直接用 compression 模拟闪避
      `[bgm][a_orig]sidechaincompress=threshold=0.1:ratio=4:attack=5:release=50[bgm_ducked];` +
      `[0:v]copy[v_out]" ` +
      `-map "[v_out]" -map "[bgm_ducked]" -shortest ` +
      `-c:v copy -c:a aac -b:a 128k "${outputPath}"`;

    try {
      await execAsync(cmd, { timeout: 300_000 });
      return outputPath;
    } catch {
      // 闪避失败，回退到普通混音
      console.warn('[video-mixer] 闪避混音失败，回退到普通混音');
    }
  }

  // 普通混音
  const cmd = `${FFMPEG_PATH} -y -i "${videoPath}" -i "${bgmPath}" ` +
    `-filter_complex "[1:a]volume=${volume},afade=t=in:d=2,afade=t=out:st=9999:d=2[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=3[a_out]" ` +
    `-map 0:v -map "[a_out]" -shortest -c:v copy -c:a aac -b:a 128k "${outputPath}"`;

  await execAsync(cmd, { timeout: 300_000 });
  return outputPath;
}
