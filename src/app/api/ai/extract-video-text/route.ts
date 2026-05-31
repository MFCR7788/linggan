// 视频语音提取 API — 发送抖音/快手等链接，返回逐字稿
import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { createApiResponse, createApiError } from "@/lib/api-utils";
import { extractVideoText } from "@/lib/video-transcriber";

export const dynamic = "force-dynamic";
export const maxDuration = 180; // 最长 180 秒

export const POST = withAuth(async ({ request }) => {
  const { url } = await request.json();

  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return createApiError("请提供视频链接", 400);
  }

  console.log(`[extract-video-text] 开始提取: ${url}`);

  const result = await extractVideoText(url.trim());

  if (!result.success) {
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
