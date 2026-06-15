// AI 封面生成器 — 智能选帧 + AI 标题 + 风格模板合成
// FFmpeg 抽帧 + sharp 评分/合成 + DeepSeek 标题生成

import { join } from 'path';
import { execFileSync } from 'child_process';
import { callDeepSeek } from '@/lib/ai-services';
import sharp from 'sharp';

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

// ── 类型 ──

export type CoverStyle = '大字报' | '上下分割' | '左右分割' | '居中贴纸';
export type TitleStyle = '悬念' | '数字' | '痛点' | '对比';

export interface Keyframe {
  path: string;
  time: number;      // 秒
  score: number;      // 0-100
  sharpness: number;
  contrast: number;
  saturation: number;
}

export interface CoverOptions {
  videoUrl: string;
  selectedFrame?: number;   // 选第几帧 (0-2)
  customTitle?: string;
  titleStyle?: TitleStyle;
  coverStyle?: CoverStyle;
  outputWidth?: number;
  outputHeight?: number;
}

export interface CoverResult {
  keyframes: Keyframe[];
  titles: string[];
  coverPath: string;
  coverBuffer: Buffer;
}

// ── 步骤 1: 抽取候选帧 ──

export async function extractKeyframes(
  videoPath: string,
  outputDir: string,
  interval: number = 1.0,
  maxFrames: number = 30,
): Promise<string[]> {
  const frames: string[] = [];

  try {
    // 先获取时长
    const probeOut = execFileSync(FFMPEG_PATH, [
      '-i', videoPath,
      '-f', 'null', '-',
    ], { stdio: 'pipe', timeout: 30_000 }) as unknown as { stderr: Buffer };
    const durMatch = probeOut.stderr.toString().match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    const duration = durMatch
      ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3])
      : 60;

    const frameCount = Math.min(maxFrames, Math.floor(duration / interval));

    for (let i = 0; i < frameCount; i++) {
      const time = i * interval + interval / 2;
      if (time >= duration) break;

      const framePath = join(outputDir, `frame_${String(i).padStart(3, '0')}.jpg`);
      execFileSync(FFMPEG_PATH, [
        '-y', '-ss', String(time),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        framePath,
      ], { stdio: 'pipe', timeout: 10_000 });

      frames.push(framePath);
    }
  } catch (e) {
    const err = e as { stderr?: Buffer; message?: string };
    throw new Error(`关键帧提取失败: ${err.stderr?.toString().substring(0, 200) || (e instanceof Error ? e.message : String(e))}`);
  }

  return frames;
}

// ── 步骤 2: 帧评分 ──

export async function scoreFrames(framePaths: string[]): Promise<Keyframe[]> {
  const keyframes: Keyframe[] = [];

  for (const path of framePaths) {
    try {
      const img = sharp(path);
      const stats = await img.stats();

      // 清晰度 = 各通道标准差之和均值（越高越清晰）
      const sharpness = stats.channels.reduce((sum: number, c) => sum + c.stdev, 0) / stats.channels.length;

      // 对比度 = 亮度通道的 max - min
      const lumChannel = stats.channels[0]; // approximate
      const contrast = lumChannel ? (lumChannel.max - lumChannel.min) : 0;

      // 饱和度 = RGB 通道 stdev 之和（色彩丰富度）
      const saturation = stats.channels.slice(0, 3).reduce((sum: number, c) => sum + c.stdev, 0);

      // 综合评分：清晰度 40% + 对比度 35% + 饱和度 25%
      const sharpnessScore = Math.min(100, (sharpness / 80) * 100);
      const contrastScore = Math.min(100, (contrast / 200) * 100);
      const saturationScore = Math.min(100, (saturation / 120) * 100);

      const score = sharpnessScore * 0.4 + contrastScore * 0.35 + saturationScore * 0.25;

      keyframes.push({
        path,
        time: 0, // 时间由调用方填入
        score: Math.round(score),
        sharpness: Math.round(sharpnessScore),
        contrast: Math.round(contrastScore),
        saturation: Math.round(saturationScore),
      });
    } catch {
      keyframes.push({ path, time: 0, score: 0, sharpness: 0, contrast: 0, saturation: 0 });
    }
  }

  // 按评分降序
  keyframes.sort((a, b) => b.score - a.score);
  return keyframes;
}

