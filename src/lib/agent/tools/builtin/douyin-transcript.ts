// 抖音文案提取工具
// 主路径：douyin-cli 下载视频 → ffmpeg 提取音频 → FunASR 本地 ASR (降级 DashScope)
// 快速路径：douyin-cli 仅提取描述文案（不下载视频）

import type { ToolDefinition } from '../../types';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { getDouyinPythonPath, resetPythonPathCache } from '../douyin-python';

const execFileAsync = promisify(execFile);

// ── 调用 douyin-cli 下载视频 + 获取元数据 ──

interface DouyinAwemeData {
  desc?: string;
  videoPath?: string;
  error?: string;
}

async function fetchViaDouyinCLI(videoUrl: string, workDir: string): Promise<DouyinAwemeData> {
  const python = await getDouyinPythonPath();
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
    const { stdout, stderr } = await execFileAsync(python, [scriptPath], {
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
  const python = await getDouyinPythonPath();
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
    const { stdout } = await execFileAsync(python, [scriptPath], { timeout: 30000, maxBuffer: 1024 * 1024 });
    const data = JSON.parse(stdout);
    return data.desc || '';
  } catch {
    return '';
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── ASR 转写（FunASR 本地优先 → DashScope 降级）──

async function recognizeAudioFile(audioPath: string): Promise<string> {
  const { recognizeAudio } = await import('@/lib/ai/funasr-client');
  const result = await recognizeAudio(audioPath);
  if (!result.success) throw new Error(result.error || 'ASR 识别失败');
  return result.text;
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

    // ffmpeg 提取音频 → 16kHz 单声道 WAV (FunASR 标准格式)
    const audioPath = join(tmpDir, 'audio.wav');
    await execFileAsync('ffmpeg', [
      '-i', videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      audioPath,
    ], { timeout: 60000 });

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
底层：douyin-cli 下载视频 + ffmpeg 音频提取 + FunASR 本地语音识别（ECS Docker），不可用时自动降级 DashScope Paraformer。`,
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
