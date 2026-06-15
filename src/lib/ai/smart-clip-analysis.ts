// 智能剪辑规则引擎 — 静音检测 / 口水词检测 / 重复检测
// 纯信号处理 + 文本分析，不依赖 LLM，免费

import { exec } from 'child_process';
import { promisify } from 'util';
import type { TimedSentence } from '@/lib/video-transcriber';

const execAsync = promisify(exec);
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

// ── 类型 ──

export interface SilenceRange {
  start: number;
  end: number;
  duration: number;
}

export interface FillerRange {
  start: number;
  end: number;
  text: string;
}

export interface RepetitionRange {
  start: number;
  end: number;
  similarToStart: number;
  similarToEnd: number;
  similarity: number;
}

export interface SegmentAnalysis {
  start: number;
  end: number;
  text: string;
  recommendation: 'keep' | 'cut';
  reason: string;
  confidence: number;
}

// ── 静音检测 (FFmpeg silencedetect) ──

export async function detectSilence(
  audioPath: string,
  threshold: number = -30,
  minDuration: number = 2.0
): Promise<SilenceRange[]> {
  try {
    const { stderr } = await execAsync(
      `${FFMPEG_PATH} -i "${audioPath}" -af "silencedetect=n=${threshold}dB:d=${minDuration}" -f null -`,
      { timeout: 120_000 }
    );

    const ranges: SilenceRange[] = [];
    const lines = stderr.split('\n');
    let currentStart: number | null = null;

    for (const line of lines) {
      const startMatch = line.match(/silence_start:\s*([\d.]+)/);
      const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);

      if (startMatch) {
        currentStart = parseFloat(startMatch[1]);
      }
      if (endMatch && currentStart !== null) {
        ranges.push({
          start: currentStart,
          end: parseFloat(endMatch[1]),
          duration: parseFloat(endMatch[2]),
        });
        currentStart = null;
      }
    }

    return ranges;
  } catch (e: unknown) {
    // silencedetect 即使成功也会返回非零退出码（ffmpeg 特性），从 stderr 解析
    const err = e as { stderr?: string; stdout?: string };
    const output = (err.stderr || '') + (err.stdout || '');
    const ranges: SilenceRange[] = [];
    const lines = output.split('\n');
    let currentStart: number | null = null;

    for (const line of lines) {
      const startMatch = line.match(/silence_start:\s*([\d.]+)/);
      const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);

      if (startMatch) currentStart = parseFloat(startMatch[1]);
      if (endMatch && currentStart !== null) {
        ranges.push({
          start: currentStart,
          end: parseFloat(endMatch[1]),
          duration: parseFloat(endMatch[2]),
        });
        currentStart = null;
      }
    }

    return ranges;
  }
}

// ── 口水词检测 ──

const FILLER_PATTERNS = [
  /^[嗯呃啊哦额嗯]+$/,
  /^那个+$/,
  /^就是说+$/,
  /^然后然后+$/,
  /^这个这个+$/,
  /^怎么说呢+$/,
  /^完了以后+$/,
  /^那么+$/,
  /^所以呢+$/,
  /^我想一下+$/,
  /^呃?嗯?那[个么]?$/,
];

function isFiller(text: string): boolean {
  const cleaned = text.replace(/\s+/g, '').replace(/[，。！？、,\.!\?]/g, '');
  if (cleaned.length === 0) return true;
  if (cleaned.length <= 3 && FILLER_PATTERNS.some((p) => p.test(cleaned))) {
    return true;
  }
  // 纯标点或单字重复
  if (/^(.)\1{2,}$/.test(cleaned) && cleaned.length <= 4) return true;
  return false;
}

export function detectFillers(
  sentences: TimedSentence[],
  minLength: number = 0.3
): FillerRange[] {
  const fillers: FillerRange[] = [];

  for (const s of sentences) {
    const text = s.text?.trim() || '';
    if (!text) continue;

    const duration = (s.end_time - s.begin_time) / 1000;
    if (isFiller(text) && duration >= minLength) {
      fillers.push({
        start: s.begin_time / 1000,
        end: s.end_time / 1000,
        text,
      });
    }
  }

  return fillers;
}

