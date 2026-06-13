// 多平台内容提取工具 — 支持抖音/小红书/B站/今日头条/腾讯新闻 等
// 文字类 → jina.ai Reader 提取
// 视频类 → yt-dlp/douyin-cli 下载 → ffmpeg 提取音频 → FunASR 语音识别

import type { ToolDefinition } from '../../types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

// ── 平台 URL 模式 ──

const PLATFORM_PATTERNS: { name: string; hostPatterns: string[]; type: 'video' | 'text' | 'mixed' }[] = [
  {
    name: '抖音',
    hostPatterns: ['douyin.com', 'iesdouyin.com', 'v.douyin.com'],
    type: 'video',
  },
  {
    name: 'B站',
    hostPatterns: ['bilibili.com', 'b23.tv'],
    type: 'video',
  },
  {
    name: '小红书',
    hostPatterns: ['xiaohongshu.com', 'xhslink.com'],
    type: 'mixed',
  },
  {
    name: '今日头条',
    hostPatterns: ['toutiao.com', 'ixigua.com'],
    type: 'mixed',
  },
  {
    name: '腾讯新闻',
    hostPatterns: ['new.qq.com', 'view.inews.qq.com'],
    type: 'text',
  },
  {
    name: '快手',
    hostPatterns: ['kuaishou.com', 'v.kuaishou.com'],
    type: 'video',
  },
  {
    name: '微博视频',
    hostPatterns: ['weibo.com/tv', 'weibo.cn/tv'],
    type: 'video',
  },
  {
    name: '知乎',
    hostPatterns: ['zhihu.com'],
    type: 'text',
  },
];

function detectPlatform(url: string): (typeof PLATFORM_PATTERNS)[number] | null {
  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  return PLATFORM_PATTERNS.find((p) => p.hostPatterns.some((h) => host.includes(h))) || null;
}

// ── 链接提取 ──

const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];
  return [...new Set(matches)];
}

// ── 方法 1: jina.ai Reader（文字内容提取）──

interface JinaResult {
  success: boolean;
  content?: string;
  title?: string;
  error?: string;
}

async function extractViaJina(url: string): Promise<JinaResult> {
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const res = await fetch(jinaUrl, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    // 尝试提取标题（jina.ai 会返回 Markdown 格式，第一行是标题）
    const lines = text.split('\n').filter(Boolean);
    const title = lines[0]?.startsWith('Title:') ? lines[0].replace('Title:', '').trim() : '';

    return { success: true, content: text.substring(0, 8000), title };
  } catch (e) {
    return { success: false, error: `jina.ai 提取失败: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── 方法 2: 视频下载 → ffmpeg 音频 → ASR ──

// yt-dlp 使用 Python 3.11（ECS 默认 3.6 太旧，3.11 才有最新 yt-dlp）
const YTDLP_CMD = 'python3.11 -m yt_dlp';

async function downloadViaYTDLP(url: string, workDir: string): Promise<string | null> {
  try {
    const outputPath = join(workDir, '%(id)s.%(ext)s');
    await execAsync(
      `${YTDLP_CMD} --no-playlist --max-filesize 300M -f "best[ext=mp4]/best" -o "${outputPath}" "${url}" 2>&1`,
      { timeout: 120000, maxBuffer: 1024 * 1024 }
    );

    const { readdir } = await import('fs/promises');
    const files = await readdir(workDir);
    const videoFile = files.find((f) => f.endsWith('.mp4') || f.endsWith('.mov') || f.endsWith('.webm') || f.endsWith('.mkv'));
    return videoFile ? join(workDir, videoFile) : null;
  } catch {
    return null;
  }
}

// ── 方法 2b: B站公开 API 提取（无需下载视频）──

interface BilibiliInfo {
  title: string;
  desc: string;
  duration: number;
  subtitleText?: string;
}

async function extractBilibili(url: string): Promise<BilibiliInfo | null> {
  try {
    // 提取 BV 号
    const bvMatch = url.match(/BV[a-zA-Z0-9]+/) || url.match(/bilibili\.com\/video\/([a-zA-Z0-9]+)/);
    const bvid = bvMatch?.[1] || bvMatch?.[0];
    if (!bvid) return null;

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const headers = { 'User-Agent': ua, 'Referer': 'https://www.bilibili.com/' };

    // 1. 获取视频信息
    const infoRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers, signal: AbortSignal.timeout(10000),
    });
    if (!infoRes.ok) return null;
    const infoData = await infoRes.json();
    if (infoData.code !== 0) return null;

    const { title, desc, duration, cid } = infoData.data;

    // 2. 尝试获取字幕
    let subtitleText = '';
    try {
      const subRes = await fetch(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`, {
        headers, signal: AbortSignal.timeout(10000),
      });
      if (subRes.ok) {
        const subData = await subRes.json();
        const subtitles = subData.data?.subtitle?.subtitles || [];
        if (subtitles.length > 0) {
          // 优先选中文/英文
          const sub = subtitles.find((s: any) => s.lan === 'ai-zh' || s.lan === 'zh-Hans') || subtitles[0];
          let subUrl = sub.subtitle_url || '';
          if (subUrl.startsWith('//')) subUrl = 'https:' + subUrl;
          const subContent = await fetch(subUrl, { headers, signal: AbortSignal.timeout(10000) });
          if (subContent.ok) {
            const subJson = await subContent.json();
            subtitleText = (subJson.body || []).map((item: any) => item.content || '').join('');
          }
        }
      }
    } catch { /* subtitle optional */ }

    return { title, desc, duration, subtitleText: subtitleText || undefined };
  } catch {
    return null;
  }
}

