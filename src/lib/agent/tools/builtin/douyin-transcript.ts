// 抖音文案提取工具
// 快速路径：iesdouyin SSR 页面解析 → 提取已有字幕/描述
// 降级路径：下载视频 → ffmpeg 提取音频 → DashScope Paraformer ASR
// 批量提取：并行处理多个视频链接

import type { ToolDefinition } from '../../types';
import { getDashScopeApiKey } from '@/lib/runtime-config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

// ── 快速路径：直接从 iesdouyin SSR 页面提取视频描述 ──

interface DouyinPageData {
  desc?: string;
  rawText?: string;
  captions?: string;
}

async function extractFromSSRPage(videoId: string): Promise<DouyinPageData | null> {
  try {
    const ssrUrl = `https://www.iesdouyin.com/share/video/${videoId}/?app=douyin_select`;
    const res = await fetch(ssrUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'zh-CN' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();

    // 尝试从 __INITIAL_STATE__ 或内嵌 JSON 提取
    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/) ||
                       html.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        const item = state?.itemList?.[0] || state?.item || {};
        return {
          desc: item.desc || '',
          rawText: item.rawText || '',
        };
      } catch { /* JSON parse failed, try regex fallback */ }
    }

    // Regex 降级提取
    const descMatch = html.match(/"desc"\s*:\s*"([^"]+)"/);
    return descMatch ? { desc: descMatch[1] } : null;
  } catch {
    return null;
  }
}

// ── ASR 转写（Supabase 临时上传 → DashScope Paraformer） ──

