// AI Services - DeepSeek, Doubao/ARK, Seedance

import { STYLE_PRESETS, LANGUAGE_OPTIONS } from './style-constants';

// ====== Types ======

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } };

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

interface VisionResult {
  description: string;
  text: string;
  tags: string[];
}

interface SummaryResult {
  title: string;
  summary: string;
  keyPoints: string[];
  tags: string[];
  creationSuggestions: string[];
  reuseScore: number;
}

interface ImageResult {
  imageUrl: string;
  prompt: string;
  size: string;
}

export type VideoTaskResult = { taskId: string | null; status: string; message: string; videoUrl?: string };

export async function callDeepSeek(
  prompt: string,
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是一个专业的内容创作助手，帮助用户总结、分析和创作内容。' },
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('DeepSeek API error:', error);
    throw new Error('DeepSeek API call failed');
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ====== 通义千问 / DashScope API ======

export async function callQwen(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured');
  }

  // 验证并规范化模型名称
  const validQwenModels = ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-vl-plus', 'qwen-vl-max', 'qwen3.7-max'];
  let modelName = options.model || 'qwen-plus';
  
  // 如果模型名称不在有效列表中，使用默认值
  if (!validQwenModels.includes(modelName)) {
    console.warn(`Invalid model name "${modelName}", falling back to "qwen-plus"`);
    modelName = 'qwen-plus';
  }

  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('DashScope API error:', error);
    throw new Error('DashScope API call failed');
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ====== Doubao/ARK API ======

export async function callDoubaoChat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = process.env.DOUBAO_API_KEY;
  const baseUrl = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  if (!apiKey) {
    throw new Error('DOUBAO_API_KEY is not configured');
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || process.env.DOUBAO_ENDPOINT_ID || 'doubao-seed-2.0-mini',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Doubao API error:', error);
    throw new Error('Doubao API call failed');
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ====== Doubao Vision API ======

export async function callDoubaoVision(
  imageUrl: string,
  prompt: string = '描述这张图片的内容'
): Promise<VisionResult> {
  try {
    const content = await callDoubaoChat(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      { temperature: 0.3 }
    );

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as VisionResult;
      } catch {
        // fall through to fallback
      }
    }

    return {
      description: content,
      text: '',
      tags: extractTags(content),
    };
  } catch (error) {
    console.error('Doubao vision analysis failed:', error);
    return {
      description: '图片描述（AI分析暂不可用）',
      text: '',
      tags: ['图片', '待分析'],
    };
  }
}

// ====== Prompt 优化（生图/生视频前调用） ======

async function optimizePrompt(rawPrompt: string, type: 'image' | 'video'): Promise<string> {
  if (!rawPrompt || rawPrompt.length < 5) return rawPrompt;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return rawPrompt;

  const systemPrompt = type === 'image'
    ? `You are an expert AI image prompt engineer. Enhance the given prompt by adding vivid visual details: subject, scene, lighting, colors, style, composition, mood, and atmosphere. Keep it under 200 words. Output ONLY the enhanced prompt in English, no explanations or markdown.`
    : `You are an expert AI video prompt engineer. Enhance the given prompt by adding details about scene, motion, camera movement, atmosphere, lighting transitions, and temporal progression. Keep it under 200 words. Output ONLY the enhanced prompt in English, no explanations or markdown.`;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Enhance this prompt for AI ${type} generation:\n\n${rawPrompt}` },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      console.warn('Prompt optimization API error:', response.status);
      return rawPrompt;
    }

    const data = await response.json();
    const enhanced = data.choices?.[0]?.message?.content?.trim();
    if (!enhanced) return rawPrompt;

    return enhanced.replace(/^["']|["']$/g, '').trim();
  } catch (e) {
    console.warn('Prompt optimization failed, using original:', e);
    return rawPrompt;
  }
}

// ====== Seedance Image Generation ======

function getSizeForRatio(ratio: string): string {
  const minPixels = 1920 * 1920;
  switch (ratio) {
    case '1:1':
      return '1920x1920';
    case '16:9':
      return '2560x1440';
    case '9:16':
      return '1440x2560';
    case '4:3':
      return '2216x1662';
    case '3:4':
      return '1662x2216';
    default:
      return '1920x1920';
  }
}

export async function generateImage(
  prompt: string,
  options: { ratio?: string; n?: number } = {}
): Promise<ImageResult | ImageResult[]> {
  // 先优化提示词
  const finalPrompt = await optimizePrompt(prompt, 'image');
  console.log(`[Image] 优化前: "${prompt.substring(0, 60)}..." → 优化后: "${finalPrompt.substring(0, 60)}..."`);

  const apiKey = process.env.DOUBAO_API_KEY;
  const baseUrl = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const imageModelArkId = process.env.SEEDANCE_IMAGE_MODEL_ARK_ID;

  if (!apiKey) throw new Error('DOUBAO_API_KEY is not configured');
  if (!imageModelArkId) throw new Error('SEEDANCE_IMAGE_MODEL_ARK_ID is not configured');

  const size = getSizeForRatio(options.ratio || '1:1');
  const n = options.n || 1;

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: imageModelArkId,
      prompt: finalPrompt,
      n,
      size,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Seedance image API error:', response.status, errorText);
    throw new Error(`图片生成失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const results = (data.data || []).map((item: any) => ({
    imageUrl: item.url,
    prompt: finalPrompt,
    size,
  }));

  return n === 1 ? results[0] : results;
}

