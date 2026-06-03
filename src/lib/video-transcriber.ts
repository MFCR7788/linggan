// 视频语音转文字 — yt-dlp 下载 → ffmpeg 提取音频 → DashScope Paraformer ASR
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createAdminClient } from "@/lib/supabase-server";

const execAsync = promisify(exec);

// 需要提取逐字稿的视频平台
const TRANSCRIPT_PLATFORMS = [
  "douyin.com",
  "kuaishou.com",
  "bilibili.com",
  "ixigua.com",
  "weibo.com/tv",
];

export function canExtractTranscript(url: string): boolean {
  return TRANSCRIPT_PLATFORMS.some((d) => url.includes(d));
}

export interface TranscriptResult {
  success: boolean;
  transcript?: string;
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

    // 2. yt-dlp 下载视频 (用最低画质，我们只需要音频)
    let downloaded = false;
    try {
      await execAsync(
        `yt-dlp -f "worst[height<=360][ext=mp4]/worst" --no-playlist --user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)" -o "${join(tmpDir, "video.%(ext)s")}" "${url}"`,
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
    const { stdout: lsOut } = await execAsync(`ls "${tmpDir}"`);
    const files = lsOut.trim().split("\n");
    const videoFile = files.find((f) => f.startsWith("video."));
    if (!videoFile) throw new Error("视频下载失败：未找到下载文件");

    const videoPath = join(tmpDir, videoFile);

    // 3. ffmpeg 提取音频 → 16kHz 单声道 WAV (ASR 标准格式)
    await execAsync(
      `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 -y "${audioOutput}" 2>&1`,
      { timeout: 60000 }
    );

    // 4. 上传音频到 Supabase Storage
    const audioBuffer = await readFile(audioOutput);
    const supabase = createAdminClient();
    const storageName = `transcribe/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;

    const { error: uploadErr } = await supabase.storage
      .from("lingji-media")
      .upload(storageName, audioBuffer, {
        contentType: "audio/wav",
        upsert: false,
      });

    if (uploadErr) {
      console.error("音频上传失败:", uploadErr);
      throw new Error("音频上传失败");
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("lingji-media").getPublicUrl(storageName);

    // 5. 调用 DashScope Paraformer 语音识别
    const transcript = await callDashScopeASR(publicUrl);

    // 6. 清理 Supabase 上的临时音频文件
    await supabase.storage.from("lingji-media").remove([storageName]);

    if (!transcript || transcript.trim().length === 0) {
      return { success: false, error: "未能识别到语音内容" };
    }

    return { success: true, transcript };
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

/**
 * DashScope Paraformer 文件转写 API
 */
async function callDashScopeASR(audioUrl: string): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY 未配置");

  // 提交转写任务
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
    }
  );

  const submitData = await submitRes.json();
  if (!submitRes.ok) {
    console.error("ASR 提交失败:", JSON.stringify(submitData));
    throw new Error(submitData.message || "ASR 任务提交失败");
  }

  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error("未获取到 ASR 任务 ID");

  // 轮询转写结果 (最长等待 120 秒)
  const transcriptionUrl = await pollTranscriptionTask(apiKey, taskId);
  if (!transcriptionUrl) throw new Error("ASR 转写超时");

  // 获取逐字稿内容
  const transcriptRes = await fetch(transcriptionUrl);
  const transcriptData = await transcriptRes.json();

  // 拼接所有句子的文本
  const transcripts = transcriptData.transcripts || [];
  const fullText = transcripts
    .map((item: { text?: string }) => item.text || "")
    .join("")
    .trim();

  return fullText;
}

async function pollTranscriptionTask(
  apiKey: string,
  taskId: string
): Promise<string | null> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(
      `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
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

    // 等待 4 秒后重试
    await new Promise((r) => setTimeout(r, 4000));
  }

  return null;
}
