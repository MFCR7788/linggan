// 语音转文字 — 百炼 Paraformer（本地 FunASR 优先，降级 DashScope 云 API）
// POST /api/ai/transcribe  body: FormData { audio: File (WAV 16kHz mono) }
// 浏览器端已通过 AudioContext 转为 WAV，此处直接调 recognizeAudio
import { NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let tempDir: string | null = null;
  let wavPath: string | null = null;

  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "缺少音频文件" },
        { status: 400 }
      );
    }

    // 写入临时 WAV 文件
    tempDir = join(tmpdir(), `lingji-asr-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    wavPath = join(tempDir, "audio.wav");
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    await writeFile(wavPath, buffer);

    // 调 recognizeAudio（优先本地 FunASR Docker，降级 DashScope Paraformer API）
    const { recognizeAudio } = await import("@/lib/ai/funasr-client");
    const result = await recognizeAudio(wavPath);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "语音识别失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        text: result.text,
        method: result.method,
      },
    });
  } catch (e) {
    console.error("[transcribe] 错误:", e);
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "语音识别服务异常",
      },
      { status: 500 }
    );
  } finally {
    if (wavPath) unlink(wavPath).catch(() => {});
    if (tempDir) {
      import("fs/promises")
        .then(({ rmdir }) => rmdir(tempDir!).catch(() => {}))
        .catch(() => {});
    }
  }
}
