// 本地视频剪辑执行器 — 将 EditPlan 转为 ffmpeg.wasm 命令在浏览器中执行
// 0 灵力消耗，纯本地 GPU/CPU 硬编解码

import type { EditPlan, EditOperation } from './types';

export interface ExecutorProgress {
  /** 当前步骤索引 (0-based) */
  step: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 当前操作标签 */
  label: string;
  /** 当前步骤进度 0-100 */
  progress: number;
}

export interface ExecutorResult {
  /** 输出文件 Blob */
  blob: Blob;
  /** 输出文件名 */
  name: string;
  /** 输出格式 */
  format: string;
}

type ProgressCb = (p: ExecutorProgress) => void;

/**
 * 将 EditPlan 转为 ffmpeg 命令数组。
 * 在 Web Worker 中运行 ffmpeg.wasm 时，逐条执行这些命令。
 */
export function planToFfmpegCommands(plan: EditPlan): string[][] {
  const commands: string[][] = [];
  let currentInput = plan.inputs[0]?.name || 'input.mp4';

  for (const op of plan.operations) {
    const args = opToArgs(op, currentInput);
    commands.push(args);

    // 更新当前输入引用（下一步操作的 source）
    if (op.type === 'merge' || op.type === 'trim' || op.type === 'transcode' ||
        op.type === 'audio_overlay' || op.type === 'audio_replace' ||
        op.type === 'speed' || op.type === 'subtitle') {
      // 中间产物命名
      const stepIndex = commands.length;
      currentInput = `step_${stepIndex}.mp4`;
    }
  }

  return commands;
}

function opToArgs(op: EditOperation, inputFile: string): string[] {
  switch (op.type) {
    case 'trim': {
      const duration = op.end - op.start;
      return ['-ss', String(op.start), '-i', inputFile, '-t', String(duration), '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-y', getOutputFile(op, inputFile)];
    }
    case 'transcode': {
      const fpsArg = op.fps ? ['-r', String(op.fps)] : [];
      return ['-i', inputFile, ...fpsArg, '-vf', `scale=${op.width}:${op.height}:force_original_aspect_ratio=decrease,pad=${op.width}:${op.height}:(ow-iw)/2:(oh-ih)/2`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-y', getOutputFile(op, inputFile)];
    }
    case 'merge': {
      // concat: 将所有源文件列在 filter_complex 中
      const inputs = op.sources.flatMap(s => ['-i', s]);
      const filterParts = op.sources.map((_, i) => `[${i}:v:0][${i}:a:0]`).join('');
      return [...inputs, '-filter_complex', `${filterParts}concat=n=${op.sources.length}:v=1:a=1[v][a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-y', getOutputFile(op, inputFile)];
    }
    case 'audio_overlay': {
      const volume = op.volume ?? 0.3;
      return ['-i', inputFile, '-i', op.audioUrl, '-filter_complex', `[1:a]volume=${volume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-y', getOutputFile(op, inputFile)];
    }
    case 'audio_replace':
      return ['-i', inputFile, '-i', op.audioUrl, '-c:v', 'copy', '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-c:a', 'aac', '-b:a', '192k', '-y', getOutputFile(op, inputFile)];
    case 'speed': {
      const rate = op.rate;
      const setpts = rate > 1 ? `setpts=${(1 / rate).toFixed(2)}*PTS` : `setpts=${(1 / rate).toFixed(2)}*PTS`;
      return ['-i', inputFile, '-filter_complex', `[0:v]${setpts}[v];[0:a]atempo=${rate}[a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-y', getOutputFile(op, inputFile)];
    }
    case 'subtitle': {
      // 生成 SRT 字幕文件内容，通过 pipe 或临时文件传入
      const srtContent = op.subtitles.map((sub, i) =>
        `${i + 1}\n${secondsToSrtTime(sub.start)} --> ${secondsToSrtTime(sub.end)}\n${sub.text}\n`
      ).join('\n');
      // ffmpeg 需要字幕文件路径，此处生成一个临时文件引用
      const subtitleFile = `subs_${Date.now()}.srt`;
      return ['-i', inputFile, '-vf', `subtitles=${subtitleFile}:force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2'`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'copy', '-y', getOutputFile(op, inputFile)];
    }
    default:
      return ['-i', inputFile, '-c', 'copy', '-y', getOutputFile(op, inputFile)];
  }
}

function getOutputFile(op: EditOperation, inputFile: string): string {
  const base = inputFile.replace(/\.[^.]+$/, '');
  return `${base}_${op.type}.mp4`;
}

function secondsToSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

/**
 * 估算剪辑方案执行时间（秒）
 */
export function estimateDuration(plan: EditPlan): number {
  let total = 0;
  for (const op of plan.operations) {
    switch (op.type) {
      case 'trim': total += 3; break;
      case 'transcode': total += plan.output.estimatedSeconds * 0.5; break;
      case 'merge': total += plan.output.estimatedSeconds * 0.8; break;
      case 'audio_overlay': total += plan.output.estimatedSeconds * 0.3; break;
      case 'audio_replace': total += 5; break;
      case 'speed': total += plan.output.estimatedSeconds * 0.6; break;
      case 'subtitle': total += plan.output.estimatedSeconds * 0.4; break;
      default: total += 5;
    }
  }
  return Math.max(3, Math.ceil(total));
}
