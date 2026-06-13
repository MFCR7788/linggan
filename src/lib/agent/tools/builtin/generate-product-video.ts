// 一张图出片 — 产品种草视频一键生成 (Seedance 2.0)
// 新流水线: 识图 → 分镜脚本(3镜) → Seedance I2V 逐镜生成 → TTS 配音 → 拼接+BGM+字幕 → 入库
// Seedance 2.0 图生视频带运镜，产品一致性高，是真正的带货视频

import type { ToolDefinition } from '../../types';
import { callDoubaoVision, callDeepSeek, synthesizeWithCosyVoice } from '@/lib/ai-services';
import { submitSeedanceTask, getSeedanceTaskStatus } from '@/lib/ai/seedance';
import { saveMediaToInspiration } from '../save-media-helper';
import { createAdminClient } from '@/lib/supabase-server';
import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const FFMPEG = (() => {
  const env = process.env.FFMPEG_PATH;
  if (env && existsSync(env)) return env;
  return 'ffmpeg';
})();

// ── 类型 ──

interface StoryboardShot {
  index: number;
  visualPrompt: string;
  subtitle: string;
  duration: number;
}

interface StoryboardResult {
  script: string;
  shots: StoryboardShot[];
}

// ── 构建分析 prompt ──

function buildAnalyzePrompt(): string {
  return `请详细分析这张产品图片，提取以下信息：
1. 品类：这是什么产品？
2. 外观特征：颜色、材质、形状、设计亮点
3. 使用场景：在什么场景下使用？
4. 目标用户：谁会买这个产品？
5. 核心卖点：最吸引人的 2-3 个特点

请用中文简洁回答，每条 1-2 句话。

最后，请用一句英文描述产品的外观用于视频生成（例如："A sleek white ceramic coffee mug with gold handle, matte finish, minimalist design"），标记为 [PRODUCT_DESC]: ...`;
}

// 从分析结果中提取产品外观描述
function extractProductDesc(analysis: string): string {
  const match = analysis.match(/\[PRODUCT_DESC\]:\s*(.+)/i);
  if (match) return match[1].trim();
  // 降级：用分析原文前 80 字
  return analysis.substring(0, 80);
}

// ── 构建分镜脚本 prompt ──

function buildStoryboardPrompt(analysis: string, productDesc: string, style: string, platform: string): string {
  const platformGuide: Record<string, string> = {
    douyin: '抖音带货视频：开头钩子抓眼球（前3秒是关键），中间展示产品亮点，结尾CTA引导互动。短句口语化，每句不超过20字。',
    xiaohongshu: '小红书种草视频：亲切温和，像在跟闺蜜分享好物。强调真实体验感，带emoji，节奏舒缓自然。',
  };

  return `你是一个短视频导演，要为一款产品创作 3 镜分镜脚本用于 AI 视频生成。

产品分析：
${analysis}

产品外观（必须原样出现在每个镜头的 visualPrompt 中）：
${productDesc}

风格：${style}
平台要求：${platformGuide[platform] || platformGuide.douyin}

请输出 JSON（不要 markdown 代码块标记）：

{
  "script": "完整口播文案...",
  "shots": [
    {
      "index": 1,
      "visualPrompt": "必须以 "${productDesc}" 开头，然后描述镜头1/钩子特写的运镜+场景...",
      "subtitle": "对应字幕",
      "duration": 3
    },
    {
      "index": 2,
      "visualPrompt": "必须以 "${productDesc}" 开头，然后描述镜头2/环绕展示的运镜+场景...",
      "subtitle": "对应字幕",
      "duration": 5
    },
    {
      "index": 3,
      "visualPrompt": "必须以 "${productDesc}" 开头，然后描述镜头3/场景展示的运镜+场景...",
      "subtitle": "对应字幕",
      "duration": 4
    }
  ]
}

要求：
1. 每个 visualPrompt 必须以 "${productDesc}" 开头 — 这是产品外观描述，3 个镜头必须用完全相同的产品描述保证一致性
2. visualPrompt 用英文，格式: 产品外观 + 运镜方式 + 场景 + 光影 + 风格
3. 运镜必须多样：特写→拉远、环绕、推近，每个镜头不同的运镜方式
4. 3个镜头加起来总时长约12秒
5. subtitle 每段 ≤15 字，口语化短句
6. script 是完整 TTS 口播文案，与各镜 subtitle 匹配
7. 直接输出 JSON，不要 markdown 代码块`;
}

