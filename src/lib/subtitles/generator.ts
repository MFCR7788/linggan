// 字幕文件生成器 — 支持 SRT 和 ASS 格式
// ASS 格式支持卡拉OK逐字高亮、双语字幕等高级特性

import { writeFileSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import type {
  SubtitleStyle,
  SubtitleLayout,
  SubtitleAnimation,
  DualSubtitleConfig,
  OptimizedSubtitle,
} from './types';

/** 将秒数格式化为 SRT 时间戳 */
function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/** 将秒数格式化为 ASS 时间戳 */
function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

/** 生成 ASS 样式字符串 */
function buildASSStyle(style: SubtitleStyle): string {
  const parts = [
    `Fontname=${style.fontName}`,
    `Fontsize=${style.fontSize}`,
    `PrimaryColour=${style.primaryColor}`,
    `OutlineColour=${style.outlineColor}`,
    `Outline=${style.outline}`,
    `Shadow=${style.shadow}`,
    `Bold=${style.bold}`,
    `Spacing=${style.spacing}`,
    'BorderStyle=1',
    'Alignment=2',
  ];
  if (style.backColor) parts.push(`BackColour=${style.backColor}`);
  if (style.secondaryColor) parts.push(`SecondaryColour=${style.secondaryColor}`);
  return parts.join(',');
}

/** 生成 ASS 文件头 */
function buildASSHeader(style: SubtitleStyle, layout: SubtitleLayout): string {
  const playResX = 1080;
  const playResY = 1920;
  return [
    '[Script Info]',
    'Title: 灵集 AI 字幕',
    'ScriptType: v4.00+',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Default,${style.fontName},${style.fontSize},${style.primaryColor},${style.secondaryColor || style.primaryColor},${style.outlineColor},${style.backColor || '&H00000000&'},${style.bold},0,0,0,100,100,${style.spacing},0,1,${style.outline},${style.shadow},${layout.alignment},${layout.marginL},${layout.marginR},${layout.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');
}

// ─── 公开 API ─────────────────────────────────────────────────

/**
 * 生成 SRT 字幕文件
 */
export function generateSRT(
  subtitles: OptimizedSubtitle[],
  outputPath: string
): string {
  const lines: string[] = [];
  subtitles.forEach((sub, i) => {
    lines.push(String(i + 1));
    lines.push(`${formatSRTTime(sub.startTime)} --> ${formatSRTTime(sub.endTime)}`);
    lines.push(sub.text);
    lines.push(''); // 空行分隔
  });

  ensureDir(outputPath);
  writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  return outputPath;
}

/**
 * 生成 ASS 字幕文件（支持高级特效）
 *
 * ASS 格式支持：
 * - 卡拉OK 逐字高亮 ({\kf...} 标签)
 * - 渐变色彩 (SecondaryColour)
 * - 双语字幕
 * - 淡入淡出动画
 */
export function generateASS(
  subtitles: OptimizedSubtitle[],
  outputPath: string,
  style: SubtitleStyle,
  layout: SubtitleLayout,
  options?: {
    animation?: SubtitleAnimation;
    dual?: DualSubtitleConfig;
  }
): string {
  const header = buildASSHeader(style, layout);
  const events: string[] = [];

  subtitles.forEach((sub) => {
    let text = escapeASSText(sub.text);

    // 动画效果
    if (options?.animation === 'karaoke' || style.karaoke) {
      text = applyKaraokeEffect(text, sub.startTime, sub.endTime);
    } else if (options?.animation === 'fadeIn') {
      text = applyFadeInEffect(text, sub.startTime, sub.endTime);
    } else if (options?.animation === 'typewriter') {
      text = applyTypewriterEffect(text, sub.startTime, sub.endTime);
    }

    events.push(
      `Dialogue: 0,${formatASSTime(sub.startTime)},${formatASSTime(sub.endTime)},Default,,0,0,0,,${text}`
    );

    // 双语字幕
    if (options?.dual?.enabled && sub.translation) {
      const dualStyle = options.dual.position === 'above'
        ? layout.alignment === 2 ? 8 : layout.alignment  // 底部→顶部
        : layout.alignment;
      const dualMarginV = options.dual.position === 'above'
        ? layout.marginV + 40
        : layout.marginV;

      events.push(
        `Dialogue: 0,${formatASSTime(sub.startTime)},${formatASSTime(sub.endTime)},Default,,0,0,${dualMarginV},,{\\fs${Math.floor(style.fontSize * (options.dual.fontSizeRatio || 0.7))}}${escapeASSText(sub.translation)}`
      );
    }
  });

  ensureDir(outputPath);
  writeFileSync(outputPath, header + '\n' + events.join('\n'), 'utf-8');
  return outputPath;
}

// ─── 特效辅助函数 ────────────────────────────────────────────

function escapeASSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\N');
}

/** 卡拉OK 逐字高亮：用 {\k} 标签将文本分割为逐字显示 */
function applyKaraokeEffect(text: string, _startTime: number, _endTime: number): string {
  const chars = text.replace(/\s/g, '').split('');
  if (chars.length <= 1) return text;
  const duration = _endTime - _startTime;
  const centiPerChar = Math.floor((duration * 100) / chars.length);
  return `{\\kf${centiPerChar}}${chars.join(`{\\k${centiPerChar}}`)}`;
}

/** 淡入效果 */
function applyFadeInEffect(text: string, startTime: number, _endTime: number): string {
  const fadeDuration = Math.min(300, Math.floor((_endTime - startTime) * 300));
  return `{\\fad(${fadeDuration},0)}${text}`;
}

/** 打字机效果：逐字出现 */
function applyTypewriterEffect(text: string, startTime: number, endTime: number): string {
  return applyKaraokeEffect(text, startTime, endTime);
}

/** 确保输出目录存在 */
function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
}
