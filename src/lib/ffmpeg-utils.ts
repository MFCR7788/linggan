// FFmpeg 视频处理工具
// 安全修复:
// - execSync → 异步 exec (避免阻塞事件循环)
// - shell rm/cp → fs API (避免命令注入)
// - Date.now() → crypto.randomUUID() (避免并发文件名冲突)
// - subtitle 参数校验 (避免 ffmpeg filter 注入)
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, mkdirSync, existsSync, unlinkSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

/** 异步执行 ffmpeg 命令 */
async function ffmpegExec(cmd: string): Promise<void> {
  try {
    await execAsync(cmd, { timeout: 300_000 });
  } catch (e: unknown) {
    const execError = e as { stderr?: string; stdout?: string; message?: string };
    const detail = (execError.stderr || '') + (execError.stdout || '') || (e instanceof Error ? e.message : String(e));
    console.error('[ffmpeg] 命令失败:', cmd.substring(0, 120));
    console.error('[ffmpeg] 错误:', detail.substring(0, 300));
    throw new Error(`ffmpeg 执行失败: ${detail.substring(0, 300)}`);
  }
}

// ─── 字幕样式映射 ────────────────────────────────────────

const SUBTITLE_STYLE_MAP: Record<string, string> = {
  '白色粗体': 'FontSize=24,PrimaryColour=&HFFFFFF,Outline=2,Bold=1',
  '黄色描边': 'FontSize=24,PrimaryColour=&H00FFFF,Outline=2',
  '黑底白字': 'FontSize=24,PrimaryColour=&HFFFFFF,BackColour=&H80000000,Outline=0',
  '渐变彩色': 'FontSize=24,PrimaryColour=&HAA55FF,Outline=1',
  // V4.0 扩展样式
  '抖音风格': 'FontSize=26,PrimaryColour=&HFFFFFF,Outline=3,Bold=1',
  '极简细体': 'FontSize=18,PrimaryColour=&HFFFFFF,Outline=0,Spacing=3',
  '霓虹效果': 'FontSize=22,PrimaryColour=&H0FF0FF,Outline=1,Shadow=3',
  '手写风格': 'FontSize=22,PrimaryColour=&HFFFFFF,Outline=1',
  '剧透弹幕': 'FontSize=20,PrimaryColour=&H0000FF,Outline=2,Bold=1',
  '卡拉OK': 'FontSize=24,PrimaryColour=&H00FFFF,Outline=2,Bold=1',
};

const SUBTITLE_POSITION_MAP: Record<string, string> = {
  '底部': 'Alignment=2,MarginV=50',
  '中部': 'Alignment=5,MarginV=0',
  '顶部': 'Alignment=8,MarginV=50',
  // V4.0 扩展位置
  '左下': 'Alignment=1,MarginV=50,MarginL=20',
  '右下': 'Alignment=3,MarginV=50,MarginR=20',
};

/** 安全获取字幕样式，仅允许预定义映射中的值 */
function getSubtitleStyle(style: string): string {
  return SUBTITLE_STYLE_MAP[style] || SUBTITLE_STYLE_MAP['白色粗体'];
}

/** 安全获取字幕位置，仅允许预定义映射中的值 */
function getSubtitlePosition(position: string): string {
  return SUBTITLE_POSITION_MAP[position] || SUBTITLE_POSITION_MAP['底部'];
}

// ─── 类型 ────────────────────────────────────────────────

export interface StoryboardScene {
  index: number;
  timeStart: number;
  timeEnd: number;
  duration: number;
  subtitle: string;
}

export interface MergeOptions {
  segmentPaths: string[];
  bgmStyle: 'tech' | 'chill' | 'hype' | 'elegant' | 'energetic' | 'auto';
  subtitleStyle: string;
  subtitlePosition: string;
  storyboard: StoryboardScene[];
  outputDir?: string;
}

// ─── 工具函数 ──────────────────────────────────────────────

export function getTempDir(label: string = 'video'): string {
  // 安全: label 仅用于目录名前缀，随机UUID防并发冲突
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 30) || 'video';
  const dir = join(tmpdir(), `linggan-${safeLabel}-${randomUUID()}`);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}

// ─── 核心功能 ──────────────────────────────────────────────

/** 下载视频到本地 */
export async function downloadVideo(url: string, outputPath: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载视频失败: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, buffer);
  return outputPath;
}

/** 拼接多个视频 */
export async function concatVideos(inputPaths: string[], outputPath: string): Promise<string> {
  const filelistPath = join(tmpdir(), `filelist-${randomUUID()}.txt`);
  const content = inputPaths.map((p) => `file '${p}'`).join('\n');
  writeFileSync(filelistPath, content);

  try {
    await ffmpegExec(
      `${FFMPEG_PATH} -y -f concat -safe 0 -i "${filelistPath}" -c copy "${outputPath}"`
    );
    return outputPath;
  } finally {
    try { unlinkSync(filelistPath); } catch {}
  }
}

/** 生成 SRT 字幕文件 */
export function generateSRT(storyboard: StoryboardScene[], outputPath: string): string {
  const lines: string[] = [];

  storyboard.forEach((scene, i) => {
    const startTime = formatSrtTime(scene.timeStart);
    const endTime = formatSrtTime(scene.timeEnd);
    lines.push(`${i + 1}`);
    lines.push(`${startTime} --> ${endTime}`);
    lines.push(scene.subtitle || '');
    lines.push('');
  });

  writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  return outputPath;
}

