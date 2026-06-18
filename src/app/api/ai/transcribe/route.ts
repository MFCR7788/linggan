// 语音转文字 — 优先本地 FunASR → 降级 DashScope 兼容模式（即时返回）
// POST /api/ai/transcribe  body: FormData { audio: File }
import { NextResponse } from "next/server";
import { getDashScopeApiKey } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FUNASR_URL = process.env.FUNASR_URL || "http://localhost:10096/asr";
const DASHSCOPE_ASR = "https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions";

async function tryFunASR(audioBuffer: Buffer): Promise<{ ok: boolean; text: string }> {
  try {
    const base64 = audioBuffer.toString("base64");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(FUNASR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: base64, format: "wav", sample_rate: 16000 }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, text: "" };
    const data = await res.json();
    if (data.success && data.text) return { ok: true, text: data.text };
    return { ok: false, text: "" };
  } catch {
    return { ok: false, text: "" };
  }
}

async function tryDashScope(audioBuffer: Buffer): Promise<{ ok: boolean; text: string }> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) return { ok: false, text: "" };

  try {
    const formData = new FormData();
    const file = new File([new Uint8Array(audioBuffer)], "audio.wav", { type: "audio/wav" });
    formData.append("file", file);
    formData.append("model", "paraformer-v2");

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch(DASHSCOPE_ASR, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[transcribe] DashScope 错误:", res.status, errText.slice(0, 200));
      return { ok: false, text: "" };
    }
    const data = await res.json();
    if (data.text) return { ok: true, text: data.text.trim() };
    return { ok: false, text: "" };
  } catch (e) {
    console.error("[transcribe] DashScope 异常:", e);
    return { ok: false, text: "" };
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    if (!audioFile) {
      return NextResponse.json({ success: false, error: "缺少音频文件" }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());

    // 1. 优先本地 FunASR
    const local = await tryFunASR(buffer);
    if (local.ok) {
      return NextResponse.json({ success: true, data: { text: local.text, method: "funasr_local" } });
    }

    // 2. 降级 DashScope 兼容模式
    const cloud = await tryDashScope(buffer);
    if (cloud.ok) {
      return NextResponse.json({ success: true, data: { text: cloud.text, method: "dashscope_paraformer" } });
    }

    return NextResponse.json({ success: false, error: "语音识别失败，请重试" }, { status: 500 });
  } catch (e) {
    console.error("[transcribe]", e);
    return NextResponse.json({ success: false, error: "服务异常" }, { status: 500 });
  }
}
