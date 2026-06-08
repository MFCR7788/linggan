// 朋友圈 9 宫格 API (V2.0.1 + V2.0.3 扣点)
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
  const { product, sellingPoints, referenceImage, scene, extra } = body as {
    product?: string;
    sellingPoints?: string[];
    referenceImage?: string;
    scene?: string;
    extra?: string;
  };

  // 校验
  if (!product || typeof product !== 'string' || product.length > 100) {
    return createApiError('product 必填, 不超过 100 字', 400);
  }
  // 校验 sellingPoints（按场景区分）
  const validSellingPoints = (sellingPoints || []).filter((sp: string) => typeof sp === 'string' && sp.trim());
  if (scene === 'product') {
    if (validSellingPoints.length < 3 || validSellingPoints.length > 5) {
      return createApiError('产品宣传场景下 sellingPoints 需要 3-5 个有效项', 400);
    }
  } else if (scene === 'lifestyle') {
    if (validSellingPoints.length < 1 || validSellingPoints.length > 8) {
      return createApiError('生活记录场景下至少需要 1 个元素，最多 8 个', 400);
    }
  }
  // 其他场景 sellingPoints 可选

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
    const buildAnglesPrompt = (): string => {
      const sellingPointsStr = validSellingPoints.length > 0
        ? `\n元素/卖点: ${validSellingPoints.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`
        : '';
      const extraStr = extra ? `\n补充: ${extra}` : '';

      switch (scene) {
        case 'lifestyle':
          return `你是顶级生活方式博主和摄影师。为主题「${product}」设计朋友圈 9 宫格。
用 9 张图讲一个完整的故事，从开场到收尾。${sellingPointsStr}${extraStr}

视觉角度(9 个不同方向): 全景氛围、细节特写、人物互动、美食/物品、光影情绪、过程记录、环境背景、趣味花絮、收尾回顾。
每张图的 prompt 描述要具体——包含拍摄视角、光线、构图的建议。

返回严格 JSON（无 markdown 代码块标记）:
{
  "cells": [
    { "visualAngle": "全景氛围", "title": "20字内朋友圈配文(带emoji)", "prompt": "30-80字生图描述" }
  ]
}

JSON:`;

        case 'festival':
          return `你是顶级节日策划和摄影师。为「${product}」设计朋友圈 9 宫格。
营造完整的节日/纪念日氛围感。${extraStr}

视觉角度(9 个不同方向): 主题装饰、美食/物品特写、人物合照、礼物/鲜花、氛围灯光、仪式瞬间、细节情绪、环境全景、收尾祝福。
统一暖色调/节日色调，每张 prompt 包含色调、光线、构图建议。

返回严格 JSON（无 markdown 代码块标记）:
{
  "cells": [
    { "visualAngle": "主题装饰", "title": "20字内朋友圈配文(带emoji)", "prompt": "30-80字生图描述" }
  ]
}

JSON:`;

        case 'aesthetic':
          return `你是顶级艺术摄影师和视觉设计师。为主题「${product}」设计朋友圈 9 宫格。
追求统一的美学风格和情绪表达，不是产品展示，而是艺术化的视觉叙事。${extraStr}

视觉角度(9 个不同方向): 光影对比、色彩层次、构图留白、纹理细节、意境氛围、抽象表达、空间关系、时间流逝、收尾点睛。
每张 prompt 需详细描述色调、光影方向、构图手法、氛围关键词。

返回严格 JSON（无 markdown 代码块标记）:
{
  "cells": [
    { "visualAngle": "光影对比", "title": "20字内朋友圈配文(带emoji)", "prompt": "30-80字生图描述" }
  ]
}

JSON:`;

        case 'creative':
          return `你是顶级视觉设计师，擅长 9 宫格创意排版。为内容「${product}」设计朋友圈 9 宫格。
重点是画面在 3×3 网格中的视觉构成关系，而非单一图片的内容。${extraStr}

视觉角度(基于排版逻辑，9 个不同位置/角色):
- 若为中心主图型: 1 张核心主图 + 8 张配套细节
- 若为拼接长图型: 9 等分描述长图的每个区块
- 若为对称型: 1/9、2/8、3/7、4/6 成对呼应，5 居中
- 若为故事叙事型: 按时间线从左上到右下排列
请根据内容自动选择最合适的排版逻辑，9 张图需有明确的视觉构成关系。

返回严格 JSON（无 markdown 代码块标记）:
{
  "cells": [
    { "visualAngle": "排版角色名", "title": "20字内朋友圈配文(带emoji)", "prompt": "30-80字生图描述(含该格在九宫格中的位置和视觉角色)" }
  ]
}

JSON:`;

        case 'hobby':
          return `你是顶级兴趣博主和内容创作者。为「${product}」设计朋友圈 9 宫格。
展示作品/成果的同时，也呈现过程和细节，让观众有代入感。${extraStr}

视觉角度(9 个不同方向): 成品展示、制作/创作过程、细节放大、使用/穿戴场景、工具/材料、前后对比、成果合集、花絮/幕后、收尾展示。
每张 prompt 结合具体内容给出风格化描述。

返回严格 JSON（无 markdown 代码块标记）:
{
  "cells": [
    { "visualAngle": "成品展示", "title": "20字内朋友圈配文(带emoji)", "prompt": "30-80字生图描述" }
  ]
}

JSON:`;

        default: // 'product' or undefined
          return `你是顶级社交媒体视觉内容设计师。为「${product}」设计朋友圈 9 宫格素材。
${sellingPointsStr}${extraStr}

视觉角度(9 个不同方向): 痛点共鸣、场景代入、产品特写、对比展示、用户场景、节日/热点借势、品牌调性、生活方式、限时/稀缺感。
每张配一句 20 字内的朋友圈配文（带 emoji），以及一段 30-80 字的生图 prompt 描述。

返回严格 JSON（无 markdown 代码块标记）:
{
  "cells": [
    { "visualAngle": "痛点共鸣", "title": "标题含 emoji", "prompt": "生图描述" }
  ]
}

JSON:`;
      }
    };

    const anglesPrompt = buildAnglesPrompt();

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
        c.title = (c.title || '朋友圈配图').substring(0, MAX_TITLE_LENGTH);
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
          sellingPointIndex: validSellingPoints.length > 0 ? i % validSellingPoints.length : 0,
          visualAngle: c.visualAngle,
        };
      }
      return {
        imageUrl: '',
        title: c.title,
        prompt: c.prompt,
        sellingPointIndex: validSellingPoints.length > 0 ? i % validSellingPoints.length : 0,
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
        sellingPoints: validSellingPoints,
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