/** 混入背景音乐 */
export async function addBGM(
  videoPath: string,
  bgmStyle: string,
  outputPath: string
): Promise<string> {
  const BGM_FALLBACK: Record<string, string> = {
    elegant: 'chill',
    energetic: 'hype',
  };
  let actualStyle = bgmStyle;
  let bgmPath = join(process.cwd(), 'public', 'bgm', `${actualStyle}.mp3`);
  if (!existsSync(bgmPath) && BGM_FALLBACK[actualStyle]) {
    actualStyle = BGM_FALLBACK[actualStyle];
    bgmPath = join(process.cwd(), 'public', 'bgm', `${actualStyle}.mp3`);
  }
  if (!existsSync(bgmPath)) {
    console.warn(`[ffmpeg] BGM 文件不存在: ${bgmPath}，跳过BGM合成`);
    // 使用 fs.copyFileSync 替代 shell cp，避免命令注入
    copyFileSync(videoPath, outputPath);
    return outputPath;
  }

  const volumeMap: Record<string, string> = { tech: '0.25', chill: '0.3', hype: '0.2', elegant: '0.22', energetic: '0.25' };
  const volume = volumeMap[bgmStyle] || '0.25';

  await ffmpegExec(
    `${FFMPEG_PATH} -y -i "${videoPath}" -i "${bgmPath}" ` +
    `-filter_complex "[1:a]volume=${volume},afade=t=in:d=2,afade=t=out:st=9999:d=2[a]" ` +
    `-map 0:v -map "[a]" -c:v copy -shortest "${outputPath}"`
  );
  return outputPath;
}

/** 烧录字幕到视频 — 仅接受预定义映射中的样式值，防止 ffmpeg filter 注入 */
export async function burnSubtitles(
  videoPath: string,
  srtPath: string,
  subtitleStyle: string,
  subtitlePosition: string,
  outputPath: string
): Promise<string> {
  const styleStr = getSubtitleStyle(subtitleStyle);
  const positionStr = getSubtitlePosition(subtitlePosition);

  await ffmpegExec(
    `${FFMPEG_PATH} -y -i "${videoPath}" ` +
    `-vf "subtitles=${srtPath}:force_style='${styleStr},${positionStr}'" ` +
    `-c:a copy "${outputPath}"`
  );
  return outputPath;
}

/**
 * 增强字幕烧录 — 支持 ASS 格式 + 高级样式 + 双语字幕
 * V4.0 新增，与原 burnSubtitles() 并存
 *
 * 对于 ASS 格式字幕，直接使用 ass= 过滤器（保留 ASS 内的高级特效）
 * 对于 SRT 格式，回退到 subtitles= 过滤器
 */
export async function burnSubtitlesEnhanced(options: {
  videoPath: string;
  subtitlePath: string;
  format: 'srt' | 'ass';
  styleStr?: string;
  outputPath: string;
  fontsDir?: string;
}): Promise<string> {
  const { videoPath, subtitlePath, format, styleStr, outputPath, fontsDir } = options;

  let vfFilter: string;
  if (format === 'ass') {
    // ASS 格式：使用 ass= 过滤器，保留文件中内嵌的样式
    let assFilter = `ass=${subtitlePath}`;
    if (fontsDir) assFilter += `:fontsdir=${fontsDir}`;
    if (styleStr) assFilter += `:force_style='${styleStr}'`;
    vfFilter = assFilter;
  } else {
    // SRT 格式：使用 subtitles= 过滤器
    let subFilter = `subtitles=${subtitlePath}`;
    if (fontsDir) subFilter += `:fontsdir=${fontsDir}`;
    if (styleStr) subFilter += `:force_style='${styleStr}'`;
    vfFilter = subFilter;
  }

  await ffmpegExec(
    `${FFMPEG_PATH} -y -i "${videoPath}" ` +
    `-vf "${vfFilter}" ` +
    `-c:a copy "${outputPath}"`
  );
  return outputPath;
}

/** 从视频中提取缩略图（第1秒帧） */
export async function extractThumbnail(videoPath: string, outputPath: string): Promise<string> {
  await ffmpegExec(
    `${FFMPEG_PATH} -y -i "${videoPath}" -ss 00:00:01 -vframes 1 -q:v 2 "${outputPath}"`
  );
  return outputPath;
}

/** 完整合并流水线：拼接 + BGM + 字幕 */
export async function mergeVideoSegments(options: MergeOptions): Promise<string> {
  const { segmentPaths, bgmStyle, subtitleStyle, subtitlePosition, storyboard, outputDir } = options;
  const dir = outputDir || getTempDir('merge');
  const mergedPath = join(dir, 'merged.mp4');
  const withBgmPath = join(dir, 'with_bgm.mp4');
  const srtPath = join(dir, 'subtitle.srt');
  const finalPath = join(dir, 'final.mp4');

  // 1. 拼接 — 单段直接复制，避免不必要的 ffmpeg 调用
  if (segmentPaths.length === 1) {
    copyFileSync(segmentPaths[0], mergedPath);
  } else {
    await concatVideos(segmentPaths, mergedPath);
  }

  // 2. 生成并重新计算字幕时间轴（基于拼接后的累积时间）
  const adjustedStoryboard = adjustStoryboardTime(storyboard);
  generateSRT(adjustedStoryboard, srtPath);

  // 3. BGM
  await addBGM(mergedPath, bgmStyle, withBgmPath);

  // 4. 字幕
  await burnSubtitles(withBgmPath, srtPath, subtitleStyle, subtitlePosition, finalPath);

  return finalPath;
}

// ─── 辅助函数 ──────────────────────────────────────────────

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/** 重新计算分镜时间轴 — 将每个 scene 的相对时间转为合并后的累积时间 */
function adjustStoryboardTime(storyboard: StoryboardScene[]): StoryboardScene[] {
  let accumulated = 0;
  return storyboard.map((scene) => {
    const start = accumulated;
    accumulated += scene.duration;
    return {
      ...scene,
      timeStart: start,
      timeEnd: accumulated,
    };
  });
}
