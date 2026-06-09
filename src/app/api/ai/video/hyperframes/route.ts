// HyperFrames 动态图形视频生成 API (V2.0.4)
// POST /api/ai/video/hyperframes
// Body: { script: string; topic?: string; style?: 'product'|'social'|'slide'; duration?: number }
// Response: { success, data: { videoUrl, duration, creditsUsed } }
//
// 计费: 15 credits/次（LLM + Chrome 渲染 + 上传）

import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { callDeepSeek } from '@/lib/ai-services';
import { consume, refund, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { saveWorkHistory } from '@/lib/supabase-server';
import { buildHyperFramesPrompt, type HyperFramesStyle } from '@/lib/hyperframes/prompt';

export const dynamic = 'force-dynamic';

const MAX_SCRIPT_LENGTH = 500;
const RENDER_TIMEOUT_MS = 180_000;
const VALID_STYLES: HyperFramesStyle[] = ['product', 'social', 'slide'];

// 从 LLM 响应中提取纯 HTML
function extractHtml(raw: string): string | null {
  // 去掉可能的 markdown 代码块
  let html = raw.trim();
  const codeBlock = html.match(/```html?\s*([\s\S]*?)```/i);
  if (codeBlock) html = codeBlock[1].trim();
  // 确保以 <!DOCTYPE 或 <html 开头
  if (html.startsWith('<!DOCTYPE') || html.startsWith('<html')) return html;
  // 尝试从内容中找 HTML 起始
  const start = html.search(/<!DOCTYPE|<html/i);
  if (start >= 0) return html.substring(start);
  return null;
}

// 清洗 LLM 生成的 HTML：移除 Google Fonts、外部 CDN、修复 HyperFrames 结构
function sanitizeHtml(html: string): string {
  let cleaned = html;

  // 1. 移除 Google Fonts <link> 标签
  cleaned = cleaned.replace(/<link[^>]*fonts\.googleapis\.com[^>]*\/?>/gi, '');
  cleaned = cleaned.replace(/<link[^>]*fonts\.gstatic\.com[^>]*\/?>/gi, '');

  // 2. 移除 CSS 中的 Google Fonts @import
  cleaned = cleaned.replace(/@import\s+url\(https?:\/\/fonts\.googleapis\.com[^)]*\)\s*;?/gi, '');

  // 3. 移除外部 CDN 的 GSAP/JS 引用
  cleaned = cleaned.replace(/<script[^>]*src="https?:\/\/[^"]*gsap[^"]*"[^>]*>\s*<\/script>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*src='https?:\/\/[^']*gsap[^']*'[^>]*>\s*<\/script>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*src="https?:\/\/(cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare\.com)[^"]*"[^>]*>\s*<\/script>/gi, '');

  // 4. 确保本地 GSAP 引用存在
  if (!/gsap\.min\.js/.test(cleaned)) {
    cleaned = cleaned.replace(
      /(<\/head>)/i,
      '<script src="gsap.min.js"></script>\n$1'
    );
    if (!/<head/i.test(cleaned)) {
      cleaned = cleaned.replace(
        /(<body[^>]*>)/i,
        '$1\n<script src="gsap.min.js"></script>'
      );
    }
  }

  // 5. 修复 GSAP 引用路径
  cleaned = cleaned.replace(/src="\/js\/gsap\.min\.js"/gi, 'src="gsap.min.js"');

  // 6. 强制 font-family 为 sans-serif（HyperFrames 无法映射 PingFang SC / Microsoft YaHei / Noto Sans SC）
  //    Noto Sans SC 会触发 HyperFrames 从 Google Fonts 下载 909 个字体变体
  cleaned = cleaned.replace(
    /font-family\s*:\s*[^;"]+/gi,
    'font-family: sans-serif'
  );

  // 7. 修复 HyperFrames 根元素必需的属性
  //    如果根 div 缺少 data-composition-id，添加它
  if (!/data-composition-id\s*=/.test(cleaned)) {
    // 在第一个 <div 中注入（body 内部的第一个 div，通常是 wrapper）
    cleaned = cleaned.replace(
      /(<body[^>]*>\s*<div)([^>]*)/i,
      '$1 data-composition-id="main" data-width="1080" data-height="1920" data-duration="15"$2'
    );
  }
  // 确保 data-width / data-height 存在
  if (!/data-width\s*=/.test(cleaned)) {
    cleaned = cleaned.replace(
      /data-composition-id="main"/i,
      'data-composition-id="main" data-width="1080" data-height="1920" data-duration="15"'
    );
  }
  if (!/data-height\s*=/.test(cleaned)) {
    cleaned = cleaned.replace(
      /data-composition-id="main"/i,
      'data-composition-id="main" data-width="1080" data-height="1920"'
    );
  }
  // 确保 data-duration 存在
  if (!/data-duration\s*=/.test(cleaned)) {
    cleaned = cleaned.replace(
      /data-composition-id="main"/i,
      'data-composition-id="main" data-width="1080" data-height="1920" data-duration="15"'
    );
  }

  // 8. 确保 GSAP scoped selector（修复 unscoped_gsap_selector 警告）
  //    将 .className 替换为 [data-composition-id="main"] .className
  //    已 scoped 的不重复替换
  cleaned = cleaned.replace(
    /(tl\.\w+\()\s*"\.(?!\[data-composition-id)/g,
    '$1"[data-composition-id=\\"main\\"] .'
  );
  cleaned = cleaned.replace(
    /(tl\.\w+\()\s*'\.(?!\[data-composition-id)/g,
    "$1'[data-composition-id=\"main\"] ."
  );

  return cleaned;
}

// 上传到 Supabase Storage
async function uploadToStorage(localPath: string, userId: string, fileName: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const buffer = readFileSync(localPath);
    const storagePath = `videos/${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('lingji-media')
      .upload(storagePath, buffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) {
      console.error('[HyperFrames] 上传失败:', uploadError.message);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('lingji-media')
      .getPublicUrl(storagePath);

    return publicUrl;
  } catch (e) {
    console.error('[HyperFrames] 上传异常:', e);
    return null;
  }
}

export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { script, topic, style, duration } = body as {
    script?: string;
    topic?: string;
    style?: string;
    duration?: number;
  };

  // 校验
  if (!script || typeof script !== 'string' || !script.trim()) {
    return createApiError('script 必填', 400);
  }
  if (script.length > MAX_SCRIPT_LENGTH) {
    return createApiError(`script 不超过 ${MAX_SCRIPT_LENGTH} 字`, 400);
  }

  const effectiveStyle: HyperFramesStyle = VALID_STYLES.includes(style as HyperFramesStyle)
    ? (style as HyperFramesStyle)
    : 'product';

  const effectiveDuration = duration && typeof duration === 'number' && duration >= 5 && duration <= 60
    ? Math.round(duration)
    : undefined;

  const creditCost = CREDIT_COSTS.ai_hyperframes.perVideo;

  // 预扣
  try {
    await consume(user.id, creditCost, 'hyperframes', 'HyperFrames 动态图形视频', {
      style: effectiveStyle,
      scriptLength: script.length,
    });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          success: false,
          error: `余额不足：需要 ${creditCost} 灵力，当前 ${e.available} 灵力`,
          code: 'INSUFFICIENT_CREDITS',
          data: { required: creditCost, available: e.available },
        },
        { status: 402 }
      );
    }
    throw e;
  }

  const dir = getTempDir('hyperframes');
  let htmlPath: string | null = null;

  try {
    // 1. LLM 生成 HTML+GSAP
    console.log(`[HyperFrames] 开始生成 HTML, style=${effectiveStyle}, script长度=${script.length}`);
    const prompt = buildHyperFramesPrompt({
      script: script.trim(),
      topic: topic?.trim(),
      style: effectiveStyle,
      duration: effectiveDuration,
    });

    const llmResult = await callDeepSeek(prompt, { temperature: 0.8, maxTokens: 4096 });
    if (!llmResult) {
      await refund(user.id, creditCost, 'hyperframes', 'LLM 生成失败退点', {}).catch(() => {});
      return createApiError('AI 生成 HTML 失败', 500);
    }

    const rawHtml = extractHtml(llmResult);
    if (!rawHtml) {
      console.error('[HyperFrames] LLM 返回非 HTML:', llmResult.substring(0, 300));
      await refund(user.id, creditCost, 'hyperframes', 'LLM 返回格式错误退点', {}).catch(() => {});
      return createApiError('AI 返回格式错误，未包含有效 HTML', 500);
    }

    const html = sanitizeHtml(rawHtml);

    // 2. 写入临时目录
    mkdirSync(dir, { recursive: true });
    htmlPath = join(dir, 'index.html');
    writeFileSync(htmlPath, html, 'utf-8');

    // 创建 meta.json
    const meta = {
      resolution: { width: 1080, height: 1920 },
      duration: effectiveDuration || 10,
      fps: 30,
    };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta), 'utf-8');

    // 复制本地 GSAP（避免 CDN 超时）
    const localGsap = join(process.cwd(), 'public/js/gsap.min.js');
    const gsapDest = join(dir, 'gsap.min.js');
    try {
      const gsapContent = readFileSync(localGsap);
      writeFileSync(gsapDest, gsapContent);
    } catch {
      console.warn('[HyperFrames] 本地 GSAP 不可用，HTML 需使用 CDN');
    }

    console.log(`[HyperFrames] HTML 已写入: ${htmlPath}, 大小: ${html.length} 字节`);

    // 3. HyperFrames 渲染
    console.log('[HyperFrames] 开始渲染...');
    const renderStart = Date.now();

    try {
      // 使用绝对路径调用 hyperframes（cwd 在临时目录，npx 无法解析）
      const hyperframesBin = join(process.cwd(), 'node_modules/.bin/hyperframes');
      execSync(`${hyperframesBin} render`, {
        cwd: dir,
        timeout: RENDER_TIMEOUT_MS,
        stdio: 'pipe',
        env: {
          ...process.env,
          PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
          HYPERFRAMES_NO_TELEMETRY: '1',
        },
      });
    } catch (renderErr: any) {
      const stderr = renderErr.stderr?.toString() || '';
      console.error('[HyperFrames] 渲染失败:', stderr.substring(0, 500));
      await refund(user.id, creditCost, 'hyperframes', 'HyperFrames 渲染失败退点', {
        error: stderr.substring(0, 200),
      }).catch(() => {});
      cleanupTempDir(dir);
      return createApiError('视频渲染失败，请稍后重试', 500);
    }

    const renderMs = Date.now() - renderStart;
    console.log(`[HyperFrames] 渲染完成, 耗时: ${(renderMs / 1000).toFixed(1)}s`);

    // 4. 找到输出文件
    const rendersDir = join(dir, 'renders');
    const { readdirSync } = await import('fs');
    const files = readdirSync(rendersDir);
    const mp4File = files.find((f) => f.endsWith('.mp4'));
    if (!mp4File) {
      await refund(user.id, creditCost, 'hyperframes', '渲染输出未找到退点', {}).catch(() => {});
      cleanupTempDir(dir);
      return createApiError('渲染完成但未找到视频文件', 500);
    }

    const videoPath = join(rendersDir, mp4File);
    const fileSize = statSync(videoPath).size;
    console.log(`[HyperFrames] 输出: ${mp4File}, 大小: ${(fileSize / 1024).toFixed(1)}KB`);

    // 5. 上传到 Supabase Storage
    const fileName = `hyperframes_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`;
    const publicUrl = await uploadToStorage(videoPath, user.id, fileName);

    if (!publicUrl) {
      await refund(user.id, creditCost, 'hyperframes', '上传失败退点', {}).catch(() => {});
      cleanupTempDir(dir);
      return createApiError('视频上传存储失败，请重试', 500);
    }

    // 6. 保存历史记录
    const videoDuration = effectiveDuration || 10;
    await saveWorkHistory(user.id, `动态图形 · ${topic || script.substring(0, 30)}`, {
      source_platform: 'ai_hyperframes',
      generatedVideo: {
        videoUrl: publicUrl,
        duration: videoDuration,
        style: effectiveStyle,
        scriptLength: script.length,
      },
    });

    // 清理
    cleanupTempDir(dir);

    return createApiResponse({
      videoUrl: publicUrl,
      duration: videoDuration,
      creditsUsed: creditCost,
    }, '动态图形视频生成完成');
  } catch (e: any) {
    console.error('[HyperFrames] 异常:', e);
    // 兜底退款（如果还没退）
    try {
      await refund(user.id, creditCost, 'hyperframes', '异常退点', {
        error: String(e?.message).substring(0, 200),
      }).catch(() => {});
    } catch {}
    if (dir) cleanupTempDir(dir);
    return createApiError(e.message || '生成失败', 500);
  }
});
