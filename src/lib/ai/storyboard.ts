// AI Services - Storyboard / Script to Scene Breakdown

import { callDeepSeek } from './chat';
import { STYLE_PRESETS, LANGUAGE_OPTIONS } from '../style-constants';
import type { StoryboardScene, InspireInput } from './types';

// ====== AI 分镜脚本生成 ======

/** 按目标时长计算分段 */
export function calcSegmentDurations(totalDuration: number): number[] {
  const numSegments = Math.ceil(totalDuration / 10);
  const baseDuration = Math.floor(totalDuration / numSegments);
  const remainder = totalDuration - baseDuration * numSegments;
  const durations: number[] = [];
  for (let i = 0; i < numSegments; i++) {
    durations.push(baseDuration + (i < remainder ? 1 : 0));
  }
  return durations;
}

/** 调用 DeepSeek 将脚本拆分为分镜 */
export async function generateStoryboard(
  scriptText: string,
  totalDuration: number
): Promise<StoryboardScene[]> {
  const durations = calcSegmentDurations(totalDuration);
  const numSegments = durations.length;

  const prompt = `你是一个专业视频分镜师。将以下脚本拆分为${numSegments}个分镜片段，用于AI视频生成。

原始脚本：
${scriptText}

目标分段数：${numSegments}
每段时长（秒）：${durations.join(', ')}

要求：
1. 每段画面描述用英文，详细描述画面内容、光线、色彩、风格、运镜
2. 字幕用中文，简短有力（每段1-2句）
3. 转场用英文（fade/cut/dissolve/wipe）

请严格以JSON数组格式输出，不要其他文字：
[
  {
    "visualPrompt": "Opening shot of... cinematic lighting, warm colors, slow push in...",
    "subtitle": "开场字幕文本",
    "transition": "fade"
  },
  ...
]`;

  try {
    const result = await callDeepSeek(prompt, { temperature: 0.7, maxTokens: 1500 });
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const scenes = JSON.parse(jsonMatch[0]) as Array<{
        visualPrompt: string;
        subtitle: string;
        transition: string;
      }>;

      // 补全时间和索引
      let accumulated = 0;
      return scenes.map((scene, i) => {
        const start = accumulated;
        accumulated += durations[i] || 10;
        return {
          index: i,
          timeStart: start,
          timeEnd: accumulated,
          duration: durations[i] || 10,
          visualPrompt: scene.visualPrompt || 'A beautiful cinematic scene',
          subtitle: scene.subtitle || '',
          transition: scene.transition || 'cut',
        };
      });
    }
  } catch (e) {
    console.error('Storyboard generation failed:', e);
  }

  // 降级：按时间段均匀切分
  let accumulated = 0;
  return durations.map((dur, i) => {
    const start = accumulated;
    accumulated += dur;
    return {
      index: i,
      timeStart: start,
      timeEnd: accumulated,
      duration: dur,
      visualPrompt: `Segment ${i + 1}: ${scriptText.substring(0, 100)}`,
      subtitle: `第${i + 1}段`,
      transition: 'cut',
    };
  });
}

/** 一步生成分镜：素材 + 风格 + 时长 + 主题 + 语言 + 首帧 → storyboard[]（含 visualPrompt + subtitle） */
export async function generateStoryboardV2(params: {
  inspirations: InspireInput[];
  stylePreset: string;
  duration: number;
  topic?: string;
  language?: string;
  firstFrameUrl?: string;
}): Promise<StoryboardScene[]> {
  const { inspirations, stylePreset, duration, topic, language = 'zh', firstFrameUrl } = params;
  const preset = STYLE_PRESETS[stylePreset] || STYLE_PRESETS.random;
  const durations = calcSegmentDurations(duration);
  const numSegments = durations.length;

  // 语言配置
  const langOpt = LANGUAGE_OPTIONS.find((l) => l.value === language) || LANGUAGE_OPTIONS[0];
  const subtitleLang = langOpt.label;

  // 构建素材上下文
  let materialContext = '';
  if (inspirations.length > 0) {
    const parts = inspirations.map((insp, i) => {
      const lines: string[] = [`素材${i + 1}（类型：${insp.type || 'text'}）：`];
      if (insp.title) lines.push(`标题：${insp.title}`);
      if (insp.original_text) lines.push(`原文：${insp.original_text}`);
      if (insp.ai_summary) lines.push(`摘要：${insp.ai_summary}`);
      return lines.join('\n');
    });
    materialContext = `\n参考素材：\n${parts.join('\n\n')}\n`;
  }

  const prompt = `你是一个专业短视频导演和分镜师。请根据以下要求生成${numSegments}个分镜片段。

视频风格：${preset.label} — ${preset.visualStyle}
总时长：${duration}秒
分段数：${numSegments}
每段时长（秒）：${durations.join(', ')}
${topic ? `主题方向：${topic}` : ''}${materialContext}${firstFrameUrl ? `\n首帧参考图：${firstFrameUrl}（视频的起始画面应该基于这张图，确保与首帧风格/构图/色彩一致）` : ''}
要求：
1. visualPrompt 用${subtitleLang}，详细描述画面内容、光线、色彩、风格、运镜（<150词），融入"${preset.visualStyle}"的风格特征
2. subtitle 用${subtitleLang}，简短有力（每段1-2句），${langOpt.promptInstruction}
3. transition 用英文（fade/cut/dissolve/wipe），根据画面节奏选择

请严格以JSON数组格式输出，不要其他文字：
[
  {
    "visualPrompt": "Opening shot... cinematic lighting, warm colors, slow push in...",
    "subtitle": "字幕文本（使用${subtitleLang}）",
    "transition": "fade"
  },
  ...
]`;

  try {
    const result = await callDeepSeek(prompt, { temperature: 0.8, maxTokens: 2000 });
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const scenes = JSON.parse(jsonMatch[0]) as Array<{
        visualPrompt: string;
        subtitle: string;
        transition: string;
      }>;

      let accumulated = 0;
      return scenes.map((scene, i) => {
        const start = accumulated;
        accumulated += durations[i] || 10;
        return {
          index: i,
          timeStart: start,
          timeEnd: accumulated,
          duration: durations[i] || 10,
          visualPrompt: scene.visualPrompt || 'A beautiful cinematic scene',
          subtitle: scene.subtitle || '',
          transition: scene.transition || 'cut',
        };
      });
    }
  } catch (e) {
    console.error('StoryboardV2 generation failed:', e);
  }

  // 降级：按时间段均匀切分
  let accumulated = 0;
  return durations.map((dur, i) => {
    const start = accumulated;
    accumulated += dur;
    const insp = inspirations[i];
    const fallbackTitle = insp?.title || insp?.original_text?.substring(0, 80) || `片段${i + 1}`;
    return {
      index: i,
      timeStart: start,
      timeEnd: accumulated,
      duration: dur,
      visualPrompt: `Segment ${i + 1}: cinematic scene inspired by ${fallbackTitle}, ${preset.visualStyle}`,
      subtitle: insp?.ai_summary?.substring(0, 100) || insp?.title || `第${i + 1}段`,
      transition: 'cut',
    };
  });
}
