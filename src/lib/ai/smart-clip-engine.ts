// 智能剪辑核心引擎 — 提取音频 → 转写 → 分析 → 执行
// 共享于 API 路由和 Agent Tool

import { join } from 'path';
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { recognizeAudio } from '@/lib/ai/funasr-client';
import type { TimedSentence } from '@/lib/video-transcriber';
import {
  detectSilence,
  detectFillers,
  detectRepetition,
  mergeAnalyses,
} from './smart-clip-analysis';
import type { SegmentAnalysis } from './smart-clip-analysis';
import {
  analyzeClipByDescription,
  analyzeSliceByProduct,
  analyzeSliceByTopic,
} from './smart-clip-plan';
import type { SlicePoint } from './smart-clip-plan';
import {
  trimAndConcat,
  extractSlices,
  applyPostProcess,
} from './smart-clip-executor';
import type { PostProcessOptions, ProgressCallback } from './smart-clip-executor';

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

// ── 类型 ──

export type ClipMode = 'auto' | 'silence_only' | 'by_description' | 'by_time_ranges';
export type SliceMode = 'product' | 'highlight' | 'topic' | 'uniform' | 'custom';
export type Direction = 'clip' | 'slice';

export interface AnalyzeClipOptions {
  mode: ClipMode;
  description?: string;
  timeRanges?: Array<{ start: number; end: number }>;
  silenceThreshold?: number;
  minSilenceDuration?: number;
  removeFillers?: boolean;
  removeRepetition?: boolean;
}

export interface AnalyzeSliceOptions {
  mode: SliceMode;
  keywords?: string[];
  sliceDuration?: { min: number; max: number };
}

export interface AnalyzeResult {
  taskId: string;
  direction: Direction;
  videoDuration: number;
  videoPath: string;
  audioPath: string;
  sentences: TimedSentence[];
  segments?: SegmentAnalysis[];
  slices?: SlicePoint[];
}

export { type SegmentAnalysis, type SlicePoint, type PostProcessOptions, type ProgressCallback };

// ── 步骤 1: 提取音频 ──

export async function extractAudio(
  videoPath: string,
  outputDir?: string
): Promise<string> {
  const dir = outputDir || getTempDir('audio');
  const audioPath = join(dir, 'audio.wav');

  try {
    execFileSync(FFMPEG_PATH, [
      '-y', '-i', videoPath,
      '-vn', '-acodec', 'pcm_s16le',
      '-ar', '16000', '-ac', '1',
      audioPath,
    ], { stdio: 'pipe', timeout: 120_000 });
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; message?: string };
    const detail = err.stderr?.toString() || (e instanceof Error ? e.message : String(e));
    throw new Error(`音频提取失败: ${detail.substring(0, 200)}`);
  }

  return audioPath;
}

// ── 步骤 2: 语音转写 ──

export async function transcribe(audioPath: string): Promise<TimedSentence[]> {
  const result = await recognizeAudio(audioPath);

  if (!result.success || !result.text.trim()) {
    throw new Error(result.error || '语音识别无结果');
  }

  // recognizeAudio 返回纯文本，按 ~4 字/秒估算时间戳
  const text = result.text;
  const estimatedDuration = Math.max(1, text.length / 4);
  const sentenceTexts = text.split(/[。！？\n]+/).filter(Boolean);

  const sentences: TimedSentence[] = [];
  let cursor = 0;
  const totalChars = sentenceTexts.reduce((sum, s) => sum + s.length, 0);

  for (const txt of sentenceTexts) {
    const charRatio = txt.length / Math.max(1, totalChars);
    const duration = charRatio * estimatedDuration * 1000;
    sentences.push({
      begin_time: Math.round(cursor),
      end_time: Math.round(cursor + duration),
      text: txt.trim(),
    });
    cursor += duration;
  }

  return sentences;
}

// ── 步骤 3a: 分析剪辑 ──

