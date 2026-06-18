// 语音转文字 — 百炼 Paraformer（本地 FunASR 优先，降级 DashScope 云 API）
// POST /api/ai/transcribe  body: FormData { audio: File }
import { NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let tempDir: string | null = null;
  let audioPath: string | null = null;
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

    // 写入临时文件
    tempDir = join(tmpdir(), `lingji-asr-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });

    const ext = audioFile.name.split(".").pop() || "webm";
    audioPath = join(tempDir, `input.${ext}`);
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    await writeFile(audioPath, buffer);

    // 尝试转为 WAV（ffmpeg 可用时）
    wavPath = join(tempDir, "audio.wav");
    try {
      execSync(
        `ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 -sample_fmt s16 "${wavPath}"`,
        { timeout: 15000, stdio: "pipe" }
      );
    } catch {
      // ffmpeg 不可用或转换失败，尝试用原始文件
      console.warn("[transcribe] ffmpeg 转换失败，使用原始格式");
      wavPath = audioPath;
    }

    // 调 recognizeAudio（优先本地 FunASR，降级 DashScope）
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
    // 清理临时文件
    if (audioPath) unlink(audioPath).catch(() => {});
    if (wavPath && wavPath !== audioPath) unlink(wavPath).catch(() => {});
    if (tempDir) {
      // rmdir 仅在空目录时成功
      import("fs/promises")
        .then(({ rmdir }) => rmdir(tempDir!).catch(() => {}))
        .catch(() => {});
    }
  }
}
