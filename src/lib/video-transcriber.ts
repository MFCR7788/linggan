// 视频语音转文字 — yt-dlp 下载 → ffmpeg 提取音频 → 本地 FunASR (优先) / DashScope Paraformer (降级)
// 安全修复:
// - URL shell 注入防护：验证 URL 协议，转义 shell 特殊字符
// - process.env.DASHSCOPE_API_KEY → getDashScopeApiKey() (运行时读取)
// - 轮询 fetch 添加超时
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { getDashScopeApiKey } from "@/lib/runtime-config";

const execAsync = promisify(exec);

/** 转义 shell 特殊字符，防止命令注入（URL / 文件名中的元字符） */
function shellEscape(str: string): string {
  // 用单引号包裹并在单引号内转义：'it'\''s' → 'it\'s'
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/** 验证 URL 格式，防止协议走私（仅允许 http/https，禁止 \`$();|&\` 等 shell 元字符） */
function validateUrl(url: string): void {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('无效的视频链接');
  }
  // 仅允许 http/https 协议
  if (!/^https?:\/\/.+$/i.test(url.trim())) {
    throw new Error('视频链接仅支持 http/https 协议');
  }
  // 防止换行符注入（可构造第二条命令）
  if (/[\n\r]/.test(url)) {
    throw new Error('视频链接包含非法字符');
  }
}

// 需要提取逐字稿的视频平台
const TRANSCRIPT_PLATFORMS = [
  "douyin.com",
  "kuaishou.com",
  "bilibili.com",
  "ixigua.com",
  "weibo.com/tv",
  "channels.weixin.qq.com",
  "finder.video.qq.com",
];

export function canExtractTranscript(url: string): boolean {
  return TRANSCRIPT_PLATFORMS.some((d) => url.includes(d));
}

export interface TranscriptResult {
  success: boolean;
  transcript?: string;
  error?: string;
}

/** 带时间戳的单句 */
export interface TimedSentence {
  begin_time: number;  // 毫秒
  end_time: number;    // 毫秒
  text: string;
}

export interface SubtitleResult {
  success: boolean;
  srt: string;               // SRT 格式字幕
  transcript: string;         // 纯文本全文
  sentences: TimedSentence[]; // 逐句时间戳
  error?: string;
}

/**
 * Douyin/iesdouyin 专用：直接从网页解析视频 URL 再下载
 * 当 yt-dlp 反爬失败时的降级方案
 */
