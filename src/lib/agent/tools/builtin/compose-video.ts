// 视频合成工具 — 分镜图序列 → 完整视频
// 底层：ffmpeg 图片转视频片段 + 拼接 + BGM混音 + 字幕烧录
// 服务端需要安装 ffmpeg

import type { ToolDefinition } from '../../types';
import { execFileSync, execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createAdminClient } from '@/lib/supabase-server';
import { saveMediaToInspiration } from '../save-media-helper';

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

// ── 类型 ──

interface VideoScene {
  imageUrl: string;
  duration: number; // 秒
  subtitle?: string;
}

// ── 常量 ──

const RATIO_MAP: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

const BGM_FILES: Record<string, string> = {
  tech: 'tech.mp3',
  chill: 'chill.mp3',
  hype: 'hype.mp3',
  elegant: 'chill.mp3', // fallback
  energetic: 'hype.mp3', // fallback
  auto: 'chill.mp3',
};

const SUBTITLE_STYLES: Record<string, string> = {
  '白色粗体': 'FontSize=24,PrimaryColour=&HFFFFFF,Outline=2,Bold=1',
  '黄色描边': 'FontSize=24,PrimaryColour=&H00FFFF,Outline=2',
  '黑底白字': 'FontSize=24,PrimaryColour=&HFFFFFF,BackColour=&H80000000,Outline=0',
  '渐变彩色': 'FontSize=24,PrimaryColour=&HAA55FF,Outline=1',
};

const SUBTITLE_POSITIONS: Record<string, string> = {
  '底部': 'Alignment=2,MarginV=50',
  '中部': 'Alignment=5,MarginV=0',
  '顶部': 'Alignment=8,MarginV=50',
};

// ── 工具函数 ──

function ffmpegArgs(args: string[]): void {
  try {
    execFileSync(FFMPEG_PATH, args, { stdio: 'pipe', timeout: 300_000 });
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const detail = (err.stderr?.toString() || '') + (err.stdout?.toString() || '') || (e instanceof Error ? e.message : String(e));
    throw new Error(`ffmpeg 失败: ${detail.substring(0, 300)}`);
  }
}

function ffmpeg(cmd: string): void {
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300_000 });
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const detail = (err.stderr?.toString() || '') + (err.stdout?.toString() || '') || (e instanceof Error ? e.message : String(e));
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