// Douyin 专用：复用 douyin-cli（yt-dlp 对抖音反爬效果差）
async function downloadDouyin(url: string, workDir: string): Promise<{ desc?: string; videoPath?: string; error?: string }> {
  // 尝试用 yt-dlp 先
  const ytdlpResult = await downloadViaYTDLP(url, workDir);
  if (ytdlpResult) return { videoPath: ytdlpResult };

  // 降级 douyin-cli Python 脚本
  try {
    const python = await (async () => {
      try {
        const { stdout } = await execAsync('which douyin');
        const douyinBin = stdout.trim();
        const { stdout: pyOut } = await execAsync(
          `find "$(dirname "${douyinBin}")/.." -path "*/bin/python*" -type f 2>/dev/null | head -1 || echo ""`
        );
        if (pyOut.trim()) return pyOut.trim();
      } catch {}
      return 'python3';
    })();

    const pyScript = `
import json, sys, os
from douyin_cli.douyin import Douyin

result = {"desc": "", "videoPath": "", "error": ""}
def collect(items, _type):
    for item in items:
        result["desc"] = item.get("desc", "") or ""
        break
try:
    douyin = Douyin(
        target=${JSON.stringify(url)}, limit=1, type="aweme",
        down_path=${JSON.stringify(workDir)},
        enable_download_title=False, enable_download_cover=False,
        on_new_items=collect,
    )
    douyin.run()
    for f in os.listdir(${JSON.stringify(workDir)}):
        if f.endswith((".mp4", ".mov", ".webm")):
            result["videoPath"] = os.path.join(${JSON.stringify(workDir)}, f)
            break
except Exception as e:
    result["error"] = str(e)
json.dump(result, sys.stdout, ensure_ascii=False)
`;
    const scriptPath = join(workDir, 'dy_fetch.py');
    await writeFile(scriptPath, pyScript);
    const { stdout } = await execAsync(`${python} "${scriptPath}"`, { timeout: 120000, maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout) as { desc?: string; videoPath?: string; error?: string };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function extractAudio(videoPath: string, workDir: string): Promise<string> {
  const audioPath = join(workDir, 'audio.wav');
  await execAsync(
    `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 -y "${audioPath}" 2>&1`,
    { timeout: 60000 }
  );
  return audioPath;
}

// ── 方法 3: jina.ai 快速描述（仅获取页面标题/摘要，不下载视频）──

async function extractTextFast(url: string): Promise<string> {
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const res = await fetch(jinaUrl, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return '';
    const text = await res.text();
    // 取前 500 字符作为摘要
    return text.substring(0, 500).trim();
  } catch {
    return '';
  }
}

// ── 单链接提取 ──

export interface ExtractResult {
  success: boolean;
  title?: string;
  content?: string;
  transcript?: string;
  method: 'jina_text' | 'video_asr' | 'jina_fast';
  platform?: string;
  error?: string;
}

async function extractSingle(url: string, options: { fastOnly?: boolean } = {}): Promise<ExtractResult> {
  const platform = detectPlatform(url);
  const platformName = platform?.name || '通用网页';
  const contentType = platform?.type || 'text';

  // 纯文字平台 → jina.ai reader
  if (contentType === 'text' || options.fastOnly) {
    const result = await extractViaJina(url);
    if (result.success && result.content) {
      return {
        success: true,
        title: result.title,
        content: result.content,
        transcript: result.content.substring(0, 3000),
        method: 'jina_text',
        platform: platformName,
      };
    }
    return { success: false, method: 'jina_text', platform: platformName, error: result.error };
  }

  // B站 → 公开 API 获取标题+描述+字幕（无需下载视频）
  if (platform?.hostPatterns.some((h) => h.includes('bilibili'))) {
    const biResult = await extractBilibili(url);
    if (biResult) {
      const hasText = biResult.title || biResult.desc || biResult.subtitleText;
      if (hasText) {
        const transcript = biResult.subtitleText
          || biResult.desc
          || biResult.title;
        const content = [
          biResult.title ? `【标题】${biResult.title}` : '',
          biResult.desc ? `\n【简介】${biResult.desc}` : '',
          biResult.subtitleText ? `\n【AI字幕】\n${biResult.subtitleText}` : biResult.desc ? '' : '',
          `\n【时长】${Math.floor(biResult.duration / 60)}分${biResult.duration % 60}秒`,
        ].filter(Boolean).join('');
        return {
          success: true,
          title: biResult.title,
          content,
          transcript,
          method: biResult.subtitleText ? 'video_asr' : 'jina_text',
          platform: platformName,
        };
      }
    }
    // 降级：jina
    const jinaResult = await extractViaJina(url);
    if (jinaResult.success && jinaResult.content) {
      return { success: true, title: jinaResult.title, content: jinaResult.content, transcript: jinaResult.content.substring(0, 3000), method: 'jina_text', platform: platformName };
    }
    return { success: false, method: 'jina_text', platform: platformName, error: jinaResult.error };
  }

  // 视频/混合平台 → 下载视频 + ASR
  let tmpDir: string | null = null;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'extract-'));
    let videoPath: string | null = null;
    let desc = '';

    const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    if (host.includes('douyin.com') || host.includes('iesdouyin.com')) {
      const douyinResult = await downloadDouyin(url, tmpDir);
      desc = douyinResult.desc || '';
      videoPath = douyinResult.videoPath || null;
      if (douyinResult.error && !videoPath) {
        const fastText = desc || await extractTextFast(url);
        if (fastText) {
          return { success: true, title: desc, content: fastText, transcript: fastText, method: 'jina_fast', platform: platformName };
        }
        return { success: false, method: 'video_asr', platform: platformName, error: douyinResult.error };
      }
    } else {
      videoPath = await downloadViaYTDLP(url, tmpDir);
      const fastText = await extractTextFast(url);
      if (fastText) {
        const firstLine = fastText.split('\n')[0]?.trim() || '';
        if (firstLine.length < 200 && !firstLine.startsWith('http')) desc = firstLine;
      }
    }

    if (!videoPath) {
      if (desc) {
        return { success: true, title: desc, content: desc, transcript: desc, method: 'jina_fast', platform: platformName };
      }
      const jinaResult = await extractViaJina(url);
      if (jinaResult.success && jinaResult.content) {
        return {
          success: true,
          title: jinaResult.title,
          content: jinaResult.content,
          transcript: jinaResult.content.substring(0, 3000),
          method: 'jina_text',
          platform: platformName,
        };
      }
      return { success: false, method: 'jina_fast', platform: platformName, error: '视频下载失败，且文本提取也为空' };
    }

    // 提取音频 → ASR
    const audioPath = await extractAudio(videoPath, tmpDir);
    const { recognizeAudio } = await import('@/lib/ai/funasr-client');
    const asrResult = await recognizeAudio(audioPath);

    if (!asrResult.success || !asrResult.text.trim()) {
      return {
        success: !!desc,
        title: desc,
        content: desc || asrResult.error || '',
        transcript: desc || '',
        method: 'jina_fast',
        platform: platformName,
        error: asrResult.error || '未识别到语音',
      };
    }

    return {
      success: true,
      title: desc,
      transcript: asrResult.text,
      method: 'video_asr',
      platform: platformName,
    };
  } catch (e) {
    try {
      const fastText = await extractTextFast(url);
      if (fastText) {
        return { success: true, content: fastText, transcript: fastText, method: 'jina_fast', platform: platformName };
      }
    } catch {}
    return { success: false, method: 'video_asr', platform: platformName, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (tmpDir) {
      try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
}

// ── Tool Definition ──

export const extractContentTool: ToolDefinition = {
  name: 'extract_content',
  description: `提取链接中的文字内容或视频文案（语音转文字）。支持多平台：
- 抖音/B站/快手/微博视频 → 下载视频 → AI语音识别转文字
- 小红书 → 笔记文字提取（视频笔记可下载后转文字）
- 今日头条 → 文章文字提取 / 视频文案提取
- 腾讯新闻 → 文章全文提取
- 知乎/公众号等 → 网页内容提取
- 其他通用网页 → jina.ai 智能提取正文

自动识别平台并选择最佳提取方式。支持批量提取多个链接。`,
  parameters: {
    type: 'object',
    properties: {
      urls: {
        type: 'string',
        description: '要提取的链接。支持多平台 URL，多个链接用换行或逗号分隔，或直接粘贴包含链接的分享文本。',
      },
      fast_only: {
        type: 'boolean',
        description: '是否仅快速提取（不下载视频，只获取页面文字/标题）。默认 false',
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
        output: '未识别到有效链接。请提供完整的 URL（如 https://v.douyin.com/xxx、https://www.xiaohongshu.com/xxx 等）。',
        error: 'NO_URL_FOUND',
      };
    }

    const results: ExtractResult[] = [];
    for (const url of urls) {
      const result = await extractSingle(url, { fastOnly });
      results.push(result);
    }

    // ── 格式化输出 ──

    if (results.length === 1) {
      const r = results[0];
      if (!r.success) return { success: false, output: '', error: r.error || '提取失败' };

      const methodLabels: Record<string, string> = {
        video_asr: '🎙️ 视频语音识别',
        jina_text: '📄 网页内容提取',
        jina_fast: '📝 页面摘要',
      };
      const methodLabel = methodLabels[r.method] || r.method;

      const lines = [
        `【平台】${r.platform || '通用网页'}`,
        ...(r.title ? [`【标题】${r.title}`] : []),
        '',
        `【提取方式】${methodLabel}`,
        '',
        r.transcript || r.content || '(未提取到内容)',
        '',
        `【来源】${urls[0]}`,
      ];
      return {
        success: true,
        output: lines.join('\n'),
        data: { title: r.title, transcript: r.transcript, content: r.content, method: r.method, platform: r.platform },
      };
    }

    // 批量结果
    const summary = results.map((r, i) => {
      const prefix = r.success ? '✅' : '❌';
      const snippet = (r.transcript || r.content || r.error || '').substring(0, 50);
      return `${i + 1}. ${prefix} [${r.platform || '?'}] ${snippet}`;
    });

    const fullOutput = results
      .map((r, i) => {
        if (!r.success) return `${i + 1}. ❌ [${r.platform || '?'}] 提取失败: ${r.error}\n   链接: ${urls[i]}`;
        const methodLabels: Record<string, string> = { video_asr: '🎙️语音识别', jina_text: '📄内容提取', jina_fast: '📝摘要' };
        return `---\n${i + 1}. [${r.platform || '?'}] ${r.title || ''}\n   ${methodLabels[r.method] || r.method}:\n${r.transcript || r.content}\n   链接: ${urls[i]}`;
      })
      .join('\n\n');

    const successCount = results.filter((r) => r.success).length;
    return {
      success: true,
      output: `共提取 ${results.length} 个链接（${successCount}/${results.length} 成功）：\n\n${summary.join('\n')}\n\n${fullOutput}`,
      data: {
        results: results.map((r, i) => ({ ...r, url: urls[i] })),
        total: results.length,
        successCount,
      },
    };
  },
};
