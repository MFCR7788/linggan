// 一张图出片 — 产品种草视频一键生成
// 用户只需提供产品图，其余全自动：识图→文案→场景图→合成→入库
// 有真人照片走 Agnes 口播路径，无则走 Compose 幻灯片路径

import type { ToolDefinition } from '../../types';
import { callDoubaoVision, callDeepSeek } from '@/lib/ai-services';
import { generateImageAgnes } from '@/lib/ai/image';
import { generateAgnesVideo } from '@/lib/ai/agnes-video';
import { saveMediaToInspiration } from '../save-media-helper';
import { createAdminClient } from '@/lib/supabase-server';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// ── SRT 字幕生成 ──

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function generateSRT(subtitles: Array<{ text: string; duration: number }>): string {
  const lines: string[] = [];
  let cursor = 0;
  subtitles.forEach((sub, i) => {
    const start = cursor;
    const end = cursor + sub.duration;
    cursor = end;
    lines.push(`${i + 1}`);
    lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
    lines.push(sub.text);
    lines.push('');
  });
  return lines.join('\n');
}

// ── 把文案拆成字幕短句 ──

function splitToSubtitles(script: string, totalDuration: number): Array<{ text: string; duration: number }> {
  const sentences = script
    .split(/(?<=[。！？，、\n])/g)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length === 0) return [{ text: script, duration: totalDuration }];

  // 按字数分配时长
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  return sentences.map(s => ({
    text: s,
    duration: Math.max(1.5, (s.length / totalChars) * totalDuration),
  }));
}

// ── 构建分析 prompt ──

function buildAnalyzePrompt(productName: string): string {
  return `请详细分析这张产品图片，提取以下信息用于创作短视频：
1. 品类：这是什么产品？
2. 外观特征：颜色、材质、形状、设计亮点
3. 使用场景：在什么场景下使用？
4. 目标用户：谁会买这个产品？
5. 核心卖点：最吸引人的 2-3 个特点

请用中文简洁回答，每条 1-2 句话。不要用"首先/其次/总而言之"等模板词。`;
}

// ── 构建文案 prompt ──

function buildCopyPrompt(analysis: string, style: string, platform: string): string {
  const styleGuide: Record<string, string> = {
    recommend: '种草推荐风格：真诚分享使用体验，突出产品亮点，带个人感受，让人想买',
    review: '深度测评风格：客观分析优缺点，数据说话，专业可信',
    tutorial: '实用教程风格：教别人怎么用这个产品，步骤清晰，解决问题',
  };

  const platformGuide: Record<string, string> = {
    douyin: '抖音口播风格：前3秒必须抓眼球（抛出问题或惊人发现），短句快节奏，多用"你"，结尾引导互动（评论区扣1/点赞收藏）。纯口语，不要书面语。100-150字。',
    xiaohongshu: '小红书口播风格：亲切温和，像在跟闺蜜分享好物。强调个人真实体验，"我用了一段时间发现…"。带emoji，短段落。80-120字。',
  };

  const s = styleGuide[style] || styleGuide.recommend;
  const p = platformGuide[platform] || platformGuide.douyin;

  return `你是一个短视频创作者，要为一款产品写口播脚本。

${p}

风格要求：${s}

产品分析信息：
${analysis}

要求：
1. 纯口播文字，适合朗读，不要任何格式标记
2. 短句，每句不超过20字
3. 去掉AI味：不要"首先/其次/总而言之/综上所述/此外/值得注意的是"
4. 有个人语气和态度
5. 直接输出脚本，不要前缀说明`;
}

// ── 构建场景图 prompt ──

function buildScenePrompt(analysis: string): string {
  return `Generate a beautiful product photography background for social media short video.
Based on the product context: ${analysis}

Requirements:
- Clean, aesthetic lifestyle scene that complements the product
- Soft natural lighting, shallow depth of field
- Warm and inviting atmosphere
- Suitable as background for a vertical 9:16 short video
- No text, no watermark, no people
- High quality, photorealistic`;
}

