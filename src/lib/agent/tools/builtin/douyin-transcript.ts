// 抖音文案提取工具
// 主路径：douyin-cli 下载视频 → ffmpeg 提取音频 → DashScope Paraformer ASR
// 快速路径：douyin-cli 仅提取描述文案（不下载视频）

import type { ToolDefinition } from '../../types';
import { getDashScopeApiKey } from '@/lib/runtime-config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

// ── douyin-cli Python 路径 ──

let _pythonPath: string | null = null;

async function getDouyinPython(): Promise<string> {
  if (_pythonPath) return _pythonPath;
  try {
    const { stdout } = await execAsync('which douyin');
    const douyinBin = stdout.trim();
    const { stdout: pyOut } = await execAsync(
      `find "$(dirname "${douyinBin}")/.." -path "*/bin/python*" -type f 2>/dev/null | head -1 || echo ""`
    );
    if (pyOut.trim()) {
      _pythonPath = pyOut.trim();
      return _pythonPath;
    }
  } catch { /* fall through */ }
  _pythonPath = 'python3';
  return _pythonPath;
}

// ── 调用 douyin-cli 下载视频 + 获取元数据 ──

interface DouyinAwemeData {
  desc?: string;
  videoPath?: string;
  error?: string;
}

async function fetchViaDouyinCLI(videoUrl: string, workDir: string): Promise<DouyinAwemeData> {
  const python = await getDouyinPython();
  const pyScript = `
import json, sys, os
from douyin_cli.douyin import Douyin
from douyin_cli.paths import get_download_root

result = {"desc": "", "videoPath": "", "error": ""}

def collect(items, _type):
    for item in items:
        result["desc"] = item.get("desc", "") or ""
        break

try:
    douyin = Douyin(
        target=${JSON.stringify(videoUrl)},
        limit=1,
        type="aweme",
        down_path=${JSON.stringify(workDir)},
        enable_download_title=False,
        enable_download_cover=False,
        on_new_items=collect,
    )
    douyin.run()

    # Find downloaded video file
    for f in os.listdir(${JSON.stringify(workDir)}):
        if f.endswith(".mp4") or f.endswith(".mov") or f.endswith(".webm"):
            result["videoPath"] = os.path.join(${JSON.stringify(workDir)}, f)
            break
except Exception as e:
    result["error"] = str(e)

json.dump(result, sys.stdout, ensure_ascii=False)
`;

  const scriptPath = join(workDir, 'fetch.py');
  await writeFile(scriptPath, pyScript);

  try {
    const { stdout, stderr } = await execAsync(`${python} "${scriptPath}"`, {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
    if (stderr && !stdout) throw new Error(stderr.substring(0, 500));
    return JSON.parse(stdout) as DouyinAwemeData;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ── 快速路径：仅获取描述（不下载视频） ──

async function fetchDescOnly(videoUrl: string): Promise<string> {
  const python = await getDouyinPython();
  const tmpDir = await mkdtemp(join(tmpdir(), 'dy-fast-'));
  const pyScript = `
import json, sys
from douyin_cli.douyin import Douyin

desc = [""]
def collect(items, _type):
    for item in items:
        desc[0] = item.get("desc", "") or ""
        break

try:
    douyin = Douyin(
        target=${JSON.stringify(videoUrl)},
        limit=1,
        type="aweme",
        down_path=${JSON.stringify(tmpDir)},
        on_new_items=collect,
    )
    douyin.run()
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(0)

print(json.dumps({"desc": desc[0]}))
`;
  const scriptPath = join(tmpDir, 'desc.py');
  await writeFile(scriptPath, pyScript);

  try {
    const { stdout } = await execAsync(`${python} "${scriptPath}"`, { timeout: 30000, maxBuffer: 1024 * 1024 });
    const data = JSON.parse(stdout);
    return data.desc || '';
  } catch {
    return '';
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── ASR 转写 ──

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
    await supabase.storage.from('lingji-media').remove([storageKey]).catch(() => {});
  }
}

// ── 单视频提取 ──

interface ExtractResult {
  success: boolean;
  title?: string;
  transcript?: string;
  method: 'direct' | 'asr';
  error?: string;
}

async function extractSingleVideo(url: string, fastOnly: boolean): Promise<ExtractResult> {
  let tmpDir: string | null = null;

  try {
    if (fastOnly) {
      const desc = await fetchDescOnly(url);
      return {
        success: !!desc,
        title: desc,
        transcript: desc,
        method: 'direct',
        error: desc ? undefined : '未提取到描述',
      };
    }

    // 主路径：douyin-cli 下载视频
    tmpDir = await mkdtemp(join(tmpdir(), 'dy-trans-'));
    const data = await fetchViaDouyinCLI(url, tmpDir);

    if (data.error) {
      // 降级：只提取描述
      if (data.desc) {
        return { success: true, title: data.desc, transcript: data.desc, method: 'direct' };
      }
      return { success: false, method: 'direct', error: data.error };
    }

    const title = data.desc || '';
    const videoPath = data.videoPath;

    if (!videoPath) {
      return {
        success: !!title,
        title,
        transcript: title || '',
        method: 'direct',
        error: title ? undefined : '视频下载失败，未找到文件',
      };
    }

    // ffmpeg 提取音频
    const audioPath = join(tmpDir, 'audio.mp3');
    await execAsync(
      `ffmpeg -i "${videoPath}" -vn -acodec mp3 -q:a 3 -y "${audioPath}" 2>&1`,
      { timeout: 60000 }
    );

    // ASR 识别
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
底层：douyin-cli 下载视频 + ffmpeg 音频提取 + DashScope Paraformer ASR 语音识别。`,
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
      const result = await extractSingleVideo(url, fastOnly);
      results.push(result);
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
      return {
        success: true,
        output: lines.join('\n'),
        data: { title: r.title, transcript: r.transcript, method: r.method },
      };
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
