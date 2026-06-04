// 视频语音提取 API — 发送抖音/快手等链接，返回逐字稿
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { createApiResponse, createApiError } from "@/lib/api-utils";
import { extractVideoText } from "@/lib/video-transcriber";
import { consume, refund, InsufficientCreditsError } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/credit-costs";

export const dynamic = "force-dynamic";
export const maxDuration = 180; // 最长 180 秒

export const POST = withAuth(async ({ request, user }) => {
  const { url } = await request.json();

  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return createApiError("请提供视频链接", 400);
  }

  const creditCost = CREDIT_COSTS.ai_extract.video;
  try {
    await consume(user.id, creditCost, 'ai_extract_video_text', 'AI 视频文案提取', { url: url.substring(0, 200) });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { success: false, error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
        { status: 402 }
      );
    }
    throw e;
  }

  console.log(`[extract-video-text] 开始提取: ${url}`);

  const result = await extractVideoText(url.trim());

  if (!result.success) {
    await refund(user.id, creditCost, 'ai_extract_video_text', '视频文案提取失败退点', { error: result.error }).catch(() => {});
    return createApiError(result.error || "视频文本提取失败", 500);
  }

  return createApiResponse(
    {
      url: url.trim(),
      transcript: result.transcript,
    },
    "文案提取成功"
  );
});