function getTempDir(label: string): string {
  const dir = join(tmpdir(), `lingji-compose-${label}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function generateSRT(scenes: VideoScene[]): string {
  const lines: string[] = [];
  let cursor = 0;
  scenes.forEach((scene, i) => {
    const start = cursor;
    const end = cursor + scene.duration;
    cursor = end;
    if (scene.subtitle) {
      lines.push(`${i + 1}`);
      lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
      lines.push(scene.subtitle);
      lines.push('');
    }
  });
  return lines.join('\n');
}

// ── Handler ──

export const composeVideoTool: ToolDefinition = {
  name: 'compose_video',
  description: `将多张图片合成为视频幻灯片，支持背景音乐、字幕叠加、口播音频。
这是视频合成/拼接工具，用于将分镜图序列合成最终视频。当用户要求"合成视频"、"把图片做成视频"、"生成带货视频"、"图片加BGM"、"幻灯片视频"时调用。

与 generate_video 的区别：
- generate_video：AI 文生视频/图生视频（AI 生成画面内容）
- compose_video：将已有图片拼接成带 BGM 和字幕的视频（合成+编辑）

需要先有图片（如 generate_image 生成的分镜图），再用此工具合成。`,
  isLongRunning: true,
  parameters: {
    type: 'object',
    properties: {
      scenes: {
        type: 'array',
        description: '分镜场景列表。每个场景包含图片URL、持续时长（秒）、可选字幕。',
        items: {
          type: 'object',
          properties: {
            imageUrl: { type: 'string', description: '图片 URL' },
            duration: { type: 'number', description: '该画面持续时长（秒），默认 3' },
            subtitle: { type: 'string', description: '该画面对应的字幕文字（可选）' },
          },
          required: ['imageUrl'],
        },
      },
      bgmStyle: {
        type: 'string',
        enum: ['tech', 'chill', 'hype', 'elegant', 'energetic', 'auto', 'none'],
        description: '背景音乐风格。tech(科技轻电), chill(舒缓), hype(潮流), elegant(优雅), energetic(活力), auto(自动), none(无BGM)。默认 auto',
      },
      ratio: {
        type: 'string',
        enum: ['9:16', '16:9', '1:1'],
        description: '视频比例。9:16(竖屏/抖音), 16:9(横屏/B站), 1:1(方形)。默认 9:16',
      },
      subtitleStyle: {
        type: 'string',
        enum: ['白色粗体', '黄色描边', '黑底白字', '渐变彩色'],
        description: '字幕样式，默认"白色粗体"',
      },
      subtitlePosition: {
        type: 'string',
        enum: ['底部', '中部', '顶部'],
        description: '字幕位置，默认"底部"',
      },
      audioUrl: {
        type: 'string',
        description: '可选的口播音频 URL（可与 synthesize_speech 工具配合使用）',
      },
      title: {
        type: 'string',
        description: '可选的视频标题，显示在片头',
      },
    },
    required: ['scenes'],
  },
  async handler(params, ctx) {
    const scenes = params.scenes as VideoScene[];
    const bgmStyle = (params.bgmStyle as string) || 'auto';
    const ratio = (params.ratio as string) || '9:16';
    const subtitleStyle = (params.subtitleStyle as string) || '白色粗体';
    const subtitlePosition = (params.subtitlePosition as string) || '底部';
    const audioUrl = params.audioUrl as string | undefined;
    const title = params.title as string | undefined;

    if (!scenes || scenes.length === 0) {
      return { success: false, output: '', error: '至少需要一个场景（scenes 不能为空）' };
    }

    const resolution = RATIO_MAP[ratio] || RATIO_MAP['9:16'];
    const { width, height } = resolution;
    const dir = getTempDir('compose');
    const segmentPaths: string[] = [];

    try {
      // 1. 下载所有图片并转为视频片段
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const dur = scene.duration || 3;
        const ext = scene.imageUrl.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
        const imgPath = join(dir, `scene_${i}.${ext}`);
        const segPath = join(dir, `seg_${i}.mp4`);

        await downloadFile(scene.imageUrl, imgPath);

        // 图片 → 视频片段（静音），缩放+填充到目标分辨率
        ffmpegArgs([
          '-y', '-loop', '1', '-i', imgPath,
          '-c:v', 'libx264', '-preset', 'fast', '-t', String(dur),
          '-pix_fmt', 'yuv420p', '-r', '30',
          '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
          '-an', segPath,
        ]);
        segmentPaths.push(segPath);
      }

      // 2. 拼接所有片段
      const mergedPath = join(dir, 'merged.mp4');
      if (segmentPaths.length === 1) {
        copyFileSync(segmentPaths[0], mergedPath);
      } else {
        const filelist = join(dir, 'filelist.txt');
        writeFileSync(filelist, segmentPaths.map((p) => `file '${p}'`).join('\n'));
        ffmpegArgs(['-y', '-f', 'concat', '-safe', '0', '-i', filelist, '-c', 'copy', mergedPath]);
      }

      // 3. 处理音频：口播 + BGM
      let withAudioPath = mergedPath;
      const hasBgm = bgmStyle !== 'none';
      const bgmPath = hasBgm
        ? join(process.cwd(), 'public', 'bgm', BGM_FILES[bgmStyle] || 'chill.mp3')
        : null;
      const hasBgmFile = bgmPath && existsSync(bgmPath);

      if (audioUrl || hasBgmFile) {
        withAudioPath = join(dir, 'with_audio.mp4');
        const audioInputs: string[] = [];
        const filterParts: string[] = [];
        const mapParts: string[] = [];

        if (audioUrl) {
          const voPath = join(dir, 'voiceover.mp3');
          await downloadFile(audioUrl, voPath);
          audioInputs.push(`-i "${voPath}"`);
          filterParts.push('[1:a]volume=1.2[vo]');
        }

        if (hasBgmFile) {
          const volMap: Record<string, string> = { tech: '0.18', chill: '0.22', hype: '0.15', elegant: '0.18', energetic: '0.18', auto: '0.2' };
          const vol = volMap[bgmStyle] || '0.2';
          audioInputs.push(`-i "${bgmPath}"`);
          const bgmIdx = audioUrl ? 2 : 1;
          filterParts.push(`[${bgmIdx}:a]volume=${vol},afade=t=in:d=2,afade=t=out:st=9999:d=2[bgm]`);
        }

        if (audioUrl && hasBgmFile) {
          filterParts.push('[vo][bgm]amix=inputs=2:duration=first,volume=1.3[aout]');
          mapParts.push('-map "[aout]"');
        } else if (audioUrl) {
          filterParts.push('[vo]volume=1.2[aout]');
          mapParts.push('-map "[aout]"');
        } else {
          filterParts.push('[bgm]volume=1.0[aout]');
          mapParts.push('-map "[aout]"');
        }

        ffmpegArgs([
          '-y', '-i', mergedPath,
          ...audioInputs.flatMap(a => ['-i', a]),
          '-filter_complex', filterParts.join(';'),
          '-map', '0:v', ...mapParts.flatMap(m => m.split(' ')),
          '-c:v', 'copy', '-shortest',
          withAudioPath,
        ]);
      }

      // 4. 字幕
      let finalPath = withAudioPath;
      const hasSubtitles = scenes.some((s) => s.subtitle);
      if (hasSubtitles) {
        const srtPath = join(dir, 'subtitle.srt');
        writeFileSync(srtPath, generateSRT(scenes));
        const styleStr = SUBTITLE_STYLES[subtitleStyle] || SUBTITLE_STYLES['白色粗体'];
        const posStr = SUBTITLE_POSITIONS[subtitlePosition] || SUBTITLE_POSITIONS['底部'];
        finalPath = join(dir, 'final.mp4');
        ffmpeg(
          `${FFMPEG_PATH} -y -i "${withAudioPath}" ` +
          `-vf "subtitles=${srtPath}:force_style='${styleStr},${posStr}'" ` +
          `-c:a copy "${finalPath}"`
        );
      }

      // 5. 上传到 Supabase Storage
      const supabase = createAdminClient();
      const videoBuffer = readFileSync(finalPath);
      const storageKey = `compose/${ctx.userId || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;

      const { error: uploadErr } = await supabase.storage
        .from('lingji-media')
        .upload(storageKey, videoBuffer, { contentType: 'video/mp4', upsert: false });

      if (uploadErr) throw new Error(`上传失败: ${uploadErr.message}`);

      const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
      const publicUrl = urlData.publicUrl;

      // 6. 保存到灵感库
      if (ctx.userId) {
        const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 3), 0);
        saveMediaToInspiration(ctx.userId, 'video', `视频合成 ${scenes.length}个场景 ${totalDuration}秒`, [publicUrl], { toolName: 'compose_video' }).catch(() => {});
      }

      // 7. 清理临时文件
      try { execSync(`rm -rf "${dir}"`); } catch {}

      const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 3), 0);
      const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(1);

      return {
        success: true,
        output: [
          `视频合成完成！`,
          ``,
          `📹 **视频链接**: ${publicUrl}`,
          `🎬 **分辨率**: ${width}×${height} (${ratio})`,
          `⏱ **时长**: ${totalDuration} 秒`,
          `🖼 **场景数**: ${scenes.length}`,
          `🎵 **BGM**: ${bgmStyle === 'none' ? '无' : bgmStyle}`,
          `📝 **字幕**: ${hasSubtitles ? `${subtitleStyle} / ${subtitlePosition}` : '无'}`,
          `📦 **大小**: ${sizeMB} MB`,
          ``,
          `已自动保存到灵感库。可直接下载使用。`,
        ].join('\n'),
        data: {
          videoUrl: publicUrl,
          storageKey,
          width,
          height,
          ratio,
          duration: totalDuration,
          sceneCount: scenes.length,
          bgmStyle,
          hasSubtitles,
          sizeBytes: videoBuffer.length,
          autoSaved: true,
        },
      };
    } catch (e) {
      try { execSync(`rm -rf "${dir}"`); } catch {}
      return {
        success: false,
        output: '',
        error: `视频合成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