// ====== 视频模型注册表（从客户端安全模块导入） ======

import { QUALITY_TIERS, type VideoProvider, type VideoModelConfig, type QualityTier } from './video-models';
export { type VideoProvider, type VideoModelConfig, type QualityTier, QUALITY_TIERS };

// ====== HappyHorse 视频生成（百炼 DashScope） ======

const HAPPYHORSE_API_KEY = process.env.HAPPYHORSE_API_KEY || 'sk-c270f05ccab6430aa50ed96ac3d7790b';
const DASHSCOPE_VIDEO_BASE = 'https://dashscope.aliyuncs.com/api/v1';

const DOUBAO_BASE_URL = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';

export async function submitVideoTask(
  prompt: string,
  duration: number = 5,
  ratio: string = '16:9'
): Promise<VideoTaskResult> {
  // 先优化提示词
  const finalPrompt = await optimizePrompt(prompt, 'video');
  console.log(`[Video] 优化前: "${prompt.substring(0, 60)}..." → 优化后: "${finalPrompt.substring(0, 60)}..."`);

  try {
    const response = await fetch(`${DASHSCOPE_VIDEO_BASE}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HAPPYHORSE_API_KEY}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'happyhorse-1.0-t2v',
        input: { prompt: finalPrompt },
        parameters: {
          resolution: '720P',
          ratio,
          duration: Math.min(Math.max(duration, 3), 10),
          watermark: false,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Video] API 返回错误:', response.status, errText.substring(0, 500));
      return { taskId: null, status: 'error', message: `视频服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.output?.task_id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: '任务已提交' };
  } catch (error) {
    console.error('HappyHorse submit task error:', error);
    return { taskId: null, status: 'error', message: '网络错误' };
  }
}

// ====== HappyHorse I2V（图生视频） ======

interface I2VTaskResult {
  taskId: string | null;
  status: string;
  message: string;
}

export async function submitI2VTask(
  imageUrl: string,
  prompt: string,
  duration: number = 10
): Promise<I2VTaskResult> {
  const finalPrompt = await optimizePrompt(prompt, 'video');
  console.log(`[I2V] 图生视频: "${finalPrompt.substring(0, 60)}..."`);

  try {
    const response = await fetch(`${DASHSCOPE_VIDEO_BASE}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HAPPYHORSE_API_KEY}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'happyhorse-1.0-i2v',
        input: {
          prompt: finalPrompt,
          media: [{ type: 'first_frame', url: imageUrl }],
        },
        parameters: {
          resolution: '720P',
          duration: Math.min(Math.max(duration, 3), 10),
          watermark: false,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[I2V] API 返回错误:', response.status, errText.substring(0, 500));
      return { taskId: null, status: 'error', message: `图生视频服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.output?.task_id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: '图生视频任务已提交' };
  } catch (error) {
    console.error('HappyHorse I2V submit task error:', error);
    return { taskId: null, status: 'error', message: '网络错误' };
  }
}

