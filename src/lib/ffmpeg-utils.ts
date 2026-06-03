// FFmpeg 视频处理工具
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

/** 执行 ffmpeg 命令，捕获 stderr 便于排查 */
function ffmpegExec(cmd: string): void {
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300_000 });
  } catch (e: unknown) {
    const execError = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const stderr = execError.stderr?.toString() || '';
    const stdout = execError.stdout?.toString() || '';
    const detail = (stderr + stdout).trim() || (e instanceof Error ? e.message : String(e));
    console.error('[ffmpeg] 命令失败:', cmd.substring(0, 120));
    console.error('[ffmpeg] 错误:', detail);
    throw new Error(`ffmpeg 执行失败: ${detail.substring(0, 300)}`);
  }
}

// ─── 字幕样式映射 ────────────────────────────────────────

const SUBTITLE_STYLE_MAP: Record<string, string> = {
  '白色粗体': 'FontSize=24,PrimaryColour=&HFFFFFF,Outline=2,Bold=1',
  '黄色描边': 'FontSize=24,PrimaryColour=&H00FFFF,Outline=2',
  '黑底白字': 'FontSize=24,PrimaryColour=&HFFFFFF,BackColour=&H80000000,Outline=0',
  '渐变彩色': 'FontSize=24,PrimaryColour=&HAA55FF,Outline=1',
};

const SUBTITLE_POSITION_MAP: Record<string, string> = {
  '底部': 'Alignment=2,MarginV=50',
  '中部': 'Alignment=5,MarginV=0',
  '顶部': 'Alignment=8,MarginV=50',
};

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
  const dir = join(tmpdir(), `linggan-${label}-${Date.now()}`);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function cleanupTempDir(dir: string): void {
  try {
    execSync(`rm -rf "${dir}"`);
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
export function concatVideos(inputPaths: string[], outputPath: string): string {
  const filelistPath = join(tmpdir(), `filelist-${Date.now()}.txt`);
  const content = inputPaths.map((p) => `file '${p}'`).join('\n');
  writeFileSync(filelistPath, content);

  try {
    ffmpegExec(
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
export function addBGM(
  videoPath: string,
  bgmStyle: string,
  outputPath: string
): string {
  // 风格降级映射: 若目标 mp3 不存在, 用最接近的本地 mp3 替代
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
    // 没有 BGM 文件时直接复制
    execSync(`cp "${videoPath}" "${outputPath}"`);
    return outputPath;
  }

  const volumeMap: Record<string, string> = { tech: '0.25', chill: '0.3', hype: '0.2', elegant: '0.22', energetic: '0.25' };
  const volume = volumeMap[bgmStyle] || '0.25';

  ffmpegExec(
    `${FFMPEG_PATH} -y -i "${videoPath}" -i "${bgmPath}" ` +
    `-filter_complex "[1:a]volume=${volume},afade=t=in:d=2,afade=t=out:st=9999:d=2[a]" ` +
    `-map 0:v -map "[a]" -c:v copy -shortest "${outputPath}"`
  );
  return outputPath;
}

/** 烧录字幕到视频 */
export function burnSubtitles(
  videoPath: string,
  srtPath: string,
  subtitleStyle: string,
  subtitlePosition: string,
  outputPath: string
): string {
  const styleStr = SUBTITLE_STYLE_MAP[subtitleStyle] || SUBTITLE_STYLE_MAP['白色粗体'];
  const positionStr = SUBTITLE_POSITION_MAP[subtitlePosition] || SUBTITLE_POSITION_MAP['底部'];

  ffmpegExec(
    `${FFMPEG_PATH} -y -i "${videoPath}" ` +
    `-vf "subtitles=${srtPath}:force_style='${styleStr},${positionStr}'" ` +
    `-c:a copy "${outputPath}"`
  );
  return outputPath;
}

/** 从视频中提取缩略图（第1秒帧） */
export function extractThumbnail(videoPath: string, outputPath: string): string {
  ffmpegExec(
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

  // 1. 拼接
  if (segmentPaths.length === 1) {
    // 单段直接复制，不需要 concat
    execSync(`cp "${segmentPaths[0]}" "${mergedPath}"`);
  } else {
    concatVideos(segmentPaths, mergedPath);
  }

  // 2. 生成并重新计算字幕时间轴（基于拼接后的累积时间）
  const adjustedStoryboard = adjustStoryboardTime(storyboard);
  generateSRT(adjustedStoryboard, srtPath);

  // 3. BGM
  addBGM(mergedPath, bgmStyle, withBgmPath);

  // 4. 字幕
  burnSubtitles(withBgmPath, srtPath, subtitleStyle, subtitlePosition, finalPath);

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
