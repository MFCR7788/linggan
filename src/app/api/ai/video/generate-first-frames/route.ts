// 视频首帧批量生成 API (V2.0.4)
// POST /api/ai/video/generate-first-frames
// Body: { storyboard: StoryboardScene[]; ratio?: string; sceneIndices?: number[] }
// Response: { success, data: { sceneFrames: Record<number, {imageUrl, prompt, size}>, failed: number[], creditsUsed, creditsRefunded } }
//
// 计费: 3 credits/张 预扣，失败的逐张退

import { withAuth } from '@/lib/api-handler';
import { NextResponse } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { generateImage } from '@/lib/ai-services';
import { consume, refund, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

const CONCURRENCY = 3;
const BATCH_GAP_MS = 2000;

interface StoryboardScene {
  index: number;
  visualPrompt: string;
  timeStart?: number;
  timeEnd?: number;
  duration?: number;
  subtitle?: string;
  transition?: string;
}

export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { storyboard, ratio, sceneIndices } = body as {
    storyboard?: StoryboardScene[];
    ratio?: string;
    sceneIndices?: number[];
  };

  if (!storyboard || !Array.isArray(storyboard) || storyboard.length === 0) {
    return createApiError('storyboard 必填，需为非空数组', 400);
  }

  const effectiveRatio = ratio || '16:9';

  // 按 sceneIndices 过滤
  let targetScenes = storyboard;
  if (sceneIndices && Array.isArray(sceneIndices) && sceneIndices.length > 0) {
    targetScenes = storyboard.filter((s) => sceneIndices.includes(s.index));
  }

  if (targetScenes.length === 0) {
    return createApiError('没有匹配的分镜段', 400);
  }

  const targetCount = targetScenes.length;
  const creditCost = targetCount * CREDIT_COSTS.ai_image.perImage;

  // 预扣
  try {
    await consume(user.id, creditCost, 'ai_first_frame', `视频首帧 ${targetCount} 张`, {
      targetCount,
      ratio: effectiveRatio,
    });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          success: false,
          error: `余额不足：需要 ${creditCost} 灵力，当前 ${e.available} 灵力`,
          code: 'INSUFFICIENT_CREDITS',
          data: { required: creditCost, available: e.available },
        },
        { status: 402 }
      );
    }
    throw e;
  }

  // 单张生成（含 1 次重试）
  const generateWithRetry = async (
    prompt: string,
    sceneIndex: number
  ): Promise<{ imageUrl: string; prompt: string; size?: string }> => {
    try {
      const r = await generateImage(prompt, { ratio: effectiveRatio as '16:9' | '1:1' | '9:16', n: 1, skipOptimize: true });
      const result = Array.isArray(r) ? r[0] : r;
      if (result?.imageUrl) return result;
      throw new Error('generateImage 返回空 imageUrl');
    } catch (firstErr: any) {
      console.warn(`[first-frames] 段${sceneIndex + 1} 首次失败:`, firstErr.message?.substring(0, 80));
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const r = await generateImage(prompt, {
          ratio: effectiveRatio as '16:9' | '1:1' | '9:16',
          n: 1,
          skipOptimize: true,
          seed: Date.now() % 100000,
        });
        const result = Array.isArray(r) ? r[0] : r;
        if (result?.imageUrl) {
          console.log(`[first-frames] 段${sceneIndex + 1} 重试成功`);
          return result;
        }
        throw new Error('重试仍无 imageUrl');
      } catch (retryErr: any) {
        console.error(`[first-frames] 段${sceneIndex + 1} 重试也失败:`, retryErr.message?.substring(0, 80));
        throw retryErr;
      }
    }
  };

  // 分批并发
  const results: PromiseSettledResult<{ imageUrl: string; prompt: string; size?: string }>[] = [];
  for (let batchStart = 0; batchStart < targetScenes.length; batchStart += CONCURRENCY) {
    const batch = targetScenes.slice(batchStart, batchStart + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map((s) => generateWithRetry(s.visualPrompt, s.index))
    );
    results.push(...batchResults);
    if (batchStart + CONCURRENCY < targetScenes.length) {
      await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
    }
  }

  // 拼装结果 + 失败退点
  const sceneFrames: Record<number, { imageUrl: string; prompt: string; size?: string }> = {};
  const failed: number[] = [];
  let creditsRefunded = 0;

  for (let i = 0; i < targetScenes.length; i++) {
    const scene = targetScenes[i];
    const r = results[i];
    if (r.status === 'fulfilled' && r.value?.imageUrl) {
      sceneFrames[scene.index] = {
        imageUrl: r.value.imageUrl,
        prompt: r.value.prompt || scene.visualPrompt,
        size: r.value.size,
      };
    } else {
      failed.push(scene.index);
      await refund(
        user.id,
        CREDIT_COSTS.ai_image.perImage,
        'ai_first_frame',
        `首帧段${scene.index + 1} 失败退点`,
        { sceneIndex: scene.index }
      ).catch((e) => console.warn('[first-frames] 单张退款失败:', e));
      creditsRefunded += CREDIT_COSTS.ai_image.perImage;
    }
  }

  const creditsUsed = (targetCount - failed.length) * CREDIT_COSTS.ai_image.perImage;

  return createApiResponse({
    sceneFrames,
    failed,
    creditsUsed,
    creditsRefunded,
  });
});
