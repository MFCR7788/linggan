// AI 智能字幕 — 用 LLM 把分镜字幕改写为朗朗上口的短句（适合视频口播/字幕）
// POST { storyboard: [{index, visualPrompt, subtitle}] } → { storyboard: [{...newSubtitle}] }

import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { callDeepSeek } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

interface SceneInput {
  index: number;
  visualPrompt: string;
  subtitle?: string;
  duration?: number;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return createUnauthorizedResponse();

  try {
    const { storyboard } = await request.json();

    if (!Array.isArray(storyboard) || storyboard.length === 0) {
      return createApiError('请提供分镜数据', 400);
    }

    // 限制最多 30 段（避免 prompt 过长）
    const scenes: SceneInput[] = storyboard.slice(0, 30);

    // 构建 prompt
    const sceneList = scenes.map((s, i) => {
      const dur = s.duration || 5;
      return `段${i + 1}(${dur}s): [画面] ${s.visualPrompt?.substring(0, 80) || ''} [原字幕] ${s.subtitle || '(空)'}`;
    }).join('\n');

    const prompt = `你是一个短视频字幕优化师,擅长把分镜的视觉描述改写为朗朗上口、贴合画面、适合口播的字幕。

要求:
- 每段字幕 5-15 字,简短有力
- 口语化、有节奏感,避免书面语
- 紧扣画面内容,不要泛泛而谈
- 若原字幕已经是口播风格且长度合适,直接保留
- 输出严格 JSON 数组,不要任何解释

分镜列表:
${sceneList}

输出 JSON 格式:
[
  {"index": 1, "subtitle": "..."},
  {"index": 2, "subtitle": "..."}
]`;

    try {
      const text = await callDeepSeek(prompt, { temperature: 0.8, maxTokens: 1500 });
      // 提取 JSON
      const jsonMatch = text.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        return createApiError('LLM 返回格式异常,未找到 JSON 数组', 500);
      }
      const subtitles = JSON.parse(jsonMatch[0]) as Array<{ index: number; subtitle: string }>;
      // 合并回原 storyboard(保留原字段,只覆盖 subtitle)
      const newStoryboard = scenes.map((s, i) => {
        const found = subtitles.find((x) => x.index === i + 1);
        return {
          ...s,
          subtitle: (found?.subtitle || s.subtitle || `第${i + 1}段`).trim(),
        };
      });
      return createApiResponse({ storyboard: newStoryboard }, '字幕已优化');
    } catch (e: any) {
      // LLM 失败时返回原字幕(降级)
      console.warn('[auto-subtitle] LLM 调用失败,降级返回原字幕:', e?.message);
      return createApiResponse({ storyboard: scenes, fallback: true }, 'LLM 不可用,已返回原字幕');
    }
  } catch (e: any) {
    console.error('[auto-subtitle] error:', e);
    return createApiError(e?.message || '服务器错误', 500);
  }
}
