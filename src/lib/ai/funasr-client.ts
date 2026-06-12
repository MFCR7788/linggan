// FunASR 本地语音识别客户端 — 优先本地 Docker，降级 DashScope Paraformer
import { readFile } from "fs/promises";
import { getDashScopeApiKey } from "@/lib/runtime-config";

const FUNASR_URL = process.env.FUNASR_URL || "http://localhost:10096/asr";

let _funasrAvailable: boolean | null = null;

/** 检查 FunASR 是否可用 */
async function checkFunASRHealth(): Promise<boolean> {
  if (_funasrAvailable !== null) return _funasrAvailable;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(
      FUNASR_URL.replace("/asr", "/health"),
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    _funasrAvailable = res.ok;
  } catch {
    _funasrAvailable = false;
  }
  return _funasrAvailable;
}

/** 重置可用状态（用于健康检查周期性探测） */
export function resetFunASRStatus(): void {
  _funasrAvailable = null;
}

export interface FunASRResult {
  success: boolean;
  text: string;
  method: "funasr_local" | "dashscope_paraformer";
  error?: string;
}

/**
 * 识别音频文件 → 返回文本
 * 优先本地 FunASR Docker，不可用时降级 DashScope Paraformer API
 */
export async function recognizeAudio(audioPath: string): Promise<FunASRResult> {
  // 1. 尝试本地 FunASR
  const healthy = await checkFunASRHealth();
  if (healthy) {
    try {
      const audioBuffer = await readFile(audioPath);
      const base64 = audioBuffer.toString("base64");

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 120000);
      const res = await fetch(FUNASR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64,
          format: "wav",
          sample_rate: 16000,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.text) {
          return { success: true, text: data.text, method: "funasr_local" };
        }
      }
      console.warn("[FunASR] 本地返回异常，降级 DashScope:", res.status);
    } catch (e) {
      console.warn("[FunASR] 本地调用失败，降级 DashScope:", e instanceof Error ? e.message : String(e));
      _funasrAvailable = false;
    }
  }

  // 2. 降级 DashScope Paraformer
  return recognizeViaDashScope(audioPath);
}

/** DashScope Paraformer 降级 */
async function recognizeViaDashScope(audioPath: string): Promise<FunASRResult> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY 未配置，且本地 FunASR 不可用");

  const { createAdminClient } = await import("@/lib/supabase-server");
  const supabase = createAdminClient();

  const audioBuffer = await readFile(audioPath);
  const storageKey = `transcribe/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;

  const { error: uploadErr } = await supabase.storage
    .from("lingji-media")
    .upload(storageKey, audioBuffer, { contentType: "audio/wav", upsert: false });

  if (uploadErr) throw new Error(`音频上传失败: ${uploadErr.message}`);

  const { data: urlData } = supabase.storage.from("lingji-media").getPublicUrl(storageKey);
  const publicUrl = urlData.publicUrl;

  try {
    // 提交任务
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
          input: { file_urls: [publicUrl] },
          parameters: {
            format: "wav",
            sample_rate: 16000,
            disfluency_removal_enabled: false,
          },
        }),
      }
    );

    const submitData = await submitRes.json();
    if (!submitRes.ok) throw new Error(submitData.message || "ASR 任务提交失败");

    const taskId = submitData.output?.task_id;
    if (!taskId) throw new Error("未获取到 ASR 任务 ID");

    // 轮询结果
    for (let i = 0; i < 30; i++) {
      const pollRes = await fetch(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      const pollData = await pollRes.json();
      const status = pollData.output?.task_status;

      if (status === "SUCCEEDED") {
        const transcriptionUrl = pollData.output?.results?.[0]?.transcription_url;
        if (!transcriptionUrl) throw new Error("转录结果 URL 为空");
        const transcriptRes = await fetch(transcriptionUrl);
        const transcriptData = await transcriptRes.json();
        const parts: string[] = [];
        for (const ch of transcriptData.transcripts || []) {
          if (ch.text) parts.push(ch.text);
          for (const s of ch.sentences || []) {
            if (s.text?.trim()) parts.push(s.text);
          }
        }
        const text = parts.join("").trim() || parts.join("\n").trim();
        return { success: true, text, method: "dashscope_paraformer" };
      }
      if (status === "FAILED") throw new Error(pollData.output?.message || "ASR 转写失败");
      await new Promise((r) => setTimeout(r, 4000));
    }
    throw new Error("ASR 转写超时（2 分钟）");
  } finally {
    await supabase.storage.from("lingji-media").remove([storageKey]).catch(() => {});
  }
}