// ====== AI 分镜脚本生成 ======

export interface StoryboardScene {
  index: number;
  timeStart: number;
  timeEnd: number;
  duration: number;
  visualPrompt: string;
  subtitle: string;
  transition: string;
}

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

// Input type for generateStoryboardV2
interface InspireInput {
  id: string | number;
  title?: string;
  type?: string;
  original_text?: string;
  ai_summary?: string;
  media_urls?: string[];
}

/** 一步生成分镜：素材 + 风格 + 时长 + 主题 + 语言 → storyboard[]（含 visualPrompt + subtitle） */
export async function generateStoryboardV2(params: {
  inspirations: InspireInput[];
  stylePreset: string;
  duration: number;
  topic?: string;
  language?: string;
}): Promise<StoryboardScene[]> {
  const { inspirations, stylePreset, duration, topic, language = 'zh' } = params;
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
${topic ? `主题方向：${topic}` : ''}${materialContext}
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

export async function getVideoTaskStatus(
  taskId: string
): Promise<{ status: string; videoUrl?: string; message?: string }> {
  try {
    const response = await fetch(`${DASHSCOPE_VIDEO_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${HAPPYHORSE_API_KEY}` },
    });

    if (!response.ok) {
      return { status: 'error', message: '查询失败' };
    }

    const data = await response.json();
    const taskStatus = data.output?.task_status;

    if (taskStatus === 'SUCCEEDED') {
      const videoUrl = data.output?.video_url || data.output?.videos?.[0]?.url;
      return { status: 'succeeded', videoUrl, message: '生成完成' };
    }

    if (taskStatus === 'FAILED') {
      return { status: 'failed', message: data.output?.message || data.message || '生成失败' };
    }

    return { status: 'running', message: '生成中...' };
  } catch (error) {
    console.error('HappyHorse query task error:', error);
    return { status: 'error', message: '网络错误' };
  }
}

// ====== 数字人 Audio2Video（wan2.2-s2v） ======

const DASHSCOPE_S2V_BASE = 'https://dashscope.aliyuncs.com/api/v1';

export async function submitDigitalHumanTask(params: {
  imageUrl: string;
  audioUrl: string;
  resolution?: '480P' | '720P';
  mode?: string; // 前端仍可传，但 API 暂不支持，仅保留兼容
}): Promise<VideoTaskResult> {
  const { imageUrl, audioUrl, resolution = '720P' } = params;

  try {
    const response = await fetch(`${DASHSCOPE_S2V_BASE}/services/aigc/image2video/video-synthesis/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HAPPYHORSE_API_KEY}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'wan2.2-s2v',
        input: {
          image_url: imageUrl,
          audio_url: audioUrl,
        },
        parameters: {
          resolution,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[DigitalHuman] API 错误:', response.status, errText.substring(0, 500));
      return { taskId: null, status: 'error', message: `数字人服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.output?.task_id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: '数字人任务已提交' };
  } catch (error) {
    console.error('[DigitalHuman] 提交错误:', error);
    return { taskId: null, status: 'error', message: '网络错误' };
  }
}

export async function getDigitalHumanTaskStatus(
  taskId: string
): Promise<{ status: string; videoUrl?: string; message?: string }> {
  try {
    const response = await fetch(`${DASHSCOPE_VIDEO_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${HAPPYHORSE_API_KEY}` },
    });

    if (!response.ok) {
      return { status: 'error', message: '查询失败' };
    }

    const data = await response.json();
    const taskStatus = data.output?.task_status;

    if (taskStatus === 'SUCCEEDED') {
      const videoUrl = data.output?.results?.video_url || data.output?.video_url || data.output?.videos?.[0]?.url;
      return { status: 'succeeded', videoUrl, message: '生成完成' };
    }

    if (taskStatus === 'FAILED') {
      return { status: 'failed', message: data.output?.message || data.message || '生成失败' };
    }

    return { status: 'running', message: '生成中...' };
  } catch (error) {
    console.error('[DigitalHuman] 查询错误:', error);
    return { status: 'error', message: '网络错误' };
  }
}

