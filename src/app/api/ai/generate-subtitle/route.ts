// AI 字幕生成 — 上传音频 → Paraformer ASR 转写 → 输出 SRT + 时间戳
// 支持两种输入: FormData 文件上传 / JSON body 传音频 URL
import { NextResponse } from "next/server";
import { createApiResponse, createApiError } from "@/lib/api-utils";
import { createAdminClient } from "@/lib/supabase-server";
import { generateSubtitlesFromAudio, generateSRT } from "@/lib/video-transcriber";
import { consume, refund, InsufficientCreditsError } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { withAuth } from "@/lib/api-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withAuth(async ({ request, user }) => {
  let audioUrl: string | null = null;
  let uploadedPath: string | null = null;

  const contentType = request.headers.get("content-type") || "";

  // ── 方式 1: 文件上传 ──
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return createApiError("上传内容过大或格式错误", 413);
    }

    const file = formData.get("file") as File;
    if (!file) return createApiError("请选择音频文件", 400);

    const allowedTypes = ["audio/wav", "audio/mp3", "audio/mpeg", "audio/m4a", "audio/webm", "audio/ogg", "audio/flac"];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(wav|mp3|m4a|webm|ogg|flac)$/i)) {
      return createApiError(`不支持的音频格式: ${file.type || file.name}`, 415);
    }

    if (file.size > 50 * 1024 * 1024) {
      return createApiError("音频文件不能超过 50MB", 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "wav";
    const storageName = `transcribe/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    uploadedPath = storageName;

    const supabase = createAdminClient();
    const { error: uploadErr } = await supabase.storage
      .from("lingji-media")
      .upload(storageName, buffer, {
        contentType: file.type || "audio/wav",
        upsert: false,
      });

    if (uploadErr) {
      console.error("[generate-subtitle] 上传失败:", uploadErr);
      return createApiError("音频上传失败，请重试", 500);
    }

    const { data: urlData } = supabase.storage.from("lingji-media").getPublicUrl(storageName);
    audioUrl = urlData.publicUrl;
  }

  // ── 方式 2: JSON body 传音频 URL ──
  if (!audioUrl) {
    try {
      const body = await request.json();
      audioUrl = body.audioUrl;
    } catch {
      return createApiError("请上传音频文件或提供音频 URL", 400);
    }
  }

  if (!audioUrl || typeof audioUrl !== "string") {
    return createApiError("缺少音频 URL", 400);
  }

  // ── 扣点 ──
  const creditCost = CREDIT_COSTS.ai_extract.video;
  try {
    await consume(user.id, creditCost, "ai_generate_subtitle", "AI 字幕生成");
  } catch (e) {
    if (uploadedPath) {
      createAdminClient().storage.from("lingji-media").remove([uploadedPath]).catch(() => {});
    }
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          success: false,
          error: `余额不足: 需要 ${creditCost} credits，当前 ${e.available} credits`,
          code: "INSUFFICIENT_CREDITS",
          data: { required: creditCost, available: e.available },
        },
        { status: 402 }
      );
    }
    throw e;
  }

  // ── 调 ASR ──
  const result = await generateSubtitlesFromAudio(audioUrl);

  // 清理临时上传的音频
  if (uploadedPath) {
    createAdminClient().storage.from("lingji-media").remove([uploadedPath]).catch(() => {});
  }

  if (!result.success) {
    await refund(user.id, creditCost, "ai_generate_subtitle", "字幕生成失败退点", { error: result.error }).catch(() => {});
    return createApiError(result.error || "字幕生成失败", 500);
  }

  return createApiResponse(
    {
      srt: result.srt,
      transcript: result.transcript,
      sentences: result.sentences,
      sentenceCount: result.sentences.length,
    },
    "字幕生成成功"
  );
});