export async function analyzeForClip(
  sentences: TimedSentence[],
  audioPath: string,
  videoDuration: number,
  options: AnalyzeClipOptions,
  onProgress?: ProgressCallback
): Promise<SegmentAnalysis[]> {
  const {
    mode,
    description,
    timeRanges,
    silenceThreshold = -30,
    minSilenceDuration = 2.0,
    removeFillers = true,
    removeRepetition = true,
  } = options;

  // by_time_ranges: 直接映射
  if (mode === 'by_time_ranges' && timeRanges) {
    const segments: SegmentAnalysis[] = [];
    let cursor = 0;

    for (const range of timeRanges.sort((a, b) => a.start - b.start)) {
      if (range.start > cursor + 0.1) {
        segments.push({
          start: cursor, end: range.start, text: '',
          recommendation: 'keep', reason: '内容保留', confidence: 1,
        });
      }
      segments.push({
        start: Math.max(range.start, cursor), end: Math.min(range.end, videoDuration),
        text: '', recommendation: 'cut',
        reason: '用户指定删除', confidence: 1,
      });
      cursor = Math.max(cursor, range.end);
    }

    if (cursor < videoDuration - 0.1) {
      segments.push({
        start: cursor, end: videoDuration, text: '',
        recommendation: 'keep', reason: '内容保留', confidence: 1,
      });
    }

    return segments;
  }

  // by_description: LLM 理解
  if (mode === 'by_description' && description) {
    onProgress?.('正在分析描述...', 60);
    return analyzeClipByDescription(sentences, description, videoDuration);
  }

  // silence_only / auto: 规则引擎
  onProgress?.('检测静音...', 40);

  const silenceRanges = await detectSilence(audioPath, silenceThreshold, minSilenceDuration);

  let fillerRanges: Array<{ start: number; end: number; text: string }> = [];
  let repetitionRanges: Array<{
    start: number; end: number;
    similarToStart: number; similarToEnd: number; similarity: number;
  }> = [];

  if (mode === 'auto') {
    onProgress?.('检测口水词...', 60);
    if (removeFillers) {
      fillerRanges = detectFillers(sentences);
    }

    onProgress?.('检测重复...', 75);
    if (removeRepetition) {
      repetitionRanges = detectRepetition(sentences);
    }
  }

  onProgress?.('生成分段方案...', 90);

  return mergeAnalyses(silenceRanges, fillerRanges, repetitionRanges, videoDuration);
}

// ── 步骤 3b: 分析切片 ──

export async function analyzeForSlice(
  sentences: TimedSentence[],
  _audioPath: string,
  videoDuration: number,
  options: AnalyzeSliceOptions,
  onProgress?: ProgressCallback
): Promise<SlicePoint[]> {
  const { mode, keywords = [], sliceDuration } = options;

  switch (mode) {
    case 'uniform': {
      onProgress?.('生成均分切片...', 80);
      const duration = sliceDuration?.max || 60;
      const slices: SlicePoint[] = [];
      let cursor = 0;
      let index = 1;
      while (cursor < videoDuration) {
        const end = Math.min(cursor + duration, videoDuration);
        slices.push({
          id: `uniform-${index}`,
          start: cursor,
          end,
          title: `片段 ${index}`,
          enabled: true,
          confidence: 1,
        });
        cursor = end;
        index++;
      }
      return slices;
    }

    case 'product': {
      onProgress?.('LLM 识别产品讲解段落...', 60);
      return analyzeSliceByProduct(sentences, keywords, videoDuration);
    }

    case 'topic': {
      onProgress?.('LLM 分析话题切换...', 60);
      return analyzeSliceByTopic(sentences, videoDuration);
    }

    case 'highlight': {
      onProgress?.('检测高能时刻...', 60);
      // 基于音频能量：取音量较高的连续句段
      const slices: SlicePoint[] = [];
      let segStart: number | null = null;
      let segEnd = 0;
      let index = 1;

      for (const s of sentences) {
        const dur = (s.end_time - s.begin_time) / 1000;
        const text = s.text?.trim() || '';
        // 简单启发式：长句子 + 有感叹号/问号 → 可能是高能时刻
        const isHighlight = text.length > 15 && /[！!？?]/.test(text);

        if (isHighlight && segStart === null) {
          segStart = s.begin_time / 1000;
          segEnd = s.end_time / 1000;
        } else if (isHighlight && segStart !== null) {
          segEnd = s.end_time / 1000;
        } else if (!isHighlight && segStart !== null) {
          if (segEnd - segStart >= 10) {
            slices.push({
              id: `highlight-${index}`,
              start: Math.max(0, segStart - 2),
              end: Math.min(videoDuration, segEnd + 2),
              title: `高能片段 ${index}`,
              enabled: true,
              confidence: 0.6,
            });
            index++;
          }
          segStart = null;
        }
      }

      // 收尾
      if (segStart !== null && segEnd - segStart >= 10) {
        slices.push({
          id: `highlight-${index}`,
          start: Math.max(0, segStart - 2),
          end: Math.min(videoDuration, segEnd + 2),
          title: `高能片段 ${index}`,
          enabled: true,
          confidence: 0.6,
        });
      }

      return slices;
    }

    case 'custom': {
      onProgress?.('按关键词匹配...', 60);
      // 按关键词匹配句子
      const slices: SlicePoint[] = [];
      let segStart: number | null = null;
      let segEnd = 0;
      let index = 1;

      for (const s of sentences) {
        const text = s.text?.trim() || '';
        const matched = keywords.length === 0 || keywords.some((kw) => text.includes(kw));

        if (matched && segStart === null) {
          segStart = s.begin_time / 1000;
          segEnd = s.end_time / 1000;
        } else if (matched && segStart !== null) {
          segEnd = s.end_time / 1000;
        } else if (!matched && segStart !== null) {
          if (segEnd - segStart >= 10) {
            slices.push({
              id: `custom-${index}`,
              start: Math.max(0, segStart - 1),
              end: Math.min(videoDuration, segEnd + 1),
              title: `匹配片段 ${index}`,
              enabled: true,
              confidence: 0.7,
            });
            index++;
          }
          segStart = null;
        }
      }

      if (segStart !== null && segEnd - segStart >= 10) {
        slices.push({
          id: `custom-${index}`,
          start: Math.max(0, segStart - 1),
          end: Math.min(videoDuration, segEnd + 1),
          title: `匹配片段 ${index}`,
          enabled: true,
          confidence: 0.7,
        });
      }

      return slices;
    }

    default:
      throw new Error(`不支持的切片模式: ${mode}`);
  }
}