// ====== 通用 DashScope 视频提交（HappyHorse + Wan 2.6） ======

async function submitDashScopeVideoTask(
  config: VideoModelConfig,
  prompt: string,
  duration: number = 5,
  imageUrl?: string
): Promise<{ taskId: string | null; status: string; message: string }> {
  const finalPrompt = await optimizePrompt(prompt, 'video');
  const isWan = config.model.includes('wan');

  const input: Record<string, unknown> = { prompt: finalPrompt };
  if (imageUrl) {
    if (isWan) {
      input.img_url = imageUrl;
    } else {
      input.media = [{ type: 'first_frame', url: imageUrl }];
    }
  }

  const parameters: Record<string, unknown> = {
    duration: Math.min(Math.max(duration, 3), 10),
    watermark: false,
  };

  if (isWan && config.size) {
    parameters.size = config.size;
    if (config.extraParams) Object.assign(parameters, config.extraParams);
  } else {
    parameters.resolution = config.resolution || '720P';
    parameters.ratio = '16:9';
  }

  try {
    const response = await fetch(`${DASHSCOPE_VIDEO_BASE}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HAPPYHORSE_API_KEY}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({ model: config.model, input, parameters }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[DashScope:${config.model}] API 错误:`, response.status, errText.substring(0, 500));
      return { taskId: null, status: 'error', message: `视频服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.output?.task_id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: '任务已提交' };
  } catch (error) {
    console.error(`[DashScope:${config.model}] 提交错误:`, error);
    return { taskId: null, status: 'error', message: '网络错误' };
  }
}

// ====== Seedance 视频提交（ARK） ======

async function submitSeedanceTask(
  config: VideoModelConfig,
  prompt: string,
  duration: number = 5,
  imageUrl?: string
): Promise<{ taskId: string | null; status: string; message: string }> {
  const finalPrompt = await optimizePrompt(prompt, 'video');
  const apiKey = process.env.DOUBAO_API_KEY;
  if (!apiKey) return { taskId: null, status: 'error', message: 'DOUBAO_API_KEY 未配置' };

  const content: Record<string, unknown>[] = [
    { type: 'text', text: finalPrompt },
  ];
  if (imageUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: imageUrl },
      role: 'first_frame',
    });
  }

  try {
    const response = await fetch(`${DOUBAO_BASE_URL}/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        content,
        resolution: config.resolution || '720p',
        ratio: '16:9',
        duration: Math.min(Math.max(duration, 4), 15),
        watermark: false,
        service_tier: 'default',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Seedance:${config.model}] API 错误:`, response.status, errText.substring(0, 500));
      return { taskId: null, status: 'error', message: `Seedance 服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: '任务已提交' };
  } catch (error) {
    console.error(`[Seedance:${config.model}] 提交错误:`, error);
    return { taskId: null, status: 'error', message: '网络错误' };
  }
}

// ====== Seedance 任务状态查询 ======