async function recognizeAudioFile(audioPath: string): Promise<string> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY 未配置');

  const { createAdminClient } = await import('@/lib/supabase-server');
  const supabase = createAdminClient();

  const audioBuffer = await readFile(audioPath);
  const storageKey = `transcribe/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;

  const { error: uploadErr } = await supabase.storage
    .from('lingji-media')
    .upload(storageKey, audioBuffer, { contentType: 'audio/mpeg', upsert: false });

  if (uploadErr) throw new Error(`音频上传失败: ${uploadErr.message}`);

  const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
  const publicUrl = urlData.publicUrl;

  try {
    const submitRes = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: 'paraformer-v2',
          input: { file_urls: [publicUrl] },
          parameters: {
            format: 'mp3',
            sample_rate: 16000,
            disfluency_removal_enabled: false,
          },
        }),
      }
    );

    const submitData = await submitRes.json();
    if (!submitRes.ok) throw new Error(submitData.message || 'ASR 任务提交失败');

    const taskId = submitData.output?.task_id;
    if (!taskId) throw new Error('未获取到 ASR 任务 ID');

    // 轮询结果（最长 2 分钟）
    for (let i = 0; i < 30; i++) {
      const pollRes = await fetch(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      const pollData = await pollRes.json();
      const status = pollData.output?.task_status;

      if (status === 'SUCCEEDED') {
        const transcriptionUrl = pollData.output?.results?.[0]?.transcription_url;
        if (!transcriptionUrl) throw new Error('转录结果 URL 为空');
        const transcriptRes = await fetch(transcriptionUrl);
        const transcriptData = await transcriptRes.json();
        const parts: string[] = [];
        for (const ch of transcriptData.transcripts || []) {
          if (ch.text) parts.push(ch.text);
          for (const s of ch.sentences || []) {
            if (s.text?.trim()) parts.push(s.text);
          }
        }
        return parts.join('').trim() || parts.map((t) => t.trim()).join('\n').trim();
      }
      if (status === 'FAILED') throw new Error(pollData.output?.message || 'ASR 转写失败');
      await new Promise((r) => setTimeout(r, 4000));
    }
    throw new Error('ASR 转写超时（2 分钟）');
  } finally {
    // 清理 Supabase 上的临时音频文件
    await supabase.storage.from('lingji-media').remove([storageKey]).catch(() => {});
  }
}

// ── 下载 + 提取音频 + ASR ──

interface ExtractResult {
  success: boolean;
  title?: string;
  transcript?: string;
  method: 'direct' | 'asr';
  error?: string;
}

async function extractSingleVideo(url: string): Promise<ExtractResult> {
  let tmpDir: string | null = null;

  try {
    // 1. 解析视频 ID
    const vidMatch = url.match(/\/video\/(\d+)/) || url.match(/\/share\/video\/(\d+)/);
    const videoId = vidMatch?.[1];
    if (!videoId) {
      // 尝试跟随重定向获取真实 URL
      try {
        const probe = await fetch(url, {
          headers: { 'User-Agent': UA },
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
        const finalUrl = probe.url || url;
        const fvMatch = finalUrl.match(/\/video\/(\d+)/) || finalUrl.match(/\/share\/video\/(\d+)/);
        const fvId = fvMatch?.[1];
        if (fvId) {
          // 递归调用自己，用解析出的完整 URL
          return extractSingleVideo(`https://www.douyin.com/video/${fvId}`);
        }
      } catch { /* 继续 */ }
      return { success: false, method: 'direct', error: '无法从链接中解析视频 ID' };
    }

    // 2. 快速路径：直接从 SSR 页面提取描述文案
    const pageData = await extractFromSSRPage(videoId);
    const title = pageData?.desc || '';

    // 3. 下载视频（使用 iesdouyin SSR 解析拿到直链）
    const ssrUrl = `https://www.iesdouyin.com/share/video/${videoId}/?app=douyin_select`;
    const pageRes = await fetch(ssrUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'zh-CN' },
      signal: AbortSignal.timeout(15000),
    });
    const html = await pageRes.text();

    const urlMatch = html.match(
      /"play_addr":\{"uri":"[^"]*","url_list":\["(https:\\u002F\\u002F[^"]+)"/
    );
    if (!urlMatch) {
      return {
        success: !!title,
        title,
        transcript: title,
        method: 'direct',
        error: title ? undefined : '无法从页面解析视频地址',
      };
    }

    let videoUrl = urlMatch[1].replace(/\\u002F/g, '/');

    // 4. 下载视频
    tmpDir = await mkdtemp(join(tmpdir(), 'dy-trans-'));
    const videoPath = join(tmpDir, 'video.mp4');
    const videoRes = await fetch(videoUrl, {
      headers: { 'User-Agent': UA, Referer: 'https://www.iesdouyin.com/' },
      signal: AbortSignal.timeout(60000),
    });
    if (!videoRes.ok) throw new Error(`视频下载失败: HTTP ${videoRes.status}`);

    const buffer = Buffer.from(await videoRes.arrayBuffer());
    await writeFile(videoPath, buffer);

    // 5. ffmpeg 提取音频
    const audioPath = join(tmpDir, 'audio.mp3');
    await execAsync(
      `ffmpeg -i "${videoPath}" -vn -acodec mp3 -q:a 3 -y "${audioPath}" 2>&1`,
      { timeout: 60000 }
    );

    // 6. DashScope ASR 识别
    const transcript = await recognizeAudioFile(audioPath);

    return {
      success: true,
      title,
      transcript: transcript || title,
      method: 'asr',
    };
  } catch (e) {
    return {
      success: false,
      method: 'asr',
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (tmpDir) {
      try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
}

// ── 从分享文本中提取链接 ──

function extractUrls(text: string): string[] {
  const patterns = [
    /https?:\/\/v\.douyin\.com\/[A-Za-z0-9]+\/?/g,
    /https?:\/\/www\.douyin\.com\/video\/\d+/g,
    /https?:\/\/www\.iesdouyin\.com\/share\/video\/\d+/g,
  ];
  const urls = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      urls.add(match[0]);
    }
  }
  return [...urls];
}

// ── Tool Definition ──

export const douyinTranscriptTool: ToolDefinition = {
  name: 'douyin_transcript',
  description: `提取抖音视频文案（语音转文字）。支持：
- 单个视频链接（https://v.douyin.com/xxx 或 https://www.douyin.com/video/xxx）
- 含链接的分享文本（自动从中提取链接）
- 多个视频链接，批量提取
底层：iesdouyin SSR 页面解析 + ffmpeg 音频提取 + DashScope Paraformer ASR 语音识别。`,
  parameters: {
    type: 'object',
    properties: {
      urls: {
        type: 'string',
        description:
          '抖音视频链接或含链接的分享文本。支持短链（v.douyin.com）、长链（www.douyin.com/video/xxx）、iesdouyin 分享链。多个链接用换行或逗号分隔，或直接粘贴抖音复制的分享文本。',
      },
      fast_only: {
        type: 'boolean',
        description: '是否仅使用快速提取（不下载视频，只提取页面上的描述文案）。默认 false，会下载视频做语音识别。',
      },
    },
    required: ['urls'],
  },
  async handler(params: Record<string, unknown>) {
    const raw = params.urls as string;
    const fastOnly = (params.fast_only as boolean) || false;

    const urls = extractUrls(raw);
    if (urls.length === 0) {
      return {
        success: false,
        output: '未识别到抖音视频链接。请提供 v.douyin.com 或 www.douyin.com/video/xxx 格式的链接。',
        error: 'NO_URL_FOUND',
      };
    }

    const apiKey = getDashScopeApiKey();
    if (!fastOnly && !apiKey) {
      return {
        success: false,
        output: '语音识别需要 DASHSCOPE_API_KEY，但当前未配置。可设置 fast_only=true 仅提取页面描述。',
        error: 'NO_API_KEY',
      };
    }

    const results: ExtractResult[] = [];
    for (const url of urls) {
      if (fastOnly) {
        const vidMatch = url.match(/\/video\/(\d+)/) || url.match(/\/share\/video\/(\d+)/);
        if (vidMatch?.[1]) {
          const pageData = await extractFromSSRPage(vidMatch[1]);
          results.push({
            success: !!pageData?.desc,
            title: pageData?.desc || '',
            transcript: pageData?.desc || '',
            method: 'direct',
            error: pageData?.desc ? undefined : '未提取到描述',
          });
        } else {
          results.push({ success: false, method: 'direct', error: '无法解析视频 ID' });
        }
      } else {
        const result = await extractSingleVideo(url);
        results.push(result);
      }
    }

    // 格式化输出
    if (results.length === 1) {
      const r = results[0];
      if (!r.success) return { success: false, output: '', error: r.error || '提取失败' };
      const methodLabel = r.method === 'direct' ? '📝 页面描述' : '🎙️ 语音识别';
      const lines = [
        r.title ? `【视频标题】${r.title}` : '',
        '',
        `【文案内容】(${methodLabel})`,
        r.transcript || '(未提取到内容)',
        '',
        `【来源】${urls[0]}`,
      ];
      return { success: true, output: lines.join('\n'), data: { title: r.title, transcript: r.transcript, method: r.method } };
    }

    // 批量结果
    const summaryLines: string[] = [];
    const allData: { title?: string; transcript?: string; method: string; url: string; success: boolean; error?: string }[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const prefix = r.success ? '✅' : '❌';
      const snippet = r.transcript?.substring(0, 60) || r.error || '';
      summaryLines.push(`${i + 1}. ${prefix} ${r.title?.substring(0, 40) || '(无标题)'} — ${snippet}`);
      allData.push({ ...r, url: urls[i] });
    }

    const fullOutput = results
      .map((r, i) => {
        if (!r.success) return `${i + 1}. ❌ 提取失败: ${r.error}\n   链接: ${urls[i]}`;
        const methodLabel = r.method === 'direct' ? '📝 页面描述' : '🎙️ 语音识别';
        return `${i + 1}. ${r.title || '(无标题)'}\n   ${methodLabel}: ${r.transcript}\n   链接: ${urls[i]}`;
      })
      .join('\n\n');

    return {
      success: true,
      output: `共提取 ${results.length} 个视频文案：\n\n${summaryLines.join('\n')}\n\n---\n\n${fullOutput}`,
      data: { results: allData, total: results.length, successCount: results.filter((r) => r.success).length },
    };
  },
};