// ── 完整分析流水线 ──

export async function runAnalyzePipeline(
  videoUrl: string,
  outputDir: string,
  direction: Direction,
  options: AnalyzeClipOptions | AnalyzeSliceOptions,
  onProgress?: ProgressCallback
): Promise<AnalyzeResult> {
  const taskId = crypto.randomUUID();

  // 1. 下载视频
  onProgress?.('下载视频', 5);
  const videoPath = join(outputDir, 'input.mp4');
  const resp = await fetch(videoUrl);
  if (!resp.ok) throw new Error(`视频下载失败 HTTP ${resp.status}`);
  const videoBuffer = Buffer.from(await resp.arrayBuffer());
  writeFileSync(videoPath, videoBuffer);

  // 获取视频时长
  let videoDuration = 60; // 默认
  try {
    const { execFileSync: execFile } = await import('child_process');
    const result = execFile(FFMPEG_PATH, [
      '-i', videoPath,
      '-f', 'null', '-',
    ], { stdio: 'pipe', timeout: 30_000 }) as unknown as { stderr: Buffer; stdout: Buffer };
    const out = result.stderr.toString();
    const durMatch = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (durMatch) {
      videoDuration =
        parseInt(durMatch[1]) * 3600 +
        parseInt(durMatch[2]) * 60 +
        parseFloat(durMatch[3]);
    }
  } catch {
    // 无法获取时长，使用默认值
  }

  // 2. 提取音频
  onProgress?.('提取音频', 15);
  const audioPath = await extractAudio(videoPath, outputDir);

  // 3. 转写（仅需要文本分析的模式）
  let sentences: TimedSentence[] = [];

  if (direction === 'clip') {
    const clipOpts = options as AnalyzeClipOptions;
    const needsTranscription =
      clipOpts.mode === 'auto' || clipOpts.mode === 'by_description';
    if (needsTranscription) {
      onProgress?.('语音识别', 30);
      sentences = await transcribe(audioPath);
    }
  } else {
    const sliceOpts = options as AnalyzeSliceOptions;
    const needsTranscription =
      sliceOpts.mode === 'product' || sliceOpts.mode === 'topic' ||
      sliceOpts.mode === 'highlight' || sliceOpts.mode === 'custom';
    if (needsTranscription) {
      onProgress?.('语音识别', 30);
      sentences = await transcribe(audioPath);
    }
  }

  // 4. 分析
  onProgress?.('分析内容', 50);

  if (direction === 'clip') {
    const segments = await analyzeForClip(
      sentences, audioPath, videoDuration,
      options as AnalyzeClipOptions,
      (step, pct) => onProgress?.(step, 50 + pct * 0.4)
    );
    return { taskId, direction: 'clip', videoDuration, videoPath, audioPath, sentences, segments };
  } else {
    const slices = await analyzeForSlice(
      sentences, audioPath, videoDuration,
      options as AnalyzeSliceOptions,
      (step, pct) => onProgress?.(step, 50 + pct * 0.4)
    );
    return { taskId, direction: 'slice', videoDuration, videoPath, audioPath, sentences, slices };
  }
}

// ── 执行剪辑 ──

export async function executeClip(
  videoPath: string,
  segments: Array<{ start: number; end: number; action: 'keep' | 'cut' }>,
  outputDir: string,
  postProcess?: PostProcessOptions,
  onProgress?: ProgressCallback
): Promise<string> {
  onProgress?.('开始剪辑', 5);
  let output = await trimAndConcat(videoPath, segments, outputDir, (step, pct) => {
    onProgress?.(step, 5 + pct * 0.7);
  });

  if (postProcess) {
    onProgress?.('后处理', 80);
    output = await applyPostProcess(output, undefined, postProcess, outputDir);
  }

  onProgress?.('完成', 100);
  return output;
}

export async function executeSlice(
  videoPath: string,
  slices: Array<{ start: number; end: number; enabled: boolean; title?: string }>,
  outputDir: string,
  postProcess?: PostProcessOptions,
  onProgress?: ProgressCallback
): Promise<string[]> {
  onProgress?.('开始切分', 5);
  return extractSlices(videoPath, slices, outputDir, postProcess, (step, pct) => {
    onProgress?.(step, 5 + pct * 0.9);
  });
}