// ── 视频合成（Compose 路径）──

async function composeProductVideo(args: {
  productImageUrl: string;
  sceneImageUrls: string[];
  subtitles: Array<{ text: string; duration: number }>;
  bgmStyle: string;
  userId: string;
}): Promise<string> {
  const { productImageUrl, sceneImageUrls, subtitles, bgmStyle } = args;

  const width = 1080;
  const height = 1920;
  const dir = join(tmpdir(), `pv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });

  try {
    // 每个场景持续时长
    const sceneDuration = subtitles.reduce((s, sub) => s + sub.duration, 0);
    const sceneCount = 1 + sceneImageUrls.length;
    const perSceneDuration = sceneDuration / sceneCount;

    // 把字幕分配给各场景
    const scenes = buildScenes(subtitles, sceneCount);

    // 下载并转换每张图为视频片段
    const allImages = [productImageUrl, ...sceneImageUrls];
    const segPaths: string[] = [];

    for (let i = 0; i < allImages.length; i++) {
      const imgPath = join(dir, `img_${i}.jpg`);
      const segPath = join(dir, `seg_${i}.mp4`);
      await downloadFile(allImages[i], imgPath);
      ffmpeg(
        `${FFMPEG} -y -loop 1 -i "${imgPath}" ` +
        `-c:v libx264 -preset fast -t ${perSceneDuration} -pix_fmt yuv420p -r 30 ` +
        `-vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black" ` +
        `-an "${segPath}"`
      );
      segPaths.push(segPath);
    }

    // 拼接片段
    const mergedPath = join(dir, 'merged.mp4');
    if (segPaths.length === 1) {
      execSync(`cp "${segPaths[0]}" "${mergedPath}"`);
    } else {
      const filelist = join(dir, 'filelist.txt');
      writeFileSync(filelist, segPaths.map(p => `file '${p}'`).join('\n'));
      ffmpeg(`${FFMPEG} -y -f concat -safe 0 -i "${filelist}" -c copy "${mergedPath}"`);
    }

    // BGM 混音
    let withAudioPath = mergedPath;
    const bgmFileMap: Record<string, string> = { tech: 'tech.mp3', chill: 'chill.mp3', hype: 'hype.mp3', elegant: 'chill.mp3', energetic: 'hype.mp3', auto: 'chill.mp3' };
    const bgmFile = bgmFileMap[bgmStyle] || 'chill.mp3';
    const bgmPath = join(process.cwd(), 'public', 'bgm', bgmFile);

    const fs = await import('fs');
    if (fs.existsSync(bgmPath)) {
      withAudioPath = join(dir, 'with_audio.mp4');
      const volMap: Record<string, string> = { tech: '0.18', chill: '0.22', hype: '0.15', elegant: '0.18', energetic: '0.18', auto: '0.2' };
      const vol = volMap[bgmStyle] || '0.2';
      ffmpeg(
        `${FFMPEG} -y -i "${mergedPath}" -i "${bgmPath}" ` +
        `-filter_complex "[1:a]volume=${vol},afade=t=in:d=2,afade=t=out:st=9999:d=2[aout]" ` +
        `-map 0:v -map "[aout]" -c:v copy -shortest "${withAudioPath}"`
      );
    }

    // 烧录字幕
    const hasSubtitles = scenes.some(s => s.subtitles.length > 0);
    let finalPath = withAudioPath;

    if (hasSubtitles && scenes.some(s => s.subtitles.length > 0)) {
      // 重新生成整体 SRT（按场景顺序拼接）
      const allSubs: Array<{ text: string; duration: number }> = [];
      scenes.forEach(s => {
        s.subtitles.forEach(sub => allSubs.push(sub));
      });

      if (allSubs.length > 0) {
        const srtPath = join(dir, 'subs.srt');
        writeFileSync(srtPath, generateSRT(allSubs));
        finalPath = join(dir, 'final.mp4');
        const style = 'FontSize=28,PrimaryColour=&HFFFFFF,Outline=2,Bold=1';
        const pos = 'Alignment=2,MarginV=80';
        ffmpeg(
          `${FFMPEG} -y -i "${withAudioPath}" ` +
          `-vf "subtitles=${srtPath}:force_style='${style},${pos}'" ` +
          `-c:a copy "${finalPath}"`
        );
      }
    }

    // 上传到 Supabase Storage
    const supabase = createAdminClient();
    const videoBuffer = readFileSync(finalPath);
    const storageKey = `product-video/${args.userId || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;

    const { error: uploadErr } = await supabase.storage
      .from('lingji-media')
      .upload(storageKey, videoBuffer, { contentType: 'video/mp4', upsert: false });

    if (uploadErr) throw new Error(`上传失败: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
    return urlData.publicUrl;
  } finally {
    try { execSync(`rm -rf "${dir}"`); } catch {}
  }
}

