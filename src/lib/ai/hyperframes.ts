// HyperFrames 动态图形视频生成 — 脚本 → HTML+GSAP → 渲染 → 上传
// 同时供 API route 和 Agent tool 使用

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, statSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '@/lib/supabase-server';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { callDeepSeek } from '@/lib/ai-services';
import { consume, refund, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { saveWorkHistory } from '@/lib/supabase-server';
import { buildHyperFramesPrompt, type HyperFramesStyle } from '@/lib/hyperframes/prompt';

const MAX_SCRIPT_LENGTH = 500;
const RENDER_TIMEOUT_MS = 180_000;
const VALID_STYLES: HyperFramesStyle[] = ['product', 'social', 'slide'];

function extractHtml(raw: string): string | null {
  let html = raw.trim();
  const codeBlock = html.match(/```html?\s*([\s\S]*?)```/i);
  if (codeBlock) html = codeBlock[1].trim();
  if (html.startsWith('<!DOCTYPE') || html.startsWith('<html')) return html;
  const start = html.search(/<!DOCTYPE|<html/i);
  if (start >= 0) return html.substring(start);
  return null;
}

function sanitizeHtml(html: string): string {
  let cleaned = html;
  cleaned = cleaned.replace(/<link[^>]*fonts\.googleapis\.com[^>]*\/?>/gi, '');
  cleaned = cleaned.replace(/<link[^>]*fonts\.gstatic\.com[^>]*\/?>/gi, '');
  cleaned = cleaned.replace(/@import\s+url\(https?:\/\/fonts\.googleapis\.com[^)]*\)\s*;?/gi, '');
  cleaned = cleaned.replace(/<script[^>]*src="https?:\/\/[^"]*gsap[^"]*"[^>]*>\s*<\/script>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*src='https?:\/\/[^']*gsap[^']*'[^>]*>\s*<\/script>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*src="https?:\/\/(cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare\.com)[^"]*"[^>]*>\s*<\/script>/gi, '');

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

  cleaned = cleaned.replace(/src="\/js\/gsap\.min\.js"/gi, 'src="gsap.min.js"');
  cleaned = cleaned.replace(/font-family\s*:\s*[^;"]+/gi, 'font-family: sans-serif');

  if (!/data-composition-id\s*=/.test(cleaned)) {
    cleaned = cleaned.replace(
      /(<body[^>]*>\s*<div)([^>]*)/i,
      '$1 data-composition-id="main" data-width="1080" data-height="1920" data-duration="15"$2'
    );
  }
  if (!/data-width\s*=/.test(cleaned)) {
    cleaned = cleaned.replace(
      /data-composition-id="main"/i,
      'data-composition-id="main" data-width="1080" data-height="1920" data-duration="15"'
    );
  }
  if (!/data-duration\s*=/.test(cleaned)) {
    cleaned = cleaned.replace(
      /data-composition-id="main"/i,
      'data-composition-id="main" data-width="1080" data-height="1920" data-duration="15"'
    );
  }

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

async function uploadToStorage(localPath: string, userId: string, fileName: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const buffer = readFileSync(localPath);
    const storagePath = `videos/${userId}/${fileName}`;

    const { error } = await supabase.storage
      .from('lingji-media')
      .upload(storagePath, buffer, { contentType: 'video/mp4', upsert: true });

    if (error) {
      console.error('[HyperFrames] 上传失败:', error.message);
      return null;
    }

    const { data } = supabase.storage.from('lingji-media').getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (e) {
    console.error('[HyperFrames] 上传异常:', e);
    return null;
  }
}

export interface HyperFramesInput {
  script: string;
  userId: string;
  topic?: string;
  style?: HyperFramesStyle;
  duration?: number;
}

export interface HyperFramesResult {
  success: boolean;
  videoUrl?: string;
  duration?: number;
  creditsUsed?: number;
  error?: string;
}

export async function generateHyperFramesVideo(input: HyperFramesInput): Promise<HyperFramesResult> {
  const { script, userId, topic, duration } = input;

  if (!script?.trim()) return { success: false, error: '脚本内容不能为空' };
  if (script.length > MAX_SCRIPT_LENGTH) return { success: false, error: `脚本不超过 ${MAX_SCRIPT_LENGTH} 字` };

  const effectiveStyle: HyperFramesStyle = VALID_STYLES.includes(input.style as HyperFramesStyle)
    ? (input.style as HyperFramesStyle) : 'product';

  const effectiveDuration = duration && duration >= 5 && duration <= 60 ? Math.round(duration) : undefined;
  const creditCost = CREDIT_COSTS.ai_hyperframes.perVideo;

  try {
    await consume(userId, creditCost, 'hyperframes', 'HyperFrames 动态图形视频', {
      style: effectiveStyle,
      scriptLength: script.length,
    });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return { success: false, error: `灵力不足：需要 ${creditCost}，当前 ${e.available}` };
    }
    throw e;
  }

  const dir = getTempDir('hyperframes');

  try {
    const prompt = buildHyperFramesPrompt({
      script: script.trim(),
      topic: topic?.trim(),
      style: effectiveStyle,
      duration: effectiveDuration,
    });

    const llmResult = await callDeepSeek(prompt, { temperature: 0.8, maxTokens: 4096 });
    if (!llmResult) {
      await refund(userId, creditCost, 'hyperframes', 'LLM 失败退点', {}).catch(() => {});
      return { success: false, error: 'AI 生成 HTML 失败' };
    }

    const rawHtml = extractHtml(llmResult);
    if (!rawHtml) {
      await refund(userId, creditCost, 'hyperframes', 'LLM 格式错误退点', {}).catch(() => {});
      return { success: false, error: 'AI 返回格式错误，未包含有效 HTML' };
    }

    const html = sanitizeHtml(rawHtml);

    mkdirSync(dir, { recursive: true });
    const htmlPath = join(dir, 'index.html');
    writeFileSync(htmlPath, html, 'utf-8');

    const meta = { resolution: { width: 1080, height: 1920 }, duration: effectiveDuration || 10, fps: 30 };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta), 'utf-8');

    const localGsap = join(process.cwd(), 'public/js/gsap.min.js');
    try {
      writeFileSync(join(dir, 'gsap.min.js'), readFileSync(localGsap));
    } catch {
      console.warn('[HyperFrames] 本地 GSAP 不可用');
    }

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

    const rendersDir = join(dir, 'renders');
    const files = readdirSync(rendersDir);
    const mp4File = files.find((f) => f.endsWith('.mp4'));
    if (!mp4File) {
      await refund(userId, creditCost, 'hyperframes', '渲染输出未找到退点', {}).catch(() => {});
      return { success: false, error: '渲染完成但未找到视频文件' };
    }

    const videoPath = join(rendersDir, mp4File);
    const fileName = `hyperframes_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`;
    const publicUrl = await uploadToStorage(videoPath, userId, fileName);

    if (!publicUrl) {
      await refund(userId, creditCost, 'hyperframes', '上传失败退点', {}).catch(() => {});
      return { success: false, error: '视频上传存储失败' };
    }

    const videoDuration = effectiveDuration || 10;
    await saveWorkHistory(userId, `动态图形 · ${topic || script.substring(0, 30)}`, {
      source_platform: 'ai_hyperframes',
      generatedVideo: { videoUrl: publicUrl, duration: videoDuration, style: effectiveStyle, scriptLength: script.length },
    });

    return { success: true, videoUrl: publicUrl, duration: videoDuration, creditsUsed: creditCost };
  } catch (e: any) {
    console.error('[HyperFrames] 异常:', e);
    try { await refund(userId, creditCost, 'hyperframes', '异常退点', { error: String(e?.message).substring(0, 200) }).catch(() => {}); } catch {}
    return { success: false, error: e.message || '生成失败' };
  } finally {
    if (dir) cleanupTempDir(dir);
  }
}