async function getSeedanceTaskStatus(
  taskId: string
): Promise<{ status: string; videoUrl?: string; message?: string }> {
  const apiKey = process.env.DOUBAO_API_KEY;
  if (!apiKey) return { status: 'error', message: 'DOUBAO_API_KEY 未配置' };

  try {
    const response = await fetch(`${DOUBAO_BASE_URL}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      return { status: 'error', message: '查询失败' };
    }

    const data = await response.json();

    if (data.status === 'succeeded') {
      const videoUrl = data.content?.video_url;
      return { status: 'succeeded', videoUrl, message: '生成完成' };
    }

    if (data.status === 'failed') {
      return { status: 'failed', message: data.error?.message || data.message || '生成失败' };
    }

    return { status: 'running', message: '生成中...' };
  } catch (error) {
    console.error('Seedance query task error:', error);
    return { status: 'error', message: '网络错误' };
  }
}

// ====== 通用视频生成入口 ======

export async function submitVideoGenerationTask(
  tier: string,
  prompt: string,
  duration: number = 5,
  imageUrl?: string
): Promise<VideoTaskResult & { model: string; provider: VideoProvider }> {
  const qt = QUALITY_TIERS[tier] || QUALITY_TIERS['standard'];
  const config = imageUrl ? qt.i2v : qt.t2v;

  let result: VideoTaskResult;
  if (config.provider === 'ark') {
    result = await submitSeedanceTask(config, prompt, duration, imageUrl);
  } else {
    result = await submitDashScopeVideoTask(config, prompt, duration, imageUrl);
  }

  return { ...result, model: config.model, provider: config.provider };
}

export async function getVideoTaskStatusUniversal(
  taskId: string,
  provider: VideoProvider
): Promise<{ status: string; videoUrl?: string; message?: string }> {
  if (provider === 'ark') {
    return getSeedanceTaskStatus(taskId);
  }
  return getVideoTaskStatus(taskId);
}

export async function generateVideo(prompt: string, duration: number = 5) {
  const result = await submitVideoTask(prompt, duration);
  if (result.taskId) {
    return { videoUrl: null, prompt, duration, taskId: result.taskId, status: 'queued' };
  }
  return { videoUrl: `https://picsum.photos/seed/${Date.now()}/800/600`, prompt, duration };
}

// ====== AI 总结灵感内容 ======

export async function summarizeContent(
  content: string,
  contentType: string
): Promise<SummaryResult> {
  const prompt = `请对以下${contentType}内容进行分析和总结：

${content}

请以JSON格式返回以下内容：
{
  "title": "自动生成的标题",
  "summary": "内容的详细总结",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "tags": ["相关标签1", "相关标签2"],
  "creationSuggestions": ["创作建议1", "创作建议2"],
  "reuseScore": 80
}

只返回JSON，不要有其他文字。`;

  try {
    const result = await callDeepSeek(prompt, { temperature: 0.3, maxTokens: 1500 });
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as SummaryResult;
    }
  } catch (e) {
    console.error('AI summarization failed:', e);
  }

  return {
    title: '内容标题',
    summary: content.substring(0, 200),
    keyPoints: ['要点1', '要点2'],
    tags: ['灵感'],
    creationSuggestions: ['可以基于此内容创作小红书文案'],
    reuseScore: 70,
  };
}

// ====== AI 生成文案 ======

export async function generateCopywriting(
  inspirations: { title?: string; originalText?: string; aiSummary?: string }[],
  type: string,
  style: string,
  noAiTaste: boolean = false,
  n: number = 1
): Promise<string | string[]> {
  const inspirationText = inspirations.map((i) => {
    const parts: string[] = [];
    if (i.title) parts.push(`【标题】${i.title}`);
    if (i.aiSummary) parts.push(`【AI分析摘要】${i.aiSummary}`);
    if (i.originalText && !i.aiSummary) parts.push(`【原文】${i.originalText}`);
    return parts.join('\n');
  }).join('\n\n---\n\n');

  let styleInstruction = '';
  if (noAiTaste) {
    styleInstruction =
      '要求：去掉AI味，使用更自然的口语化表达，增加个人化的语气，避免过于工整的排比和模板化表达。';
  }

  const basePrompt = (angle: string) => `请基于以下灵感内容创作一篇${type}，风格要求：${style}。${angle}

灵感内容：
${inspirationText}

${styleInstruction}

请直接输出最终文案内容。`;

  try {
    if (n <= 1) {
      return await callDeepSeek(basePrompt(''), { temperature: 0.8, maxTokens: 1500 });
    }
    // 批量生成：不同角度 + 不同 temperature
    const angles = [
      '请从热门爆款角度撰写',
      '请从专业深度角度撰写',
      '请从情感共鸣角度撰写',
      '请从新奇有趣角度撰写',
      '请从实用干货角度撰写',
    ];
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        callDeepSeek(basePrompt(angles[i % angles.length]), {
          temperature: 0.7 + (i * 0.1),
          maxTokens: 1500,
        })
      )
    );
    return results;
  } catch (e) {
    console.error('Copywriting generation failed:', e);
    return n <= 1
      ? '✨ 这是一篇精彩的文案内容（模拟数据）...'
      : Array.from({ length: n }, (_, i) => `版本 ${i + 1}：这是一篇精彩的文案内容...`);
  }
}