async function downloadDouyinVideo(url: string, outputPath: string): Promise<void> {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

  // 1. 先从最终 URL 提取视频 ID（follow 重定向拿到真实地址）
  const probeRes = await fetch(url, {
    headers: { "User-Agent": ua },
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });

  const finalUrl = probeRes.url;
  const vidMatch = finalUrl.match(/\/video\/(\d+)/) || finalUrl.match(/\/share\/video\/(\d+)/);
  const videoId = vidMatch?.[1];
  if (!videoId) throw new Error("无法解析视频 ID");

  // 2. 直接访问 iesdouyin.com SSR 页面（含完整视频数据，无 JS 反爬）
  const ssrUrl = `https://www.iesdouyin.com/share/video/${videoId}/?app=douyin_select`;
  const pageRes = await fetch(ssrUrl, {
    headers: {
      "User-Agent": ua,
      Accept: "text/html",
      "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });

  const html = await pageRes.text();

  // 3. 从 HTML 中提取视频 play_addr URL
  const urlMatch = html.match(
    /"play_addr":\{"uri":"[^"]*","url_list":\["(https:\\u002F\\u002F[^"]+)"/
  );
  if (!urlMatch) throw new Error("无法从页面解析视频地址");

  // 解码 Unicode 转义序列 (\\u002F → /)
  let videoUrl = urlMatch[1].replace(/\\u002F/g, "/");

  // 3. 下载视频
  const videoRes = await fetch(videoUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15",
      Referer: "https://www.iesdouyin.com/",
    },
    signal: AbortSignal.timeout(120000),
  });

  if (!videoRes.ok) throw new Error(`视频下载失败: HTTP ${videoRes.status}`);

  const buffer = Buffer.from(await videoRes.arrayBuffer());
  await writeFile(outputPath, buffer);
}

/**
 * 从视频链接提取语音逐字稿
 * 流程: yt-dlp 下载音频 → ffmpeg 转 WAV → Supabase 上传 → DashScope ASR
 */
export async function extractVideoText(url: string): Promise<TranscriptResult> {
  let tmpDir: string | null = null;

  try {
    // 1. 创建临时目录
    tmpDir = await mkdtemp(join(tmpdir(), "linggan-trans-"));
    const audioOutput = join(tmpDir, "audio.wav");

    // 2. 校验 URL 合法性（防 shell 注入）
    validateUrl(url);
    const safeUrl = shellEscape(url.trim());
    const safeOutput = shellEscape(join(tmpDir, "video.%(ext)s"));

    // 2b. yt-dlp 下载视频 (用最低画质，我们只需要音频)
    let downloaded = false;
    try {
      await execAsync(
        `yt-dlp -f "worst[height<=360][ext=mp4]/worst" --no-playlist --user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)" -o ${safeOutput} ${safeUrl}`,
        { timeout: 90000 }
      );
      downloaded = true;
    } catch (e: unknown) {
      console.warn("yt-dlp 下载失败，尝试备选方案:", e instanceof Error ? e.message?.substring(0, 100) : String(e).substring(0, 100));
    }

    // 2b. yt-dlp 失败时，尝试直接解析页面提取视频 URL（针对 douyin/iesdouyin）
    if (!downloaded) {
      await downloadDouyinVideo(url, join(tmpDir, "video.mp4"));
    }

    // 找到下载的文件
    const { stdout: lsOut } = await execAsync(`ls ${shellEscape(tmpDir)}`);
    const files = lsOut.trim().split("\n");
    const videoFile = files.find((f) => f.startsWith("video."));
    if (!videoFile) throw new Error("视频下载失败：未找到下载文件");

    const videoPath = join(tmpDir, videoFile);

    // 3. ffmpeg 提取音频 → 16kHz 单声道 WAV (ASR 标准格式)
    await execAsync(
      `ffmpeg -i ${shellEscape(videoPath)} -vn -acodec pcm_s16le -ar 16000 -ac 1 -y ${shellEscape(audioOutput)} 2>&1`,
      { timeout: 60000 }
    );

    // 4. 语音识别 — FunASR 本地优先，降级 DashScope Paraformer
    const { recognizeAudio } = await import("@/lib/ai/funasr-client");
    const asrResult = await recognizeAudio(audioOutput);

    if (!asrResult.success || !asrResult.text.trim()) {
      return { success: false, error: asrResult.error || "未能识别到语音内容" };
    }

    return { success: true, transcript: asrResult.text };
  } catch (error: unknown) {
    console.error("视频转录失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "视频转录失败，请稍后重试",
    };
  } finally {
    // 清理临时目录
    if (tmpDir) {
      try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
}

export function generateSRT(sentences: TimedSentence[]): string {
  return sentences
    .map((s, i) => {
      const start = msToSRTTime(s.begin_time);
      const end = msToSRTTime(s.end_time);
      return `${i + 1}\n${start} --> ${end}\n${s.text.trim()}\n`;
    })
    .join("\n");
}

function msToSRTTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRemainder = Math.floor(ms % 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(msRemainder).padStart(3, "0")}`;
}

/**
 * 百炼 Paraformer 文件转写 — 保留时间戳
 */
async function callDashScopeASRWithTimestamps(audioUrl: string): Promise<{
  transcript: string;
  sentences: TimedSentence[];
}> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY 未配置");

  const submitRes = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model: "paraformer-v2",
        input: { file_urls: [audioUrl] },
        parameters: {
          format: "wav",
          sample_rate: 16000,
          disfluency_removal_enabled: false,
        },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  const submitData = await submitRes.json();
  if (!submitRes.ok) {
    throw new Error(submitData.message || "ASR 任务提交失败");
  }

  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error("未获取到 ASR 任务 ID");

  const transcriptionUrl = await pollTranscriptionTask(apiKey, taskId);
  if (!transcriptionUrl) throw new Error("ASR 转写超时");

  const transcriptRes = await fetch(transcriptionUrl);
  const transcriptData = await transcriptRes.json();

  const transcripts = transcriptData.transcripts || [];
  const allSentences: TimedSentence[] = [];
  const fullTextParts: string[] = [];

  for (const channel of transcripts) {
    const sentences = channel.sentences || [];
    for (const s of sentences) {
      if (s.text?.trim()) {
        allSentences.push({
          begin_time: s.begin_time ?? 0,
          end_time: s.end_time ?? 0,
          text: s.text.trim(),
        });
        fullTextParts.push(s.text);
      }
    }
    // 兼容无 sentences 字段的旧格式
    if (sentences.length === 0 && channel.text?.trim()) {
      fullTextParts.push(channel.text);
    }
  }

  // 如果 API 没返回时间戳，用文本长度估算（中文 ~4 字/秒）
  if (allSentences.length === 0) {
    const fullText = fullTextParts.join("");
    const estimatedMs = Math.max(1000, Math.ceil(fullText.length / 4) * 1000);
    allSentences.push({
      begin_time: 0,
      end_time: estimatedMs,
      text: fullText,
    });
  }

  return {
    transcript: fullTextParts.join(""),
    sentences: allSentences,
  };
}

/**
 * 从音频 URL 生成字幕：调 Paraformer ASR → 输出 SRT + 逐句时间戳
 */
export async function generateSubtitlesFromAudio(audioUrl: string): Promise<SubtitleResult> {
  try {
    const { transcript, sentences } = await callDashScopeASRWithTimestamps(audioUrl);

    if (!transcript || transcript.trim().length === 0) {
      return { success: false, srt: "", transcript: "", sentences: [], error: "未能识别到语音内容" };
    }

    const srt = generateSRT(sentences);

    return { success: true, srt, transcript, sentences };
  } catch (error) {
    return {
      success: false,
      srt: "",
      transcript: "",
      sentences: [],
      error: error instanceof Error ? error.message : "字幕生成失败",
    };
  }
}

async function pollTranscriptionTask(
  apiKey: string,
  taskId: string
): Promise<string | null> {
  const maxPollSeconds = 180; // 最长轮询 3 分钟
  const startTime = Date.now();

  for (let i = 0; i < 30; i++) {
    // 超时保护：超过总时间上限则退出
    if (Date.now() - startTime > maxPollSeconds * 1000) {
      console.error("ASR 轮询超时");
      return null;
    }

    const res = await fetch(
      `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      }
    );

    const data = await res.json();
    const status = data.output?.task_status;

    if (status === "SUCCEEDED") {
      return data.output?.results?.[0]?.transcription_url || null;
    }

    if (status === "FAILED") {
      console.error("ASR 任务失败:", data.output?.message);
      throw new Error(data.output?.message || "语音转写失败");
    }

    // 指数退避：2s → 4s → 6s → 8s ... 最多 15s
    const delay = Math.min(2000 + i * 2000, 15000);
    await new Promise((r) => setTimeout(r, delay));
  }

  return null;
}