// ── 解析 LLM 返回的分镜 JSON ──

function parseStoryboard(raw: string): StoryboardResult | null {
  try {
    // 去除可能的 markdown 代码块标记
    let json = raw.trim();
    if (json.startsWith('```')) {
      json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '');
    }
    const parsed = JSON.parse(json);
    if (!parsed.script || !Array.isArray(parsed.shots) || parsed.shots.length === 0) {
      return null;
    }
    return {
      script: parsed.script,
      shots: parsed.shots.map((s: Record<string, unknown>, i: number) => ({
        index: (s.index as number) || i + 1,
        visualPrompt: s.visualPrompt as string,
        subtitle: s.subtitle as string,
        duration: Math.min(Math.max((s.duration as number) || 4, 3), 6),
      })),
    };
  } catch {
    return null;
  }
}

// ── ffmpeg 工具（安全：execFileSync 参数数组，不经过 shell）──

function ffmpegArgs(args: string[]): void {
  try {
    execFileSync(FFMPEG, args, { stdio: 'pipe', timeout: 300_000 });
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const detail = (err.stderr?.toString() || '') + (err.stdout?.toString() || '') || (e instanceof Error ? e.message : String(e));
    // 去掉 ffmpeg banner 行（banner 行特征：以 "ffmpeg version" / "Copyright" / "built with" / "configuration:" 开头）
    const cleaned = detail
      .replace(/^(?:ffmpeg version|Copyright |built with|configuration:|lib\w+|  lib).*\n?/gm, '')
      .trim();
    throw new Error(`ffmpeg 失败: ${cleaned.substring(0, 500)}`);
  }
}

function ffmpegHasLibass(): boolean {
  try {
    const out = execFileSync(FFMPEG, ['-filters'], { stdio: 'pipe', timeout: 10000 }).toString();
    return out.includes('subtitles');
  } catch {
    return false;
  }
}

