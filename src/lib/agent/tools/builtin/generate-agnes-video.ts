// 口播视频生成 Agent 工具 — 照片+文案 → 口播视频
// 使用 Agnes Video V2.0 模型，原生口型同步+配音+运镜
// A方案：适合纯口播类短视频，场景由照片决定
// 长文案自动分段 → 逐段生成 → FFmpeg 拼接

import type { ToolDefinition } from '../../types';
import { generateAgnesVideo } from '@/lib/ai/agnes-video';
import { saveMediaToInspiration } from '../save-media-helper';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createAdminClient } from '@/lib/supabase-server';

const execAsync = promisify(exec);

// ── 文案分段 ────────────────────────────────────────────────

interface ScriptSegment {
  text: string;
  /** 推荐帧数 */
  frames: number;
  /** 预估时长（秒） */
  durationSec: number;
}

/** 中文口播语速：约 5-6 字/秒，每段默认 6.7 秒（161帧）≈ 40 字 */
const CHARS_PER_SEC = 6;
const DEFAULT_SEGMENT_SEC = 6.7;
const MAX_SEGMENT_SEC = 15;   // 单段最长 ≈60字 → 361帧
const MAX_FRAMES = 441;

function calcFrames(text: string): { frames: number; durationSec: number } {
  const estimatedSec = Math.max(3, text.length / CHARS_PER_SEC);
  const clampedSec = Math.min(estimatedSec, MAX_SEGMENT_SEC);
  // 找最接近的有效帧数 (8n+1)
  const rawFrames = Math.round(clampedSec * 24);
  const validFrames = [81, 121, 161, 201, 241, 281, 321, 361, 401, 441];
  let frames = validFrames[0];
  for (const vf of validFrames) {
    if (rawFrames >= vf) frames = vf;
  }
  return { frames: Math.min(frames, MAX_FRAMES), durationSec: frames / 24 };
}

function splitScript(fullText: string): ScriptSegment[] {
  const text = fullText.trim();
  if (text.length <= 50) {
    const { frames, durationSec } = calcFrames(text);
    return [{ text, frames, durationSec }];
  }

  // 按句号/问号/感叹号/换行分割
  const rawParts = text.split(/(?<=[。！？\n])/g).filter(s => s.trim());

  const segments: ScriptSegment[] = [];
  let buffer = '';

  for (const part of rawParts) {
    const candidate = buffer + part;

    if (candidate.length <= 50) {
      buffer = candidate; // 还能继续加
    } else if (buffer.length > 0) {
      // buffer 已满，封段
      const { frames, durationSec } = calcFrames(buffer);
      segments.push({ text: buffer, frames, durationSec });
      buffer = part;
    } else {
      // 单句太长（>50字），按逗号再拆
      const subParts = part.split(/(?<=[，、,])/g).filter(s => s.trim());
      for (const sp of subParts) {
        if ((buffer + sp).length <= 50) {
          buffer += sp;
        } else {
          if (buffer.trim()) {
            const { frames, durationSec } = calcFrames(buffer);
            segments.push({ text: buffer, frames, durationSec });
          }
          buffer = sp;
        }
      }
    }
  }

  if (buffer.trim()) {
    const { frames, durationSec } = calcFrames(buffer);
    segments.push({ text: buffer, frames, durationSec });
  }

  return segments;
}

// ── 构建视频 prompt ──────────────────────────────────────────

function buildVideoPrompt(script: string): string {
  return [
    'Cinematic talking head video, social media content style.',
    '',
    'Subject: The person in the image speaks directly to camera.',
    'Speech: ' + script.trim(),
    '',
    'Performance: Natural and authentic delivery, conversational tone.',
    'Facial expressions match the emotional beats of the speech.',
    'Slight natural head movements, relaxed shoulders, genuine eye contact.',
    '',
    'Camera: Slow dolly push-in towards the face over the full duration.',
    'Subtle handheld micro-movements for organic feel.',
    'Shallow depth of field — background softly blurred throughout.',
    '',
    'Lighting: Soft key light from front-left, gentle rim light separating subject from background.',
    'Warm color temperature, cinematic color grading, slight film grain.',
    '',
    'Output: 1080p, cinematic quality, vertical 9:16 social format.',
  ].join('\n');
}