// ── 重复检测 ──

function tokenize(text: string): Set<string> {
  const cleaned = text.replace(/[^一-鿿\w]/g, '');
  const bigrams = new Set<string>();
  for (let i = 0; i < cleaned.length - 1; i++) {
    bigrams.add(cleaned.substring(i, i + 2));
  }
  return bigrams;
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function detectRepetition(
  sentences: TimedSentence[],
  minSimilarity: number = 0.65
): RepetitionRange[] {
  const repetitions: RepetitionRange[] = [];
  const meaningful = sentences.filter((s) => {
    const t = s.text?.trim() || '';
    return t.length > 5 && !isFiller(t);
  });

  for (let i = 0; i < meaningful.length; i++) {
    for (let j = i + 1; j < Math.min(i + 10, meaningful.length); j++) {
      const sim = jaccardSimilarity(
        meaningful[i].text?.trim() || '',
        meaningful[j].text?.trim() || ''
      );
      if (sim >= minSimilarity) {
        repetitions.push({
          start: meaningful[j].begin_time / 1000,
          end: meaningful[j].end_time / 1000,
          similarToStart: meaningful[i].begin_time / 1000,
          similarToEnd: meaningful[i].end_time / 1000,
          similarity: sim,
        });
      }
    }
  }

  return repetitions;
}

// ── 合并分段 ──

export function mergeAnalyses(
  silenceRanges: SilenceRange[],
  fillerRanges: FillerRange[],
  repetitionRanges: RepetitionRange[],
  totalDuration: number,
  gapThreshold: number = 0.5
): SegmentAnalysis[] {
  const cuts: Array<{ start: number; end: number; reason: string; confidence: number }> = [];

  for (const s of silenceRanges) {
    cuts.push({
      start: s.start,
      end: s.end,
      reason: `静音 ${s.duration.toFixed(1)}s`,
      confidence: 0.95,
    });
  }

  for (const f of fillerRanges) {
    cuts.push({
      start: f.start,
      end: f.end,
      reason: `口水词: ${f.text}`,
      confidence: 0.85,
    });
  }

  for (const r of repetitionRanges) {
    cuts.push({
      start: r.start,
      end: r.end,
      reason: `重复内容 (相似度 ${(r.similarity * 100).toFixed(0)}%)`,
      confidence: 0.75,
    });
  }

  // 按起始时间排序
  cuts.sort((a, b) => a.start - b.start);

  // 合并重叠或相邻的 cut 区间
  const merged: typeof cuts = [];
  for (const cut of cuts) {
    const last = merged[merged.length - 1];
    if (last && cut.start - last.end <= gapThreshold) {
      last.end = Math.max(last.end, cut.end);
      last.reason = [last.reason, cut.reason].join('; ');
      last.confidence = Math.max(last.confidence, cut.confidence);
    } else {
      merged.push({ ...cut });
    }
  }

  // 生成完整的 keep/cut 分段
  const segments: SegmentAnalysis[] = [];
  let cursor = 0;

  for (const cut of merged) {
    if (cut.start > cursor + 0.1) {
      segments.push({
        start: cursor,
        end: cut.start,
        text: '',
        recommendation: 'keep',
        reason: '内容保留',
        confidence: 1,
      });
    }
    segments.push({
      start: Math.max(cut.start, cursor),
      end: cut.end,
      text: '',
      recommendation: 'cut',
      reason: cut.reason,
      confidence: cut.confidence,
    });
    cursor = cut.end;
  }

  if (cursor < totalDuration - 0.1) {
    segments.push({
      start: cursor,
      end: totalDuration,
      text: '',
      recommendation: 'keep',
      reason: '内容保留',
      confidence: 1,
    });
  }

  return segments;
}
