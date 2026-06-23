// 语音转文字 — DashScope paraformer-v2 RESTful API（base64 data URL）
// POST /api/ai/transcribe  body: FormData { audio: File }
import { NextResponse } from "next/server";
import { getDashScopeApiKey } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DASHSCOPE_TASK = "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription";

async function transcribeWithDashScope(audioBase64: string): Promise<string> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) return "";

  const dataUrl = `data:audio/wav;base64,${audioBase64}`;

  // 1. 提交任务
  const ctrl = new AbortController();
  const t1 = setTimeout(() => ctrl.abort(), 15000);
  const submitRes = await fetch(DASHSCOPE_TASK, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: "paraformer-v2",
      input: { file_urls: [dataUrl] },
      parameters: { channel_id: [0] },
    }),
    signal: ctrl.signal,
  });
  clearTimeout(t1);

  if (!submitRes.ok) return "";
  const submitData = await submitRes.json();
  const taskId = submitData?.output?.task_id;
  if (!taskId) return "";

  // 2. 轮询结果（最多等待 10 秒）
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 1500));

    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 10000);
    const pollRes = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctrl2.signal,
    });
    clearTimeout(t2);

    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const status = pollData?.output?.task_status;

    if (status === "SUCCEEDED") {
      const results = pollData?.output?.results;
      if (Array.isArray(results)) {
        const texts: string[] = [];
        for (const r of results) {
          const fileResults = r?.output?.results;
          if (Array.isArray(fileResults)) {
            for (const fr of fileResults) {
              if (fr?.text) texts.push(fr.text);
            }
          }
        }
        return texts.join("").trim();
      }
      return "";
    }

    if (status === "FAILED") return "";
  }

  return "";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    if (!audioFile) {
      return NextResponse.json({ success: false, error: "缺少音频文件" }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const base64 = buffer.toString("base64");

    const text = await transcribeWithDashScope(base64);
    if (text) {
      return NextResponse.json({ success: true, data: { text } });
    }

    return NextResponse.json({ success: false, error: "语音识别失败，请重试" }, { status: 500 });
  } catch (e) {
    console.error("[transcribe]", e);
    return NextResponse.json({ success: false, error: "服务异常" }, { status: 500 });
  }
}