// ── 步骤 3: 生成标题 ──

export async function generateCoverTitles(
  description: string,
  style: TitleStyle = '悬念',
  count: number = 5,
): Promise<string[]> {
  const stylePrompts: Record<TitleStyle, string> = {
    '悬念': '制造好奇和悬念，让用户忍不住点开',
    '数字': '突出数据和量化结果，增强可信度',
    '痛点': '直击用户痛点，引起共鸣',
    '对比': '前后对比或竞品对比，突出差异',
  };

  const prompt = `你是短视频封面标题专家。根据内容，生成${count}个封面标题。
内容：${description}
风格：${stylePrompts[style] || '有冲击力'}

要求：每个标题 ≤ 15 字，简短有力，有视觉冲击力，适合竖屏阅读。
返回 JSON 数组：["标题1", "标题2", ...]`;

  const systemPrompt = '你是封面标题专家。只返回 JSON 数组。';
  const response = await callDeepSeek(
    `${systemPrompt}\n\n${prompt}`,
    { temperature: 0.8, maxTokens: 500 },
  );

  const match = response.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch { /* fall through */ }
  }

  // fallback: 按行拆分
  return response.split('\n')
    .map((l: string) => l.replace(/^\d+[\.\、\)]\s*/, '').replace(/["\[\],]/g, '').trim())
    .filter(Boolean)
    .slice(0, count);
}

// ── 步骤 4: 合成封面 ──

export async function compositeCover(
  framePath: string,
  title: string,
  outputDir: string,
  options: {
    style?: CoverStyle;
    width?: number;
    height?: number;
    fontSize?: number;
    fontColor?: string;
    bgOpacity?: number;
  } = {},
): Promise<{ path: string; buffer: Buffer }> {
  const {
    style = '大字报',
    width = 1080,
    height = 1920,
    fontSize = 72,
    fontColor = '#FFFFFF',
    bgOpacity = 0.5,
  } = options;

  const bg = sharp(framePath).resize(width, height, { fit: 'cover', position: 'center' });

  // 用 SVG 合成文字叠层
  const svgOverlay = buildCoverSVG(title, width, height, style, fontSize, fontColor, bgOpacity);
  const overlayBuffer = Buffer.from(svgOverlay);

  const outputPath = join(outputDir, 'cover.png');
  await bg
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  const buffer = await sharp(outputPath).png().toBuffer();
  return { path: outputPath, buffer };
}

function buildCoverSVG(
  title: string,
  width: number,
  height: number,
  style: CoverStyle,
  fontSize: number,
  fontColor: string,
  bgOpacity: number,
): string {
  const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  switch (style) {
    case '大字报': {
      // 竖排大字，高对比，标题占满中央
      const chars = title.split('');
      const lineHeight = fontSize * 0.9;
      const totalHeight = chars.length * lineHeight;
      const startY = (height - totalHeight) / 2;
      const centerX = width / 2;

      const textElements = chars.map((char, i) => {
        const y = startY + i * lineHeight + fontSize * 0.7;
        return `<text x="${centerX}" y="${y}" text-anchor="middle" font-size="${fontSize}" font-weight="900" fill="${fontColor}" font-family="sans-serif" letter-spacing="8">${escapeXml(char)}</text>`;
      }).join('\n');

      // 半透明底色条
      const bgTop = startY - 20;
      const bgHeight = totalHeight + 40;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect x="${centerX - fontSize * 0.7}" y="${bgTop}" width="${fontSize * 1.4}" height="${bgHeight}" rx="12" fill="rgba(0,0,0,${bgOpacity})"/>
        ${textElements}
      </svg>`;
    }

    case '上下分割': {
      // 上图下标题，底部大色块 + 标题
      const bgHeight = fontSize * 2.5;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect x="0" y="${height - bgHeight}" width="${width}" height="${bgHeight}" fill="rgba(0,0,0,${bgOpacity + 0.15})"/>
        <text x="${width / 2}" y="${height - bgHeight / 2 + fontSize * 0.35}" text-anchor="middle" font-size="${fontSize}" font-weight="800" fill="${fontColor}" font-family="sans-serif">${escapeXml(title)}</text>
      </svg>`;
    }

    case '左右分割': {
      // 左图右标题
      const textX = width * 0.55;
      const textY = height / 2;
      const maxWidth = width * 0.4;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect x="${width * 0.5}" y="0" width="${width * 0.5}" height="${height}" fill="rgba(0,0,0,${bgOpacity + 0.1})"/>
        ${wrapText(title, textX, textY, fontSize, maxWidth, fontColor, 'middle', '800')}
      </svg>`;
    }

    case '居中贴纸': {
      // 标题叠在图上，半透明圆角底色
      const boxWidth = Math.min(width * 0.85, title.length * fontSize * 0.7 + 60);
      const boxHeight = fontSize * 1.8;
      const boxX = (width - boxWidth) / 2;
      const boxY = height * 0.72 - boxHeight / 2;
      const textY = boxY + boxHeight / 2 + fontSize * 0.35;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="${boxHeight / 2}" fill="rgba(0,0,0,${bgOpacity})"/>
        <text x="${width / 2}" y="${textY}" text-anchor="middle" font-size="${fontSize}" font-weight="800" fill="${fontColor}" font-family="sans-serif">${escapeXml(title)}</text>
      </svg>`;
    }

    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`;
  }
}

function wrapText(
  text: string,
  cx: number,
  cy: number,
  fontSize: number,
  maxWidth: number,
  color: string,
  anchor: string,
  weight: string,
): string {
  // 简单实现：逐字换行
  const chars = text.split('');
  const lines: string[] = [];
  let currentLine = '';
  for (const char of chars) {
    if ((currentLine + char).length * fontSize * 0.7 > maxWidth) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine += char;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  const startY = cy - totalHeight / 2 + fontSize;

  return lines.map((line, i) =>
    `<text x="${cx}" y="${startY + i * lineHeight}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="${weight}" fill="${color}" font-family="sans-serif">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</text>`
  ).join('\n');
}

// ── 完整流水线 ──

export async function generateCover(
  videoPath: string,
  outputDir: string,
  options: {
    selectedFrame?: number;
    customTitle?: string;
    titleStyle?: TitleStyle;
    coverStyle?: CoverStyle;
    description?: string;
  } = {},
): Promise<CoverResult> {
  // 1. 提取候选帧
  const framePaths = await extractKeyframes(videoPath, outputDir);

  // 2. 评分
  const scored = await scoreFrames(framePaths);
  const top3 = scored.slice(0, 3);

  // 3. 生成标题
  let titles: string[] = [];
  if (!options.customTitle && options.description) {
    titles = await generateCoverTitles(options.description, options.titleStyle || '悬念', 5);
  }

  // 4. 合成封面（使用 top-1 帧 + 第一个标题）
  const selectedIdx = options.selectedFrame || 0;
  const frameIdx = Math.min(selectedIdx, top3.length - 1);
  const title = options.customTitle || titles[0] || '精彩内容';
  const { path, buffer } = await compositeCover(
    top3[frameIdx]?.path || framePaths[0],
    title,
    outputDir,
    { style: options.coverStyle || '大字报' },
  );

  return { keyframes: top3, titles, coverPath: path, coverBuffer: buffer };
}
