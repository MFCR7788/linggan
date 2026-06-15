// 封面生成器 — 生成端点（下载选中帧 + 合成封面）
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { compositeCover } from '@/lib/ai/cover-generator';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { consume } from '@/lib/credits';
import type { CoverStyle } from '@/lib/ai/cover-generator';

export const maxDuration = 60;

interface GenerateBody {
  frameUrl: string;
  title: string;
  coverStyle?: CoverStyle;
  fontSize?: number;
  fontColor?: string;
}

export const POST = withAuth(async ({ request, user }) => {
  const body: GenerateBody = await request.json();
  const { frameUrl, title, coverStyle = '大字报', fontSize = 72, fontColor = '#FFFFFF' } = body;

  if (!frameUrl) return createApiError('请提供关键帧图片 URL', 400);
  if (!title) return createApiError('请提供封面标题', 400);

  // 扣点
  try {
    await consume(user.id, 2, 'cover_generator', 'AI 封面生成');
  } catch (creditErr) {
    const msg = creditErr instanceof Error ? creditErr.message : '';
    if (msg.includes('Insufficient') || msg.includes('余额不足') || msg.includes('点数不足')) {
      return createApiResponse({ code: 'INSUFFICIENT_CREDITS', required: 2 }, '余额不足');
    }
    throw creditErr;
  }

  const dir = getTempDir('cover-generate');

  try {
    // 1. 下载选中的帧
    const framePath = join(dir, 'selected_frame.jpg');
    const resp = await fetch(frameUrl);
    if (!resp.ok) throw new Error('关键帧下载失败');
    writeFileSync(framePath, Buffer.from(await resp.arrayBuffer()));

    // 2. 合成封面
    const { buffer } = await compositeCover(framePath, title, dir, {
      style: coverStyle,
      fontSize,
      fontColor,
    });

    // 3. 上传到 Supabase
    const supabase = createAdminClient();
    const storageKey = `covers/${user.id}/${Date.now()}-cover.png`;
    const { error: uploadErr } = await supabase.storage
      .from('lingji-media')
      .upload(storageKey, buffer, { contentType: 'image/png', upsert: false });

    if (uploadErr) throw new Error(`上传失败: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);

    cleanupTempDir(dir);

    return createApiResponse({
      coverUrl: urlData.publicUrl,
      storageKey,
      width: 1080,
      height: 1920,
      style: coverStyle,
    }, '封面生成成功');
  } catch (e) {
    try { cleanupTempDir(dir); } catch {}
    console.error('[cover-generator generate] 错误:', e);
    return createApiError(`封面生成失败: ${e instanceof Error ? e.message : '未知错误'}`, 500);
  }
});