// ====== Usage Recording ======

type AiTaskType = 'ai_summary' | 'copywriting' | 'image' | 'video';

export async function logAiUsage(
  userId: string,
  taskType: AiTaskType,
  tokensUsed: number
): Promise<void> {
  try {
    const { createAdminClient } = await import('./supabase-server');
    const supabase = createAdminClient();
    const month = new Date().toISOString().substring(0, 7);

    const { data: existing } = await supabase
      .from('usage_records')
      .select('*')
      .eq('user_id', userId)
      .eq('month', month)
      .single();

    const fieldMap: Record<AiTaskType, string> = {
      ai_summary: 'ai_summary_count',
      copywriting: 'ai_writing_count',
      image: 'image_count',
      video: 'video_count',
    };

    if (existing) {
      const field = fieldMap[taskType];
      await supabase
        .from('usage_records')
        .update({
          [field]: (existing as any)[field] + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('usage_records').insert({
        user_id: userId,
        month,
        ai_summary_count: taskType === 'ai_summary' ? 1 : 0,
        ai_writing_count: taskType === 'copywriting' ? 1 : 0,
        image_count: taskType === 'image' ? 1 : 0,
        video_count: taskType === 'video' ? 1 : 0,
        link_parse_count: 0,
        video_minutes: 0,
        audio_minutes: 0,
        storage_used_mb: 0,
      });
    }
  } catch (e) {
    console.error('Failed to log AI usage:', e);
  }
}

// ====== 数字人口播脚本生成 ======

const ORAL_SCRIPT_STYLES: Record<string, string> = {
  oral: '自然口播风格，像在和朋友聊天，语气亲切自然，有停顿和语气词',
  livestream: '直播带货风格，热情有感染力，多用感叹句和号召性语言，"快来"、"千万不要错过"',
  news: '新闻播报风格，正式专业，语句工整，信息密度高',
  emotional: '情感讲述风格，温柔舒缓，有故事感和代入感',
};

export async function generateOralScript(params: {
  topic: string;
  style?: string;
  language?: string;
  targetLength?: number;
  variantCount?: number;
  inspirations?: { title?: string; original_text?: string; ai_summary?: string }[];
}): Promise<string[]> {
  const { topic, style = 'oral', language = 'zh', targetLength = 500, variantCount = 1, inspirations = [] } = params;

  const langLabels: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어' };
  const langLabel = langLabels[language] || '中文';

  const styleDesc = ORAL_SCRIPT_STYLES[style] || ORAL_SCRIPT_STYLES.oral;

  let materialContext = '';
  if (inspirations.length > 0) {
    materialContext = '\n参考素材：\n' + inspirations.map((insp, i) => {
      const parts = [`素材${i + 1}：`];
      if (insp.title) parts.push(`标题：${insp.title}`);
      if (insp.original_text) parts.push(`原文：${insp.original_text}`);
      if (insp.ai_summary) parts.push(`摘要：${insp.ai_summary}`);
      return parts.join('\n');
    }).join('\n\n');
  }

  const angles = variantCount > 1
    ? ['请从开头引入的角度撰写', '请从核心观点展开的角度撰写', '请从案例故事的角度撰写', '请从问题解决的角度撰写', '请从总结升华的角度撰写']
    : [''];

  try {
    const results = await Promise.all(angles.slice(0, Math.max(variantCount, 1)).map(angle =>
      callDeepSeek(
        `你是专业的短视频口播脚本写手。请根据以下要求写出一个数字人口播脚本。

主题：${topic}
风格要求：${styleDesc}
目标字数：约${targetLength}字
输出语言：${langLabel}
${angle ? `角度要求：${angle}` : ''}${materialContext}

重要要求：
1. 纯口语化表达，适合朗读，不要书面语
2. 不要使用markdown格式（不要标题、列表、符号、加粗等）
3. 短句为主，每句不超过25个字
4. 加入自然的语气停顿和转折词
5. 开头要有吸引力，结尾有总结或互动
6. 直接输出脚本文字，不要任何其他说明或前缀`,
        { temperature: 0.8, maxTokens: 2000 }
      )
    ));

    return results.map(r => r.replace(/^["']|["']$/g, '').trim());
  } catch (e) {
    console.error('Oral script generation failed:', e);
    return [`大家好，今天我们来聊聊${topic}。这个话题非常有趣，让我来为大家详细介绍一下。\n\n首先，我们需要了解${topic}的基本概念。很多人可能对这个领域还不太熟悉，但其实它与我们的生活息息相关。\n\n那么，${topic}到底能给我们带来什么价值呢？让我们一探究竟。`];
  }
}

// ====== 长文本拆分 ======

// ====== 天气查询 ======

export interface WeatherData {
  city: string;
  current: {
    temp: number;
    feelsLike: number;
    desc: string;
    humidity: number;
    windSpeed: number;
    cloudCover: number;
  };
  forecast: {
    date: string;
    maxTemp: number;
    minTemp: number;
    desc: string;
    sunrise: string;
    sunset: string;
  }[];
}

const WEATHER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

export async function fetchWeather(city: string): Promise<WeatherData | null> {
  try {
    const encodedCity = encodeURIComponent(city.trim());
    const url = `http://wttr.in/${encodedCity}?format=j1`;

    const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY
      || process.env.http_proxy || process.env.https_proxy
      || 'http://127.0.0.1:6767'; // 兜底代理

    // 用原生 http 模块 + 代理
    const http = require('http');
    const { HttpsProxyAgent } = require('https-proxy-agent');
    const agent = new HttpsProxyAgent(proxyUrl);
    console.log('[Weather] 使用代理:', proxyUrl);

    // http.get 封装成 Promise
    const fetchWithAgent = (requestUrl: string): Promise<{ ok: boolean; json: () => Promise<any> }> =>
      new Promise((resolve, reject) => {
        http.get(requestUrl, { agent, headers: { 'User-Agent': WEATHER_USER_AGENT, 'Accept': 'application/json' } }, (res: any) => {
          let body = '';
          res.on('data', (chunk: string) => { body += chunk; });
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 400,
              json: () => Promise.resolve(JSON.parse(body)),
            });
          });
        }).on('error', reject);
      });

    const res = await fetchWithAgent(url);
    if (!res.ok) return null;

    const data = await res.json();
    const current = data.current_condition?.[0];
    const weather = data.weather;

    if (!current) return null;

    return {
      city: city.trim(),
      current: {
        temp: Number(current.temp_C),
        feelsLike: Number(current.FeelsLikeC),
        desc: current.weatherDesc?.[0]?.value || '未知',
        humidity: Number(current.humidity),
        windSpeed: Number(current.windspeedKmph),
        cloudCover: Number(current.cloudcover),
      },
      forecast: (weather || []).slice(0, 3).map((day: any) => ({
        date: day.date,
        maxTemp: Number(day.maxtempC),
        minTemp: Number(day.mintempC),
        desc: day.hourly?.[4]?.weatherDesc?.[0]?.value || '',
        sunrise: day.astronomy?.[0]?.sunrise || '',
        sunset: day.astronomy?.[0]?.sunset || '',
      })),
    };
  } catch (e) {
    console.error('[Weather] 获取天气失败:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ====== Helpers ======

function extractTags(text: string): string[] {
  const commonTags = ['AI', '科技', '创意', '设计', '灵感', '创作', '工具', '趋势'];
  return commonTags.filter((tag) => text.includes(tag)).slice(0, 3);
}