function buildScenes(
  subtitles: Array<{ text: string; duration: number }>,
  sceneCount: number
): Array<{ subtitles: Array<{ text: string; duration: number }> }> {
  // 把字幕均匀分配给场景
  const scenes: Array<{ subtitles: Array<{ text: string; duration: number }> }> = [];
  const perScene = Math.ceil(subtitles.length / sceneCount);

  for (let i = 0; i < sceneCount; i++) {
    scenes.push({
      subtitles: subtitles.slice(i * perScene, (i + 1) * perScene),
    });
  }

  return scenes;
}

async function downloadFile(url: string, outputPath: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(outputPath, buf);
  return outputPath;
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

// ── Tool Definition ──

export const generateProductVideoTool: ToolDefinition = {
  name: 'generate_product_video',
  isLongRunning: true,
  description: `一张图出片：产品图 → 种草短视频，全自动生成。
上传一张产品图片，AI 自动识图理解产品 → 写口播脚本 → 生成场景图 → 合成带字幕+BGM的竖屏视频。

适用场景：
- 产品种草视频：拍个产品图，一键生成带货短视频
- 好物分享：拍个开箱/好物图，自动出分享视频
- 上新预告：拍个新品图，生成发布预告短视频

两条路径：
- 有真人照片 → AI 口播视频（人物讲解产品），更自然、更有说服力
- 无真人照片 → 产品幻灯片视频（产品图+场景图+字幕+BGM），纯产品展示

输出：9:16 竖屏短视频，已自动保存到灵感库。`,
  parameters: {
    type: 'object',
    properties: {
      imageUrl: {
        type: 'string',
        description: '产品图片 URL（必填）。拍一张产品照片或从灵感库选择。',
      },
      personImageUrl: {
        type: 'string',
        description: '真人照片 URL（可选）。有真人照片时走口播路径，生成人物讲解产品的视频，更有说服力。',
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
    const personImageUrl = params.personImageUrl as string | undefined;
    const style = (params.style as string) || 'recommend';
    const platform = (params.platform as string) || 'douyin';
    const bgmStyle = (params.bgmStyle as string) || 'auto';

    const errors: string[] = [];

    // Step 1: 分析产品图
    let analysis = '';
    try {
      const result = await callDoubaoVision(imageUrl, buildAnalyzePrompt('产品'));
      analysis = result.description || result.text || '';
    } catch (e) {
      errors.push(`图片分析失败: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Step 2: 写口播脚本
    let script = '';
    try {
      script = await callDeepSeek(buildCopyPrompt(analysis || '一款创意产品', style, platform), {
        temperature: 0.8,
        maxTokens: 800,
      });
    } catch (e) {
      errors.push(`文案生成失败: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!script.trim()) {
      return {
        success: false,
        output: '',
        error: `产品视频生成失败: ${errors.join('; ')}`,
      };
    }

    // Step 3: 判断路径
    const hasPersonPhoto = !!personImageUrl;
    let videoUrl = '';
    const stepLog: string[] = [];

    const styleLabel: Record<string, string> = {
      recommend: '种草推荐', review: '深度测评', tutorial: '使用教程',
    };
    const platformLabel: Record<string, string> = {
      douyin: '抖音', xiaohongshu: '小红书',
    };

    if (hasPersonPhoto) {
      // Path A: Agnes 口播视频
      stepLog.push('已分析产品 → 已写口播脚本 → 走口播路径（真人讲解）');

      try {
        const videoPrompt = [
          'A person introduces and reviews a product enthusiastically.',
          '',
          `Product context: ${analysis || 'a lifestyle product'}`,
          `Speech script: ${script.trim()}`,
          '',
          'The person speaks directly to camera with natural expressions.',
          'Warm, inviting tone. Genuine product recommendation style.',
          'Shallow depth of field, soft lighting, cinematic look.',
        ].join('\n');

        const agnesResult = await generateAgnesVideo({
          imageUrl: personImageUrl,
          prompt: videoPrompt,
          numFrames: 201,
        });

        if (agnesResult.videoUrl) {
          videoUrl = agnesResult.videoUrl;
          stepLog.push('Agnes 口播视频生成完成');
        } else {
          errors.push('Agnes 视频生成未返回 URL');
        }
      } catch (e) {
        errors.push(`口播视频生成失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Path B: Compose 路径（无真人照片 或 Agnes 失败）
    if (!videoUrl) {
      stepLog.push('已分析产品 → 已写口播脚本 → 走合成路径（产品图+场景图+字幕+BGM）');

      // Step 3b: 生成 1-2 张场景背景图
      const sceneUrls: string[] = [];
      try {
        const scenePrompt = buildScenePrompt(analysis || 'aesthetic lifestyle product photography');
        const sceneResult = await generateImageAgnes(scenePrompt, {
          ratio: '9:16',
          quality: 'standard',
          n: 1,
        });
        const imgs = Array.isArray(sceneResult) ? sceneResult : [sceneResult];
        sceneUrls.push(...imgs.map(img => img.imageUrl).filter(Boolean).slice(0, 2));
        stepLog.push(`生成 ${sceneUrls.length} 张场景图`);
      } catch (e) {
        // 场景图失败不阻塞，只用产品图
        stepLog.push(`场景图生成失败，仅用产品图: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Step 4b: 拆字幕 + 合成视频
      const totalDuration = Math.max(8, script.length / 6); // ~6 字/秒，最少 8 秒
      const subtitles = splitToSubtitles(script, totalDuration);

      try {
        videoUrl = await composeProductVideo({
          productImageUrl: imageUrl,
          sceneImageUrls: sceneUrls,
          subtitles,
          bgmStyle,
          userId: ctx.userId || 'anon',
        });
        stepLog.push('视频合成完成');
      } catch (e) {
        return {
          success: false,
          output: '',
          error: `视频合成失败: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    // Step 5: 保存到灵感库
    if (ctx.userId) {
      saveMediaToInspiration(
        ctx.userId, 'video',
        script.substring(0, 50),
        [videoUrl],
        { toolName: 'product_video' }
      ).catch(() => {});
    }

    const pathLabel = hasPersonPhoto ? 'AI口播' : '产品幻灯片';
    const sceneInfo = hasPersonPhoto
      ? '人物讲解产品'
      : `${1}张产品图 + 场景图 + 字幕 + BGM`;

    return {
      success: true,
      output: [
        `已生成产品视频 ✨`,
        ``,
        `【方案】${pathLabel} · ${platformLabel[platform] || platform} · ${styleLabel[style] || style}`,
        `【组成】${sceneInfo}`,
        `【文案】(${script.length}字)`,
        script.trim(),
        ``,
        `【视频】${videoUrl}`,
        ``,
        `💡 已自动保存到灵感库，可直接下载使用。`,
        stepLog.length > 0 ? `\n📋 流程: ${stepLog.join(' → ')}` : '',
      ].join('\n'),
      data: {
        videoUrl,
        script,
        style,
        platform,
        path: hasPersonPhoto ? 'agnes' : 'compose',
        bgmStyle,
        stepLog,
        autoSaved: true,
      },
    };
  },
};
