// 视频换人 Agent 工具 — 原视频人物替换为新人物
// 使用阿里云百炼 wan2.2-animate-mix 模型
// 保留原视频场景/运镜/产品/灯光，仅替换出镜人物
// 超过 30 秒自动分段 → 逐段换脸 → FFmpeg 拼接

import type { ToolDefinition } from '../../types';
import { swapVideoFace, batchSwapVideoFace } from '@/lib/ai/video-face-swap';
import { saveMediaToInspiration } from '../save-media-helper';
import { createAdminClient } from '@/lib/supabase-server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';

const MAX_SEGMENT_SEC = 28; // 留 2 秒余量给 API 限制

// ── 工具函数 ──

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}: ${url.substring(0, 80)}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);
}

async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execAsync(
    `${FFPROBE_PATH} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
    { timeout: 30000 }
  );
  return parseFloat(stdout.trim());
}

async function splitVideo(inputPath: string, workDir: string, maxSec: number): Promise<string[]> {
  const duration = await getVideoDuration(inputPath);
  const segmentPaths: string[] = [];
  let start = 0;
  let idx = 0;

  while (start < duration) {
    const segLen = Math.min(maxSec, duration - start);
    const segPath = join(workDir, `seg_${idx}.mp4`);
    await execAsync(
      `${FFMPEG_PATH} -y -ss ${start} -i "${inputPath}" -t ${segLen} -c:v libx264 -preset fast -crf 23 -c:a aac "${segPath}" 2>&1`,
      { timeout: 60000 }
    );
    segmentPaths.push(segPath);
    start += segLen;
    idx++;
  }

  return segmentPaths;
}

async function uploadSegmentToStorage(filePath: string, userId: string, label: string): Promise<string> {
  const buffer = await readFile(filePath);
  const supabase = createAdminClient();
  const storageKey = `face-swap-seg/${userId}/${Date.now()}-${label}-${Math.random().toString(36).slice(2, 6)}.mp4`;

  const { error } = await supabase.storage
    .from('lingji-media')
    .upload(storageKey, buffer, { contentType: 'video/mp4', upsert: false });

  if (error) throw new Error(`上传分段失败: ${error.message}`);

  const { data } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
  return data.publicUrl;
}

async function concatVideos(segmentPaths: string[], workDir: string): Promise<string> {
  if (segmentPaths.length === 1) return segmentPaths[0];

  const fileList = segmentPaths.map(p => `file '${p}'`).join('\n');
  const listPath = join(workDir, 'concat_list.txt');
  await writeFile(listPath, fileList);

  const outputPath = join(workDir, 'merged.mp4');
  await execAsync(
    `${FFMPEG_PATH} -f concat -safe 0 -i "${listPath}" -c copy -y "${outputPath}" 2>&1`,
    { timeout: 60000 }
  );
  return outputPath;
}

// ── Tool Definition ──

export const videoFaceSwapTool: ToolDefinition = {
  name: 'video_face_swap',
  isLongRunning: true,
  description: `视频换人（B方案-像素级）：保留原视频的场景/运镜/产品/灯光/背景，仅替换出镜人物。
超过 30 秒的视频会自动分段处理再拼接。

与"换人复刻"的区别：
- 换人复刻（generate_agnes_video）：只保留文案，视频画面全由 AI 重新生成
- 视频换人（video_face_swap）：原视频完全保留，只换人脸，产品/场景/运镜都不变

适用场景：
- 带货视频换人：同一产品展示，换不同主播出镜
- 口播矩阵：同一文案视频，换不同人物形象
- 品牌视频本地化：保留品牌调性，换本地化人物

技术要求：
- 原视频：2-30 秒（超过自动分段），≤200MB，MP4/AVI/MOV，人物正面出镜
- 新人物照片：正面清晰、五官可见、无遮挡，≤5MB
- 生成时间：每 30 秒约 2-5 分钟`,
  parameters: {
    type: 'object',
    properties: {
      videoUrl: {
        type: 'string',
        description: '原视频 URL（要换掉其中人物的视频）。2-30 秒，超过自动分段。≤200MB，MP4/AVI/MOV。人物正面出镜效果最佳。',
      },
      imageUrl: {
        type: 'string',
        description: '新人物照片 URL（正面清晰、五官可见、无遮挡）。≤5MB，JPG/PNG。',
      },
      mode: {
        type: 'string',
        enum: ['wan-std', 'wan-pro'],
        description: '质量模式。wan-std（默认）：标准质量，生成快，省灵力。wan-pro：专业质量，更平滑自然，适合成品交付。',
      },
    },
    required: ['videoUrl', 'imageUrl'],
  },
  async handler(params, ctx) {
    const videoUrl = params.videoUrl as string;
    const imageUrl = params.imageUrl as string;
    const mode = (params.mode as 'wan-std' | 'wan-pro') || 'wan-std';

    let tmpDir: string | null = null;
    try {
      // Step 1: 下载原视频，检查时长
      tmpDir = await mkdtemp(join(tmpdir(), 'fs-merge-'));
      const inputPath = join(tmpDir, 'input.mp4');
      await downloadFile(videoUrl, inputPath);

      const duration = await getVideoDuration(inputPath);

      // Step 2: 决定是否需要分段
      let segmentVideoUrls: string[];
      let segmentCount: number;

      if (duration <= MAX_SEGMENT_SEC) {
        // 不需要分段，直接换脸
        segmentVideoUrls = [videoUrl];
        segmentCount = 1;
      } else {
        // 需要分段：切割 → 上传各段获取 URL
        segmentCount = Math.ceil(duration / MAX_SEGMENT_SEC);
        const localSegments = await splitVideo(inputPath, tmpDir, MAX_SEGMENT_SEC);
        segmentVideoUrls = await Promise.all(
          localSegments.map((p, i) =>
            uploadSegmentToStorage(p, ctx.userId || 'anon', `s${i}`)
          )
        );
      }

      // Step 3: 逐段/批量换脸
      const results = await batchSwapVideoFace(
        segmentVideoUrls.map((url, i) => ({
          imageUrl,
          videoUrl: url,
          mode,
          index: i,
        }))
      );

      // 检查是否全部失败
      const succeeded = results.filter(r => r.success && r.videoUrl);
      if (succeeded.length === 0) {
        const firstErr = results.find(r => r.error)?.error || '未知错误';
        throw new Error(`所有 ${results.length} 段换脸均失败: ${firstErr}`);
      }

      // Step 4: 每段立即存入灵感库
      if (ctx.userId) {
        for (const r of succeeded) {
          saveMediaToInspiration(
            ctx.userId, 'video',
            `换脸段${(r.index ?? 0) + 1}/${segmentCount}`,
            [r.videoUrl!]
          ).catch(() => {});
        }
      }

      // Step 5: 单段直接返回，多段拼接
      if (succeeded.length === 1) {
        const videoUrlOut = succeeded[0].videoUrl!;
        const modeLabel = mode === 'wan-pro' ? '专业模式' : '标准模式';

        return {
          success: true,
          output: [
            '视频换人完成 ✨',
            '',
            `【质量】${modeLabel}`,
            `【原视频时长】${duration.toFixed(0)} 秒`,
            `【生成结果】${videoUrlOut}`,
            '',
            '💡 视频已自动保存到灵感库。原视频的场景/产品/运镜/灯光保持不变。',
          ].join('\n'),
          data: {
            videoUrl: videoUrlOut,
            sourceVideo: videoUrl,
            sourceImage: imageUrl,
            duration: `${duration.toFixed(0)}s`,
            mode,
            model: 'wan2.2-animate-mix',
            segments: 1,
            autoSaved: true,
          },
        };
      }

      // Step 6: 多段 → 下载换脸结果 → 拼接 → 上传
      const swappedPaths: string[] = [];
      for (const r of succeeded) {
        const dest = join(tmpDir, `swapped_${r.index}.mp4`);
        await downloadFile(r.videoUrl!, dest);
        swappedPaths.push(dest);
      }

      const mergedPath = await concatVideos(swappedPaths, tmpDir);
      const mergedBuffer = await readFile(mergedPath);
      const supabase = createAdminClient();
      const storageKey = `face-swap/${ctx.userId || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;

      const { error: uploadErr } = await supabase.storage
        .from('lingji-media')
        .upload(storageKey, mergedBuffer, { contentType: 'video/mp4', upsert: false });

      let mergedUrl = '';
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
        mergedUrl = urlData.publicUrl;

        if (ctx.userId) {
          saveMediaToInspiration(
            ctx.userId, 'video',
            `换脸合集（${succeeded.length}段 ${duration.toFixed(0)}秒）`,
            [mergedUrl]
          ).catch(() => {});
        }
      }

      const failedCount = results.length - succeeded.length;
      const modeLabel = mode === 'wan-pro' ? '专业模式' : '标准模式';

      return {
        success: true,
        output: [
          `视频换人完成 ✨（${succeeded.length}/${results.length} 段成功，已自动拼接）`,
          '',
          `【原视频时长】${duration.toFixed(0)} 秒 → 拆为 ${results.length} 段`,
          `【质量】${modeLabel}`,
          '',
          mergedUrl
            ? `【合并结果】${mergedUrl}`
            : '⚠️ 合并视频上传失败',
          '',
          `【各段状态】`,
          ...results.map(r =>
            r.success
              ? `  ✓ 段${(r.index ?? 0) + 1}: ${r.videoUrl}`
              : `  ✗ 段${(r.index ?? 0) + 1}: ${r.error}`
          ),
          failedCount > 0 ? `\n⚠️ ${failedCount} 段失败，已用成功段拼接。` : '',
          '\n💡 各段和合并视频已自动保存到灵感库。',
        ].join('\n'),
        data: {
          videoUrl: mergedUrl || undefined,
          segmentResults: results.map(r => ({
            index: r.index,
            success: r.success,
            videoUrl: r.videoUrl,
            error: r.error,
          })),
          duration: `${duration.toFixed(0)}s`,
          segments: results.length,
          succeeded: succeeded.length,
          failed: failedCount,
          mode,
          model: 'wan2.2-animate-mix',
          autoSaved: !!mergedUrl,
        },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `视频换人失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    } finally {
      if (tmpDir) {
        try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
      }
    }
  },
};