async function downloadFile(url: string, outputPath: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(outputPath, buf);
  return outputPath;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function generateSRT(shots: StoryboardShot[]): string {
  const lines: string[] = [];
  let cursor = 0;
  shots.forEach((shot, i) => {
    const start = cursor;
    const end = cursor + shot.duration;
    cursor = end;
    if (shot.subtitle) {
      lines.push(`${i + 1}`);
      lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
      lines.push(shot.subtitle);
      lines.push('');
    }
  });
  return lines.join('\n');
}

// ── 合成最终视频（视频片段 + TTS + BGM + 字幕）──

async function composeFinalVideo(args: {
  shotVideoUrls: (string | null)[];
  shots: StoryboardShot[];
  ttsBuffer: Buffer;
  bgmStyle: string;
  ratio: string;
  userId: string;
}): Promise<{ videoUrl: string; subtitleBurned: boolean }> {
  const { shotVideoUrls, shots, ttsBuffer, bgmStyle, ratio, userId } = args;

  const resolution = ratio === '16:9' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
  const { width, height } = resolution;
  const dir = join(tmpdir(), `pv-seedance-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });

  try {
    // 1. 下载所有 Seedance 视频片段并统一编码
    const segPaths: string[] = [];
    for (let i = 0; i < shotVideoUrls.length; i++) {
      const url = shotVideoUrls[i];
      if (!url) {
        // 该镜头失败，生成黑场占位
        const blankPath = join(dir, `blank_${i}.mp4`);
        const dur = shots[i]?.duration || 4;
        ffmpegArgs([
          '-hide_banner', '-y', '-f', 'lavfi',
          '-i', `color=c=black:s=${width}x${height}:d=${dur}`,
          '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-r', '30', '-an',
          blankPath,
        ]);
        segPaths.push(blankPath);
        continue;
      }

      const rawPath = join(dir, `shot_raw_${i}.mp4`);
      const segPath = join(dir, `shot_${i}.mp4`);
      await downloadFile(url, rawPath);

      // 统一编码：缩放到目标分辨率 + 静音（去掉 Seedance 自带音频，用 TTS 替代）
      const dur = shots[i]?.duration || 4;
      ffmpegArgs([
        '-hide_banner', '-y', '-i', rawPath,
        '-c:v', 'libx264', '-preset', 'fast', '-t', String(dur),
        '-pix_fmt', 'yuv420p', '-r', '30',
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
        '-an', segPath,
      ]);
      segPaths.push(segPath);
    }

    // 2. 拼接视频片段
    const mergedPath = join(dir, 'merged.mp4');
    if (segPaths.length === 1) {
      copyFileSync(segPaths[0], mergedPath);
    } else {
      const filelist = join(dir, 'filelist.txt');
      writeFileSync(filelist, segPaths.map(p => `file '${p}'`).join('\n'));
      ffmpegArgs(['-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', filelist, '-c', 'copy', mergedPath]);
    }

    // 3. 写入 TTS 音频文件
    const ttsPath = join(dir, 'tts.mp3');
    writeFileSync(ttsPath, ttsBuffer);

    // 4. BGM
    const bgmFileMap: Record<string, string> = {
      tech: 'tech.mp3', chill: 'chill.mp3', hype: 'hype.mp3',
      elegant: 'chill.mp3', energetic: 'hype.mp3', auto: 'chill.mp3',
    };
    const bgmFile = bgmFileMap[bgmStyle] || 'chill.mp3';
    const bgmPath = join(process.cwd(), 'public', 'bgm', bgmFile);
    const hasBgm = existsSync(bgmPath);

    // 5. 混音：TTS 口播 + BGM 背景
    let withAudioPath = mergedPath;
    if (hasBgm) {
      withAudioPath = join(dir, 'with_audio.mp4');
      const volMap: Record<string, string> = {
        tech: '0.15', chill: '0.18', hype: '0.12',
        elegant: '0.15', energetic: '0.12', auto: '0.16',
      };
      const bgmVol = volMap[bgmStyle] || '0.16';

      ffmpegArgs([
        '-hide_banner', '-y',
        '-i', mergedPath, '-i', ttsPath, '-i', bgmPath,
        '-filter_complex', `[1:a]volume=1.5[vo];[2:a]volume=${bgmVol},afade=t=in:d=1.5,afade=t=out:st=9999:d=2[bgm];[vo][bgm]amix=inputs=2:duration=first,volume=1.4[aout]`,
        '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-shortest',
        withAudioPath,
      ]);
    } else {
      // 无 BGM，仅 TTS 口播
      withAudioPath = join(dir, 'with_audio.mp4');
      ffmpegArgs([
        '-hide_banner', '-y',
        '-i', mergedPath, '-i', ttsPath,
        '-filter_complex', '[1:a]volume=1.5[aout]',
        '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-shortest',
        withAudioPath,
      ]);
    }

    // 6. 烧录字幕（需要 libass；静态 ffmpeg 不支持则跳过）
    let finalPath = withAudioPath;
    let subtitleBurned = false;
    if (ffmpegHasLibass()) {
      const srtPath = join(dir, 'subtitle.srt');
      writeFileSync(srtPath, generateSRT(shots));
      finalPath = join(dir, 'final.mp4');
      const subtitleStyle = 'FontSize=28,PrimaryColour=&HFFFFFF,Outline=2,Bold=1';
      const subtitlePos = 'Alignment=2,MarginV=80';
      ffmpegArgs([
        '-hide_banner', '-y', '-i', withAudioPath,
        '-vf', `subtitles=${srtPath}:force_style='${subtitleStyle},${subtitlePos}'`,
        '-c:a', 'copy',
        finalPath,
      ]);
      subtitleBurned = true;
    }

    // 7. 上传到 Supabase Storage
    const supabase = createAdminClient();
    const videoBuffer = readFileSync(finalPath);
    const storageKey = `product-video/${userId || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;

    const { error: uploadErr } = await supabase.storage
      .from('lingji-media')
      .upload(storageKey, videoBuffer, { contentType: 'video/mp4', upsert: false });

    if (uploadErr) throw new Error(`上传失败: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
    return { videoUrl: urlData.publicUrl, subtitleBurned };
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

// ── Tool Definition ──

export const generateProductVideoTool: ToolDefinition = {
  name: 'generate_product_video',
  isLongRunning: true,
  description: `一张图出片：产品图 → 种草短视频，全自动生成。
上传一张产品图片，AI 自动: 识图理解产品 → 写3镜分镜脚本 → Seedance 2.0 图生视频（逐镜运镜拍摄）→ TTS配音 → 合成+BGM+字幕 → 入库。

适用场景：
- 产品种草视频：拍个产品图，一键生成带货短视频
- 好物分享：拍个开箱/好物图，自动出分享视频
- 上新预告：拍个新品图，生成发布预告短视频

核心引擎：Seedance 2.0（火山引擎），图生视频+专业运镜（推/拉/摇/移/跟），产品一致性高。

输出：9:16 竖屏短视频，带配音+字幕+BGM，已自动保存到灵感库。`,
  parameters: {
    type: 'object',
    properties: {
      imageUrl: {
        type: 'string',
        description: '产品图片 URL（必填）。拍一张产品照片或从灵感库选择。',
      },
      style: {
        type: 'string',
        enum: ['recommend', 'review', 'tutorial'],
        description: '视频风格。recommend(种草推荐，默认), review(深度测评), tutorial(使用教程)',
      },
      platform: {
        type: 'string',
        enum: ['douyin', 'xiaohongshu'],
        description: '目标平台。douyin(抖音，默认), xiaohongshu(小红书)',
      },
      bgmStyle: {
        type: 'string',
        enum: ['tech', 'chill', 'hype', 'elegant', 'energetic', 'auto'],
        description: '背景音乐风格。默认 auto',
      },
    },
    required: ['imageUrl'],
  },
  async handler(params, ctx) {
    const imageUrl = params.imageUrl as string;
    const style = (params.style as string) || 'recommend';
    const platform = (params.platform as string) || 'douyin';
    const bgmStyle = (params.bgmStyle as string) || 'auto';
    const ratio = '9:16'; // 带货视频固定竖屏

    const styleLabel: Record<string, string> = {
      recommend: '种草推荐', review: '深度测评', tutorial: '使用教程',
    };
    const errors: string[] = [];
    const stepLog: string[] = [];

    // Step 1: 识图分析
    let analysis = '';
    try {
      const result = await callDoubaoVision(imageUrl, buildAnalyzePrompt());
      analysis = result.description || result.text || '';
    } catch (e) {
      errors.push(`图片分析失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!analysis) {
      analysis = '一款创意生活产品，外观精致，适合日常使用。';
      stepLog.push('图片分析降级为默认描述');
    } else {
      stepLog.push('已分析产品特征');
    }

    // 提取产品外观描述，后续注入到每个镜头 prompt 保证一致性
    const productDesc = extractProductDesc(analysis);

    // Step 2: 写分镜脚本
    let storyboard: StoryboardResult | null = null;
    try {
      const raw = await callDeepSeek(
        buildStoryboardPrompt(analysis, productDesc, styleLabel[style] || '种草推荐', platform),
        { temperature: 0.8, maxTokens: 1200 }
      );
      storyboard = parseStoryboard(raw);
    } catch (e) {
      errors.push(`分镜生成失败: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!storyboard || storyboard.shots.length === 0) {
      return {
        success: false,
        output: '',
        error: `分镜脚本生成失败: ${errors.join('; ')}`,
      };
    }
    stepLog.push(`已生成 ${storyboard.shots.length} 镜分镜`);

    // Step 3: 逐镜 Seedance I2V 生成（并行提交，串行轮询）
    // 用同一个 seed 保证 3 镜产品外观一致
    const shotSeed = Math.floor(Math.random() * 2147483647);
    const shotVideoUrls: (string | null)[] = [];
    const shotTaskIds: string[] = [];

    // 3a. 并行提交所有镜头
    const submitResults = await Promise.allSettled(
      storyboard.shots.map(async (shot) => {
        const result = await submitSeedanceTask({
          prompt: shot.visualPrompt,
          imageUrl,
          duration: shot.duration,
          ratio: '9:16',
          resolution: '720p',
          generateAudio: false,
          seed: shotSeed,
        });
        return result;
      })
    );

    for (let i = 0; i < submitResults.length; i++) {
      const r = submitResults[i];
      if (r.status === 'fulfilled' && r.value.taskId) {
        shotTaskIds.push(r.value.taskId);
        stepLog.push(`镜头${i + 1} Seedance 已提交`);
      } else {
        shotTaskIds.push('');
        const errMsg = r.status === 'rejected'
          ? (r.reason instanceof Error ? r.reason.message : String(r.reason))
          : (r.value.message || '提交失败');
        errors.push(`镜头${i + 1}: ${errMsg}`);
        stepLog.push(`镜头${i + 1} 提交失败: ${errMsg}`);
      }
    }

    // 3b. 串行轮询所有镜头
    for (let i = 0; i < shotTaskIds.length; i++) {
      const taskId = shotTaskIds[i];
      if (!taskId) {
        shotVideoUrls.push(null);
        continue;
      }

      let shotUrl: string | null = null;
      const startTime = Date.now();
      const timeoutMs = 360_000; // 6 分钟每镜

      while (Date.now() - startTime < timeoutMs) {
        await sleep(3000);
        try {
          const status = await getSeedanceTaskStatus(taskId);
          if (status.status === 'succeeded' && status.videoUrl) {
            shotUrl = status.videoUrl;
            stepLog.push(`镜头${i + 1} 已完成`);
            break;
          }
          if (status.status === 'failed') {
            errors.push(`镜头${i + 1}: ${status.message || '生成失败'}`);
            stepLog.push(`镜头${i + 1} 失败: ${status.message || '未知错误'}`);
            break;
          }
        } catch {
          // 查询异常不中断
        }
      }

      shotVideoUrls.push(shotUrl);
    }

    // 至少需要一个成功的镜头
    const successCount = shotVideoUrls.filter(Boolean).length;
    if (successCount === 0) {
      return {
        success: false,
        output: '',
        error: `所有镜头生成失败: ${errors.join('; ')}`,
      };
    }

    // Step 4: TTS 配音
    let ttsBuffer: Buffer | null = null;
    try {
      ttsBuffer = await synthesizeWithCosyVoice({
        text: storyboard.script,
        options: { speed: 1.0, voice: 'longxiaochun_v2' },
      });
      if (ttsBuffer) {
        stepLog.push('TTS 配音完成');
      } else {
        errors.push('TTS 配音返回空');
      }
    } catch (e) {
      errors.push(`TTS 配音失败: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!ttsBuffer) {
      // 降级：生成静音占位
      ttsBuffer = Buffer.alloc(0);
      stepLog.push('TTS 降级为静音');
    }

    // Step 5: 合成最终视频
    let videoUrl: string;
    let subtitleBurned = false;
    try {
      const result = await composeFinalVideo({
        shotVideoUrls,
        shots: storyboard.shots,
        ttsBuffer,
        bgmStyle,
        ratio,
        userId: ctx.userId || 'anon',
      });
      videoUrl = result.videoUrl;
      subtitleBurned = result.subtitleBurned;
      stepLog.push('视频合成完成');
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `视频合成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // Step 6: 保存到灵感库
    if (ctx.userId) {
      saveMediaToInspiration(
        ctx.userId, 'video',
        storyboard.script.substring(0, 50),
        [videoUrl],
        { toolName: 'product_video' }
      ).catch(() => {});
    }

    const totalDuration = storyboard.shots.reduce((s, shot) => s + shot.duration, 0);

    return {
      success: true,
      output: [
        `已生成产品种草视频 ✨`,
        ``,
        `【方案】Seedance 2.0 运镜拍摄 · ${styleLabel[style] || style} · ${platform === 'xiaohongshu' ? '小红书' : '抖音'}${subtitleBurned ? '' : ' · 字幕未嵌入（ffmpeg 无 libass）'}`,
        `【分镜】${storyboard.shots.length} 镜 · 共 ${totalDuration} 秒`,
        storyboard.shots.map(s => `  镜头${s.index}: ${s.subtitle} (${s.duration}s)`).join('\n'),
        ``,
        `【文案】(${storyboard.script.length}字)`,
        storyboard.script.trim(),
        ``,
        `【视频】${videoUrl}`,
        ``,
        `💡 已自动保存到灵感库，可直接下载使用。`,
        errors.length > 0 ? `\n⚠️ 部分步骤出现问题: ${errors.join('; ')}` : '',
        `\n📋 流程: ${stepLog.join(' → ')}`,
      ].join('\n'),
      data: {
        videoUrl,
        script: storyboard.script,
        shots: storyboard.shots,
        style,
        platform,
        ratio,
        bgmStyle,
        subtitleBurned,
        stepLog,
        errors: errors.length > 0 ? errors : undefined,
        autoSaved: true,
      },
    };
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