// ── 下载视频到临时目录 ──────────────────────────────────────

async function downloadVideo(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载视频失败: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);
}

// ── FFmpeg 拼接 ──────────────────────────────────────────────

async function concatVideos(videoUrls: string[], workDir: string): Promise<string | null> {
  if (videoUrls.length === 0) return null;
  if (videoUrls.length === 1) return videoUrls[0];

  // 下载所有分段视频
  const segmentPaths: string[] = [];
  for (let i = 0; i < videoUrls.length; i++) {
    const dest = join(workDir, `seg_${i}.mp4`);
    await downloadVideo(videoUrls[i], dest);
    segmentPaths.push(dest);
  }

  // 写 concat file list
  const fileList = segmentPaths.map(p => `file '${p}'`).join('\n');
  const listPath = join(workDir, 'concat_list.txt');
  await writeFile(listPath, fileList);

  const outputPath = join(workDir, 'merged.mp4');
  await execAsync(
    `ffmpeg -f concat -safe 0 -i "${listPath}" -c copy -y "${outputPath}" 2>&1`,
    { timeout: 60000 }
  );

  return outputPath;
}

// ── Tool Definition ──────────────────────────────────────────

export const generateAgnesVideoTool: ToolDefinition = {
  name: 'generate_agnes_video',
  isLongRunning: true,
  description: `口播视频生成（A方案）：照片 + 口播文案 → AI 生成口播短视频。
Agnes Video V2.0 原生口型同步+配音+运镜。长文案自动分段生成后拼接。

适用场景：
- 口播矩阵：同一文案，不同照片批量生成
- 创始人 IP：照片 + 口播稿 → 个人短视频
- 虚拟主播：虚拟形象 + 脚本 → 口播视频

单段上限：约 18 秒（60-80 字）。超出自动分段 → 逐段生成 → FFmpeg 合并。

时长参考（帧数@24fps）：
- 81帧≈3.4s / 121≈5s / 161≈6.7s（默认,~40字）/ 201≈8.4s / 241≈10s(~50字)
- 281≈11.7s / 321≈13.4s / 361≈15s(~60字) / 441≈18.4s(~80字)`,
  parameters: {
    type: 'object',
    properties: {
      imageUrl: {
        type: 'string',
        description: '人物照片 URL（正面、清晰、五官可见）。照片场景即视频背景。',
      },
      script: {
        type: 'string',
        description: '口播文案。支持长文案（自动分段+拼接），每段约 6-15 秒。',
      },
      seed: {
        type: 'number',
        description: '随机种子。同一人物+同一种子可复现相似运镜风格。',
      },
    },
    required: ['imageUrl', 'script'],
  },
  async handler(params, ctx) {
    const imageUrl = params.imageUrl as string;
    const script = params.script as string;
    const seed = params.seed as number | undefined;

    if (!script.trim()) {
      return { success: false, output: '', error: '口播文案不能为空' };
    }

    let tmpDir: string | null = null;
    try {
      const segments = splitScript(script);

      // 逐段生成（每段生成后立即存入灵感库）
      const segmentUrls: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const videoPrompt = buildVideoPrompt(seg.text);

        const result = await generateAgnesVideo({
          imageUrl,
          prompt: videoPrompt,
          numFrames: seg.frames,
          seed,
        });

        if (!result.videoUrl) {
          throw new Error(`第 ${i + 1} 段生成失败`);
        }
        segmentUrls.push(result.videoUrl);

        // 每段生成完立即存入灵感库
        if (ctx.userId) {
          saveMediaToInspiration(
            ctx.userId, 'video',
            `口播段${i + 1}/${segments.length}：${seg.text.substring(0, 25)}...`,
            [result.videoUrl]
          ).catch(() => {});
        }
      }

      const totalDuration = segments.reduce((s, seg) => s + seg.durationSec, 0);

      // 单段：直接返回
      if (segmentUrls.length === 1) {
        const seg = segments[0];
        const videoUrl = segmentUrls[0];

        if (ctx.userId) {
          saveMediaToInspiration(ctx.userId, 'video', `口播：${seg.text.substring(0, 30)}...`, [videoUrl]).catch(() => {});
        }

        return {
          success: true,
          output: [
            '已生成口播视频 ✨',
            '',
            `【文案】(${seg.text.length}字 ≈ ${seg.durationSec.toFixed(1)}秒)`,
            seg.text,
            '',
            `【视频】${videoUrl}`,
            '',
            '💡 视频已自动保存到灵感库。',
          ].join('\n'),
          data: {
            videoUrl,
            script: seg.text,
            duration: `${seg.durationSec.toFixed(1)}s`,
            model: 'agnes-video-v2.0',
            segments: 1,
            autoSaved: true,
          },
        };
      }

      // 多段：拼接
      tmpDir = await mkdtemp(join(tmpdir(), 'av-merge-'));
      const mergedPath = await concatVideos(segmentUrls, tmpDir);

      const segmentsInfo = segments.map((seg, i) =>
        `  段${i + 1}: ${seg.text.length}字 ≈ ${seg.durationSec.toFixed(1)}秒 → ${segmentUrls[i]}`
      ).join('\n');

      // 上传合并视频到 Supabase Storage
      let mergedUrl = '';
      let autoSaved = true;
      if (mergedPath) {
        const mergedBuffer = await readFile(mergedPath);
        const supabase = createAdminClient();
        const storageKey = `agnes-video/${ctx.userId || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;

        const { error: uploadErr } = await supabase.storage
          .from('lingji-media')
          .upload(storageKey, mergedBuffer, { contentType: 'video/mp4', upsert: false });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
          mergedUrl = urlData.publicUrl;

          if (ctx.userId) {
            saveMediaToInspiration(
              ctx.userId, 'video',
              `口播合集：${segments[0]?.text.substring(0, 20)}...（${segments.length}段 ${totalDuration.toFixed(0)}秒）`,
              [mergedUrl]
            ).catch(() => {});
          }
        } else {
          autoSaved = false;
          // 上传失败时保存分段 URL
          if (ctx.userId) {
            saveMediaToInspiration(
              ctx.userId, 'video',
              `口播合集：${segments[0]?.text.substring(0, 20)}...（${segments.length}段）`,
              segmentUrls
            ).catch(() => {});
          }
        }
      }

      return {
        success: true,
        output: [
          `已生成 ${segments.length} 段口播视频，已自动拼接（总长约 ${totalDuration.toFixed(0)} 秒）✨`,
          '',
          `【总时长】${totalDuration.toFixed(0)} 秒（${segments.length} 段）`,
          `【总字数】${script.trim().length} 字`,
          '',
          `【分段详情】`,
          segmentsInfo,
          '',
          mergedUrl
            ? `【合并视频】${mergedUrl}`
            : '⚠️ 合并视频上传失败，分段视频已保存到灵感库。',
        ].join('\n'),
        data: {
          videoUrl: mergedUrl || undefined,
          segmentUrls,
          segments: segments.map((seg, i) => ({
            index: i,
            text: seg.text,
            duration: `${seg.durationSec.toFixed(1)}s`,
            videoUrl: segmentUrls[i],
          })),
          totalDuration: `${totalDuration.toFixed(0)}s`,
          totalChars: script.trim().length,
          model: 'agnes-video-v2.0',
          autoSaved,
        },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `口播视频生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    } finally {
      if (tmpDir) {
        try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
      }
    }
  },
};
