// 朋友圈广告 9 宫格 API (V2.0.1 + V2.0.3 扣点)
// POST /api/ai/ads/grid
// Body: { product: string, sellingPoints: string[], referenceImage?: string }
// Response: { success, data: { cells: [{ imageUrl, title, prompt, sellingPointIndex }] } }
//
// 计费: 9 张按 2 credits/张 = 18 credits 预扣,成功的留下,失败的按张退

import { withAuth } from '@/lib/api-handler';
import { NextResponse } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { generateImage, callDeepSeek, logAiUsage } from '@/lib/ai-services';
import { consume, refund, InsufficientCreditsError } from '@/lib/credits';
import { calcAdsCost, CREDIT_COSTS } from '@/lib/credit-costs';
import { saveWorkHistory } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const GRID_SIZE = 9;
const MAX_SELLING_POINTS = 5;
const MIN_SELLING_POINTS = 3;
const MAX_TITLE_LENGTH = 20;

interface CellResult {
  imageUrl: string;
  title: string;
  prompt: string;
  sellingPointIndex: number;
  visualAngle: string;
}

export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { product, sellingPoints, referenceImage } = body as {
    product?: string;
    sellingPoints?: string[];
    referenceImage?: string;
  };

  // 校验
  if (!product || typeof product !== 'string' || product.length > 100) {
    return createApiError('product 必填, 不超过 100 字', 400);
  }
  if (!Array.isArray(sellingPoints) || sellingPoints.length < MIN_SELLING_POINTS || sellingPoints.length > MAX_SELLING_POINTS) {
    return createApiError(`sellingPoints 必须是 ${MIN_SELLING_POINTS}-${MAX_SELLING_POINTS} 个`, 400);
  }
  for (const sp of sellingPoints) {
    if (typeof sp !== 'string' || !sp.trim()) {
      return createApiError('sellingPoints 每项不能为空', 400);
    }
  }

  // ─── 预扣 9 张的 credits ─────────────────────────
  const creditCost = calcAdsCost(GRID_SIZE);
  try {
    await consume(user.id, creditCost, 'ai_ads', `朋友圈 9 宫格 ${GRID_SIZE} 张`, {
      product: product.substring(0, 50), gridSize: GRID_SIZE,
    });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          success: false,
          error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`,
          code: 'INSUFFICIENT_CREDITS',
          data: { required: creditCost, available: e.available },
        },
        { status: 402 }
      );
    }
    throw e;
  }

  try {
    // 1) DeepSeek 生成 9 个视觉角度 + 9 句标题
    const anglesPrompt = `你是顶级电商广告创意总监。为产品「${product}」设计朋友圈广告 9 宫格素材。
卖点列表: ${sellingPoints.map((s, i) => `${i + 1}. ${s}`).join('\n')}

要求:
1. 生成 9 个不同的视觉角度（如: 痛点共鸣、场景代入、产品特写、对比、用户证言、节日情感、品牌调性、生活方式、限时紧迫）
2. 每个角度配一句 20 字内的朋友圈广告标题（带 emoji）
3. 每个角度配一段 30-80 字的"生图 prompt 描述"（中文,直接给 AI 生图模型用）
4. 9 个角度尽量分散,避免重复

返回严格 JSON（无 markdown 代码块标记）:
{
  "cells": [
    { "visualAngle": "痛点共鸣", "title": "标题含 emoji", "prompt": "生图描述" }
  ]
}

JSON:`;

    const llmResult = await callDeepSeek(anglesPrompt, { temperature: 0.9 });
    if (!llmResult) {
      // 角度生成失败,全部退
      await refund(user.id, creditCost, 'ai_ads', '9 宫格角度生成失败全退', { product: product.substring(0, 50) });
      return createApiError('生成角度失败', 500);
    }

    // 解析 LLM 返回的 JSON
    const jsonMatch = llmResult.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[ads/grid] LLM 返回无法解析:', llmResult.substring(0, 200));
      await refund(user.id, creditCost, 'ai_ads', '9 宫格角度 JSON 解析失败全退', { product: product.substring(0, 50) });
      return createApiError('AI 返回格式错误', 500);
    }
    let parsed: { cells?: Array<{ visualAngle: string; title: string; prompt: string }> };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      await refund(user.id, creditCost, 'ai_ads', '9 宫格角度 JSON 解析失败全退', { product: product.substring(0, 50) });
      return createApiError('AI 返回 JSON 解析失败', 500);
    }
    const cells = parsed.cells || [];
    if (cells.length !== GRID_SIZE) {
      await refund(user.id, creditCost, 'ai_ads', `9 宫格角度数 ${cells.length} ≠ 9 全退`, { product: product.substring(0, 50), got: cells.length });
      return createApiError(`AI 返回 ${cells.length} 个角度, 需要 ${GRID_SIZE} 个`, 500);
    }

    // 2) 校验每条 title 长度
    for (const c of cells) {
      if (!c.title || c.title.length > MAX_TITLE_LENGTH) {
        c.title = (c.title || '朋友圈广告').substring(0, MAX_TITLE_LENGTH);
      }
      if (!c.prompt) c.prompt = `${product}, ${c.visualAngle || ''}`;
    }

    // 3) 并发调 generateImage 9 次
    const imageResults = await Promise.allSettled(
      cells.map((c) =>
        generateImage(c.prompt, {
          ratio: '1:1',
          n: 1,
        }).then((r: any) => (Array.isArray(r) ? r[0] : r))
      )
    );

    // 4) 失败格子按张退
    let successCount = 0;
    for (let i = 0; i < imageResults.length; i++) {
      const r = imageResults[i];
      if (r.status === 'fulfilled' && (r as any).value?.imageUrl) {
        successCount++;
      } else {
        // 单张失败,退 2 credits
        await refund(user.id, CREDIT_COSTS.ai_ads.perGrid, 'ai_ads', `9 宫格第 ${i + 1} 张失败退点`, {
          product: product.substring(0, 50), cellIndex: i, reason: r.status === 'rejected' ? String((r as any).reason?.message) : 'no imageUrl',
        }).catch((e) => console.warn('[ads/grid] 单张退款失败:', e));
      }
    }

    // 5) 拼装返回
    const finalCells: CellResult[] = cells.map((c, i) => {
      const r = imageResults[i];
      if (r.status === 'fulfilled' && (r as any).value?.imageUrl) {
        return {
          imageUrl: (r as any).value.imageUrl,
          title: c.title,
          prompt: c.prompt,
          sellingPointIndex: i % sellingPoints.length,
          visualAngle: c.visualAngle,
        };
      }
      return {
        imageUrl: '',
        title: c.title,
        prompt: c.prompt,
        sellingPointIndex: i % sellingPoints.length,
        visualAngle: c.visualAngle,
      };
    });

    const failedCount = GRID_SIZE - successCount;
    const creditsUsed = successCount * CREDIT_COSTS.ai_ads.perGrid;

    // 6) 记录 AI 用量（按 9 张计,实际成功几张就几张）
    try {
      await logAiUsage(user.id, 'image', 100 * successCount);
    } catch (e: any) {
      console.warn('[ads/grid] logAiUsage 失败:', e.message);
    }

    // 保存到历史生成
    await saveWorkHistory(user.id, product, {
      generatedAds: {
        product,
        cells: finalCells.map(c => ({ imageUrl: c.imageUrl, title: c.title, visualAngle: c.visualAngle })),
        successCount,
        failedCount,
        creditsUsed,
      },
    });

    return createApiResponse(
      {
        product,
        sellingPoints,
        cells: finalCells,
        successCount,
        failedCount,
        creditsUsed,
      },
      `已生成 ${successCount}/${GRID_SIZE} 张封面${failedCount > 0 ? `,${failedCount} 张失败已退点` : ''}`
    );
  } catch (e: any) {
    console.error('[ads/grid] 失败:', e);
    // 兜底:整个流程崩了,全退
    await refund(user.id, creditCost, 'ai_ads', '9 宫格异常全退', { product: product.substring(0, 50), error: String(e?.message) });
    return createApiError(e.message || '生成失败', 500);
  }
});
