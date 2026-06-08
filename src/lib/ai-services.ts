// AI Services — 百炼 DashScope 统一（DeepSeek / Qwen / Wan / CosyVoice）

import { STYLE_PRESETS, LANGUAGE_OPTIONS } from './style-constants';
import { getDashScopeApiKey, getVolcTtsAppId, getVolcTtsAccessToken, getHappyHorseApiKey, getHeyGenApiKey, getDoubaoEndpointId, getEnv } from './runtime-config';

// 通用 fetch 超时包装
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 60000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

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
  enableSearch?: boolean;
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
  const apiKey = getDashScopeApiKey();
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured');
  }

  const body: Record<string, unknown> = {
    model: options.model || 'deepseek-v3',
    messages: [
      { role: 'system', content: '你是一个专业的内容创作助手，帮助用户总结、分析和创作内容。' },
      { role: 'user', content: prompt },
    ],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2000,
  };
  if (options.enableSearch) body.enable_search = true;

  const response = await fetchWithTimeout('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  }, 90000);

  if (!response.ok) {
    const error = await response.text();
    console.error('DeepSeek API error:', error);
    throw new Error(`DeepSeek API call failed: ${error.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`DeepSeek returned unexpected response: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return content;
}

// DeepSeek 流式输出（异步生成器，逐块 yield 文本）
export async function* callDeepSeekStream(
  prompt: string,
  options: ChatOptions = {}
): AsyncGenerator<string, string, unknown> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured');
  }

  const body: Record<string, unknown> = {
    model: options.model || 'deepseek-v3',
    messages: [
      { role: 'system', content: '你是一个专业的内容创作助手，帮助用户总结、分析和创作内容。' },
      { role: 'user', content: prompt },
    ],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2000,
    stream: true,
  };
  if (options.enableSearch) body.enable_search = true;

  const response = await fetchWithTimeout('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  }, 120000);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek stream failed: ${error.substring(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            yield delta;
          }
        } catch {
          // 跳过无法解析的行
        }
      }
    }

    // 处理流结束后 buffer 中剩余的完整行
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr !== '[DONE]') {
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              yield delta;
            }
          } catch { /* skip */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

// ====== 通义千问 / DashScope API ======

export async function callQwen(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = getDashScopeApiKey();
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

  const response = await fetchWithTimeout('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
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
  }, 90000);

  if (!response.ok) {
    const error = await response.text();
    console.error('DashScope API error:', error);
    throw new Error('DashScope API call failed');
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`DashScope returned unexpected response: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return content;
}

// ====== 百炼 Qwen API（替代原 Doubao/ARK） ======

function mapDoubaoModel(model: string): string {
  // 视觉模型 → qwen-vl
  if (model.includes('vision') || model.includes('vl')) return 'qwen-vl-plus';
  // 其他 doubao 模型 → qwen-plus
  if (model.includes('doubao')) return 'qwen-plus';
  return model;
}

export async function callDoubaoChat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured');
  }

  const rawModel = options.model || getDoubaoEndpointId() || 'doubao-seed-2.0-241215';
  const model = mapDoubaoModel(rawModel);

  const response = await fetchWithTimeout('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  }, 120000);

  if (!response.ok) {
    const error = await response.text();
    console.error('Qwen (百炼) API error:', error);
    throw new Error(`Qwen API call failed: ${error.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`Qwen returned unexpected response: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return content;
}

// ====== 百炼 Qwen-VL Vision API ======

export async function callDoubaoVision(
  imageUrl: string,
  prompt: string = '描述这张图片的内容'
): Promise<VisionResult> {
  try {
    const content = await callQwen(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      { temperature: 0.3, model: 'qwen-vl-plus' }
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

  const apiKey = getDashScopeApiKey();

  const systemPrompt = type === 'image'
    ? `你是 wanx2.1-t2i-turbo 模型的 AI 图像提示词专家。该模型擅长：写实摄影、中国水墨画、插画、精细场景渲染，支持中英文提示词。

根据用户输入增强提示词，添加以下维度：
- 主体：人物/物体的外貌、姿态、表情
- 构图：景别（特写/中景/全景）、角度、取景
- 光线：方向、质感（柔光/硬光）、时段
- 色彩：色调、饱和度、对比度
- 氛围：情绪、环境、天气
- 风格：艺术风格、渲染方式、参考美学

控制在 200 字以内。仅输出增强后的中文提示词，不要解释或使用 markdown。`
    : `你是 wan2.6 模型的 AI 视频提示词专家。该模型擅长：电影级画面、动态运镜（推拉摇移跟）、光影过渡、时序叙事，支持起止帧引导。

根据用户输入增强提示词，添加以下维度：
- 场景：环境、主体、氛围
- 运动：主体动作、物体动态、流动感
- 镜头：运镜方式（推/拉/摇/移/跟/固定）、速度、节奏
- 光线：随时间变化、过渡、情绪转换
- 节奏：节奏建议、关键节拍

控制在 200 字以内。仅输出增强后的中文提示词，不要解释或使用 markdown。`;

  try {
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v3',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请为 AI ${type === 'image' ? '图像' : '视频'} 增强以下提示词：\n\n${rawPrompt}` },
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

// ====== 百炼 wan2.2-image 图片生成 ======

function getSizeForRatio(ratio: string): string {
  // wanx2.1-t2i-turbo 限制：宽高 512-1440
  switch (ratio) {
    case '1:1':
      return '1440x1440';
    case '16:9':
      return '1440x810';
    case '9:16':
      return '810x1440';
    case '4:3':
      return '1440x1080';
    case '3:4':
      return '1080x1440';
    default:
      return '1440x1440';
  }
}

export async function generateImage(
  prompt: string,
  options: { ratio?: string; n?: number; seed?: number; skipOptimize?: boolean } = {}
): Promise<ImageResult | ImageResult[]> {
  const finalPrompt = options.skipOptimize
    ? prompt
    : await optimizePrompt(prompt, 'image');
  if (options.skipOptimize) {
    console.log(`[Image] 跳过优化: "${prompt.substring(0, 60)}..."`);
  } else {
    console.log(`[Image] 优化前: "${prompt.substring(0, 60)}..." → 优化后: "${finalPrompt.substring(0, 60)}..."`);
  }

  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY is not configured');

  const size = getSizeForRatio(options.ratio || '1:1');
  const n = options.n || 1;
  const seed = options.seed;

  // 百炼 wan2.2-image 使用 width*height 格式
  const [w, h] = size.split('x');
  const dashScopeSize = `${w}*${h}`;

  const requestBody: Record<string, unknown> = {
    model: 'wanx2.1-t2i-turbo',
    input: { prompt: finalPrompt },
    parameters: { size: dashScopeSize, n },
  };
  if (typeof seed === 'number' && Number.isFinite(seed) && seed >= 0) {
    (requestBody.parameters as Record<string, unknown>).seed = seed;
    console.log(`[Image] 使用固定种子: ${seed}`);
  }

  // 提交异步任务
  const submitRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(requestBody),
  });

  if (!submitRes.ok) {
    const errorText = await submitRes.text();
    console.error('wanx2.1-t2i-turbo API error:', submitRes.status, errorText);
    throw new Error(`图片生成失败: ${submitRes.status} ${errorText}`);
  }

  const submitData = await submitRes.json();
  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error('图片生成失败: 未获取到任务 ID');

  // 轮询结果
  const imageUrls = await pollImageTask(apiKey, taskId);
  if (!imageUrls || imageUrls.length === 0) throw new Error('图片生成超时');

  if (imageUrls.length === 1) {
    return { imageUrl: imageUrls[0], prompt: finalPrompt, size };
  }
  return imageUrls.map((url) => ({ imageUrl: url, prompt: finalPrompt, size }));
}

async function pollImageTask(apiKey: string, taskId: string): Promise<string[] | null> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();
    if (data.output?.task_status === 'SUCCEEDED') {
      const results = data.output?.results;
      if (!results || results.length === 0) return null;
      return results.map((r: any) => r.url).filter(Boolean);
    }
    if (data.output?.task_status === 'FAILED') {
      console.error('图片生成任务失败:', data.output?.message);
      throw new Error(data.output?.message || '图片生成失败');
    }
  }
  return null;
}

// ====== 视频模型注册表（从客户端安全模块导入） ======

import { QUALITY_TIERS, type VideoProvider, type VideoModelConfig, type QualityTier } from './video-models';
export { type VideoProvider, type VideoModelConfig, type QualityTier, QUALITY_TIERS };

// ====== HappyHorse 视频生成（百炼 DashScope） ======

const DASHSCOPE_VIDEO_BASE = 'https://dashscope.aliyuncs.com/api/v1';

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
        Authorization: `Bearer ${getHappyHorseApiKey()}`,
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
        Authorization: `Bearer ${getHappyHorseApiKey()}`,
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

/** 按目标时长计算分段，segmentMax 为单段最长秒数（默认10，premium可达15） */
export function calcSegmentDurations(totalDuration: number, segmentMax: number = 10): number[] {
  const numSegments = Math.ceil(totalDuration / segmentMax);
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

/** 一步生成分镜：素材 + 风格 + 时长 + 主题 + 语言 + 首帧 → storyboard[]（含 visualPrompt + subtitle） */
export async function generateStoryboardV2(params: {
  inspirations: InspireInput[];
  stylePreset: string;
  duration: number;
  topic?: string;
  language?: string;
  firstFrameUrl?: string;
  segmentMax?: number;
}): Promise<StoryboardScene[]> {
  const { inspirations, stylePreset, duration, topic, language = 'zh', firstFrameUrl, segmentMax = 10 } = params;
  const preset = STYLE_PRESETS[stylePreset] || STYLE_PRESETS.random;
  const durations = calcSegmentDurations(duration, segmentMax);
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
4. **画面连贯性**：相邻分镜之间需保持视觉连贯。统一色调和光线风格；如出现同一主体（人物/产品），保持外观一致；前一段的落幅构图应自然衔接到下一段的起幅构图，避免跳跃感${numSegments > 1 ? '。请先在心里确定整体的色彩基调、主体特征和运镜节奏，再逐一写出各段 visualPrompt' : ''}

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
      headers: { Authorization: `Bearer ${getHappyHorseApiKey()}` },
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
        Authorization: `Bearer ${getHappyHorseApiKey()}`,
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
      headers: { Authorization: `Bearer ${getHappyHorseApiKey()}` },
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

// ====== 数字人 Animate（wan2.2-animate 角色动作迁移） ======
// 静态头像 + 参考视频 → 让静态图"复刻"视频里的动作/表情
// 适合: 创始人 IP 持续产出、虚拟主播预制动作库
// 模型: wan2.2-animate (DashScope 百炼)
// API 端点: 与 s2v 同(POST /api/v1/services/aigc/image2video/video-synthesis/)

export interface AnimateSubmitResult {
  taskId: string | null;
  status: 'queued' | 'error';
  message: string;
}

export async function submitAnimateTask(params: {
  imageUrl: string;
  videoUrl: string;
  mode?: 'animate' | 'replace'; // animate=动作迁移, replace=角色替换
  resolution?: '480P' | '720P';
}): Promise<AnimateSubmitResult> {
  const { imageUrl, videoUrl, mode = 'animate', resolution = '720P' } = params;

  const apiKey = getHappyHorseApiKey();
  if (!apiKey) {
    return { taskId: null, status: 'error', message: 'HAPPYHORSE_API_KEY 未配置' };
  }

  try {
    const response = await fetch(`${DASHSCOPE_S2V_BASE}/services/aigc/image2video/video-synthesis/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'wan2.2-animate',
        input: {
          image_url: imageUrl,
          video_url: videoUrl,
          mode, // animate | replace
        },
        parameters: { resolution },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Animate] API 错误:', response.status, errText.substring(0, 500));
      // wan2.2-animate 可能在用户当前账号未开通,返友好错误
      if (errText.includes('ModelNotFound') || errText.includes('not found')) {
        return { taskId: null, status: 'error', message: 'wan2.2-animate 模型未开通,请在阿里云百炼控制台申请' };
      }
      return { taskId: null, status: 'error', message: `Animate 服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.output?.task_id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: 'Animate 任务已提交' };
  } catch (error: any) {
    console.error('[Animate] 提交错误:', error);
    return { taskId: null, status: 'error', message: `网络错误: ${error?.message || '未知'}` };
  }
}

export async function getAnimateTaskStatus(
  taskId: string
): Promise<{ status: string; videoUrl?: string; message?: string }> {
  try {
    const response = await fetch(`${DASHSCOPE_VIDEO_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${getHappyHorseApiKey()}` },
    });
    if (!response.ok) return { status: 'error', message: '查询失败' };
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
  } catch (e) {
    return { status: 'error', message: '网络错误' };
  }
}

// ====== 通用 DashScope 视频提交（HappyHorse + Wan 2.6） ======

async function submitDashScopeVideoTask(
  config: VideoModelConfig,
  prompt: string,
  duration: number = 5,
  imageUrl?: string,
  lastFrameUrl?: string,
  extraFrameUrls?: string[]
): Promise<{ taskId: string | null; status: string; message: string }> {
  const finalPrompt = await optimizePrompt(prompt, 'video');
  const isWan = config.model.includes('wan');

  const input: Record<string, unknown> = { prompt: finalPrompt };
  if (imageUrl) {
    if (isWan) {
      input.img_url = imageUrl;
      if (lastFrameUrl) input.last_frame_url = lastFrameUrl;
      // Wan 多帧: 中间关键帧传为 reference_images
      if (extraFrameUrls && extraFrameUrls.length > 0) {
        input.reference_images = extraFrameUrls.slice(0, 5);
      }
    } else {
      const media: Array<{ type: string; url: string }> = [{ type: 'first_frame', url: imageUrl }];
      if (lastFrameUrl) media.push({ type: 'last_frame', url: lastFrameUrl });
      if (extraFrameUrls) {
        extraFrameUrls.slice(0, 5).forEach((url) => media.push({ type: 'reference_frame', url }));
      }
      input.media = media;
    }
  }

  const parameters: Record<string, unknown> = {
    duration: Math.min(Math.max(duration, 3), config.maxDuration || 10),
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
        Authorization: `Bearer ${getHappyHorseApiKey()}`,
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


// ====== 通用视频生成入口（百炼 DashScope Wan 系列） ======

export async function submitVideoGenerationTask(
  tier: string,
  prompt: string,
  duration: number = 5,
  imageUrl?: string,
  lastFrameUrl?: string,
  extraFrameUrls?: string[],
  mode?: "i2v" | "multi"
): Promise<VideoTaskResult & { model: string; provider: VideoProvider }> {
  const qt = QUALITY_TIERS[tier] || QUALITY_TIERS["fast"];
  let config: VideoModelConfig;
  if (mode === "multi" && qt.multiImageI2v) {
    config = qt.multiImageI2v;
  } else {
    config = imageUrl ? qt.i2v : qt.t2v;
  }

  const result = await submitDashScopeVideoTask(config, prompt, duration, imageUrl, lastFrameUrl, extraFrameUrls);

  return { ...result, model: config.model, provider: config.provider };
}

export async function getVideoTaskStatusUniversal(
  taskId: string,
  _provider: VideoProvider
): Promise<{ status: string; videoUrl?: string; message?: string }> {
  return getVideoTaskStatus(taskId);
}
export async function generateVideo(prompt: string, duration: number = 5) {
  const result = await submitVideoTask(prompt, duration);
  if (result.taskId) {
    return { videoUrl: null, prompt, duration, taskId: result.taskId, status: 'queued' };
  }
  throw new Error(result.message || '视频生成任务提交失败');
}

// ====== 联网搜索研究 ======

export async function researchTopic(
  topic: string,
  context?: string
): Promise<string> {
  const contextBlock = context ? `\n参考背景：${context}` : '';

  const prompt = `请联网搜索关于以下话题的最新信息和趋势，整理出一份研究简报：

话题：${topic}${contextBlock}

请从以下维度整理搜索结果：
1. 📊 最新趋势和动态 — 该话题最近的流行方向、热门事件
2. 🔥 热门观点和讨论 — 用户/行业关注的热点、争议点
3. 📈 关键数据和案例 — 相关的统计数据、成功案例
4. 💡 文案角度建议 — 基于以上信息，推荐 2-3 个文案切入点

请确保引用的信息有时效性，标出来源。总字数控制在 500 字以内。`;

  try {
    const result = await callDeepSeek(prompt, {
      temperature: 0.3,
      maxTokens: 1200,
      enableSearch: true,
    });
    return result;
  } catch (e) {
    console.error('Research failed:', e);
    return '';
  }
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
  n: number = 1,
  industryInstruction?: string,
  userInstruction?: string,
  researchContext?: string
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

  const industryBlock = industryInstruction ? `\n${industryInstruction}\n` : '';
  const userBlock = userInstruction ? `\n【用户特别要求】\n${userInstruction}\n` : '';

  const researchBlock = researchContext
    ? `\n【联网搜索研究资料】\n${researchContext}\n\n请结合以上研究资料中的最新趋势、数据和热点，生成更有深度和时效性的文案。\n`
    : '';

  const basePrompt = (angle: string) => `请基于以下灵感内容创作一篇${type}，风格要求：${style}。${angle}
${industryBlock}${userBlock}${researchBlock}
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

type AiTaskType = 'ai_summary' | 'copywriting' | 'image' | 'image_batch' | 'video' | 'digital_human' | 'digital_human_batch' | 'video_merge';

export async function logAiUsage(
  userId: string,
  taskType: AiTaskType,
  tokensUsed: number
): Promise<void> {
  try {
    const { createAdminClient } = await import('./supabase-server');
    const supabase = createAdminClient();
    const month = new Date().toISOString().substring(0, 7);

    const fieldMap: Record<AiTaskType, string> = {
      ai_summary: 'ai_summary_count',
      copywriting: 'ai_writing_count',
      image: 'image_count',
      image_batch: 'image_count',
      video: 'video_count',
      digital_human: 'digital_human_count',
      digital_human_batch: 'digital_human_count',
      video_merge: 'video_count',
    };

    const field = fieldMap[taskType];

    // 尝试原子 RPC 累加
    const { error: rpcErr } = await supabase.rpc('increment_usage_field', {
      p_user_id: userId,
      p_month: month,
      p_field: field,
      p_delta: 1,
    });

    if (rpcErr) {
      // 降级：两步操作 + CAS 守卫（乐观锁）
      const { data: existing } = await supabase
        .from('usage_records')
        .select('id')
        .eq('user_id', userId)
        .eq('month', month)
        .maybeSingle();

      if (existing) {
        const prevValue = (existing as any)[field] || 0;
        await supabase
          .from('usage_records')
          .update({
            [field]: prevValue + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .eq(field, prevValue); // CAS guard
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
    const url = `https://wttr.in/${encodedCity}?format=j1`;

    const proxyUrl = getEnv('HTTP_PROXY') || getEnv('HTTPS_PROXY')
      || getEnv('http_proxy') || getEnv('https_proxy');

    if (!proxyUrl) {
      // 无代理时用原生 https 直连
      const https = require('https');
      const fetchDirect = (requestUrl: string): Promise<{ ok: boolean; json: () => Promise<any> }> =>
        new Promise((resolve, reject) => {
          const req = https.get(requestUrl, {
            headers: { 'User-Agent': WEATHER_USER_AGENT, 'Accept': 'application/json' },
            timeout: 15000,
          }, (res: any) => {
            let body = '';
            res.on('data', (chunk: string) => { body += chunk; });
            res.on('end', () => {
              try {
                resolve({
                  ok: res.statusCode >= 200 && res.statusCode < 400,
                  json: () => Promise.resolve(JSON.parse(body)),
                });
              } catch {
                resolve({ ok: false, json: () => Promise.resolve(null) });
              }
            });
          });
          req.on('timeout', () => { req.destroy(); reject(new Error('Weather request timeout')); });
          req.on('error', reject);
        });

      const res = await fetchDirect(url);
      if (!res.ok) return null;
      const data = await res.json();
      return parseWeatherResponse(city.trim(), data);
    }

    // 有代理时使用代理
    const http = require('http');
    const { HttpsProxyAgent } = require('https-proxy-agent');
    const agent = new HttpsProxyAgent(proxyUrl);
    console.log('[Weather] 使用代理:', proxyUrl);

    const fetchWithAgent = (requestUrl: string): Promise<{ ok: boolean; json: () => Promise<any> }> =>
      new Promise((resolve, reject) => {
        const req = http.get(requestUrl, {
          agent,
          headers: { 'User-Agent': WEATHER_USER_AGENT, 'Accept': 'application/json' },
          timeout: 15000,
        }, (res: any) => {
          let body = '';
          res.on('data', (chunk: string) => { body += chunk; });
          res.on('end', () => {
            try {
              resolve({
                ok: res.statusCode >= 200 && res.statusCode < 400,
                json: () => Promise.resolve(JSON.parse(body)),
              });
            } catch {
              resolve({ ok: false, json: () => Promise.resolve(null) });
            }
          });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Weather request timeout')); });
        req.on('error', reject);
      });

    const res = await fetchWithAgent(url);
    if (!res.ok) return null;
    const data = await res.json();
    return parseWeatherResponse(city.trim(), data);
  } catch (e) {
    console.error('[Weather] 获取天气失败:', e instanceof Error ? e.message : e);
    return null;
  }
}

function parseWeatherResponse(city: string, data: any): WeatherData | null {
  const current = data.current_condition?.[0];
  const weather = data.weather;
  if (!current) return null;

  return {
    city,
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
}

// ====== 火山引擎 TTS 声音复刻 (Voice Cloning) ======
// V1 接口: https://openspeech.bytedance.com/api/v1/mega_tts/audio/upload
// 鉴权: Authorization: Bearer;{token}, Resource-Id: seed-icl-1.0 (V1) / seed-icl-2.0 (V2)
// 价格: 训练 ¥99 一次性, 合成按字符数计费 ~¥0.0001/字
// 限制: 单文件 ≤ 10MB, 同一 speaker_id 最多 10 次上传

const VOLC_TTS_HOST = 'openspeech.bytedance.com';

export type VoiceCloneStatus = 'NotFound' | 'Training' | 'Success' | 'Failed' | 'Active';

export interface VoiceCloneUploadResult {
  ok: boolean;
  speakerId: string;
  status: VoiceCloneStatus;
  error?: string;
}

export interface VoiceCloneStatusResult {
  speakerId: string;
  status: VoiceCloneStatus;
  error?: string;
}

/** 上传音频做声音复刻(训练阶段,通常 1-5 分钟) */
export async function cloneVoiceUpload(params: {
  audioBase64: string;
  audioFormat: 'wav' | 'mp3' | 'm4a' | 'ogg' | 'aac' | 'pcm';
  speakerId: string;
  demoText: string; // 4-80 字, 用于和音频对比校验
  language?: 0 | 1 | 2 | 3 | 4 | 5; // 0=cn, 1=en, 2=ja, 3=es, 4=id, 5=pt
  modelType?: 1 | 2 | 3 | 4 | 5; // 1=ICL 1.0, 2=DiT 标准, 4=ICL V2
}): Promise<VoiceCloneUploadResult> {
  const appid = getVolcTtsAppId();
  const accessToken = getVolcTtsAccessToken();
  if (!appid || !accessToken) {
    return { ok: false, speakerId: params.speakerId, status: 'Failed', error: 'TTS 服务未配置(VOLC_TTS_APP_ID / VOLC_TTS_ACCESS_TOKEN)' };
  }

  const modelType = params.modelType ?? 1; // 默认 ICL 1.0
  const resourceId = modelType >= 4 ? 'seed-icl-2.0' : 'seed-icl-1.0';

  const body = {
    appid,
    speaker_id: params.speakerId,
    audios: [
      {
        audio_bytes: params.audioBase64,
        audio_format: params.audioFormat,
      },
    ],
    source: 2,
    language: params.language ?? 0,
    model_type: modelType,
    text: params.demoText,
  };

  try {
    const response = await fetch(`https://${VOLC_TTS_HOST}/api/v1/mega_tts/audio/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer; ${accessToken}`,
        'Resource-Id': resourceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    // 火山 V1 返回格式: { status_code, status, message, ... }
    if (!response.ok || (data.status_code !== undefined && data.status_code !== 0 && data.status_code !== 20000000)) {
      return {
        ok: false,
        speakerId: params.speakerId,
        status: 'Failed',
        error: data.message || `上传失败 (HTTP ${response.status})`,
      };
    }
    return {
      ok: true,
      speakerId: params.speakerId,
      status: data.status || 'NotFound',
    };
  } catch (e: any) {
    return {
      ok: false,
      speakerId: params.speakerId,
      status: 'Failed',
      error: e?.message || '网络错误',
    };
  }
}

/** 查询声音复刻训练状态 */
export async function cloneVoiceStatus(speakerId: string): Promise<VoiceCloneStatusResult> {
  const appid = getVolcTtsAppId();
  const accessToken = getVolcTtsAccessToken();
  if (!appid || !accessToken) {
    return { speakerId, status: 'NotFound', error: 'TTS 服务未配置' };
  }

  try {
    const response = await fetch(`https://${VOLC_TTS_HOST}/api/v1/mega_tts/status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer; ${accessToken}`,
        'Resource-Id': 'seed-icl-1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ appid, speaker_id: speakerId }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { speakerId, status: 'NotFound', error: `查询失败 (HTTP ${response.status})` };
    }
    return {
      speakerId,
      status: data.status || 'NotFound',
      error: data.message,
    };
  } catch (e: any) {
    return { speakerId, status: 'NotFound', error: e?.message || '网络错误' };
  }
}

/** 用克隆的 voice_id 合成语音(让数字人用自己声音说) */
export async function synthesizeWithClonedVoice(params: {
  text: string;
  speakerId: string;
  speed?: number;
  pitch?: number;
}): Promise<Buffer | null> {
  const appid = getVolcTtsAppId();
  const accessToken = getVolcTtsAccessToken();
  if (!appid || !accessToken) return null;

  const speedRatio = Math.min(Math.max(params.speed ?? 1.15, 0.5), 2.0);
  const pitchRatio = Math.min(Math.max(params.pitch ?? 1.0, 0.5), 2.0);

  const body = {
    app: { appid, token: accessToken, cluster: 'volcano_tts' },
    user: { uid: 'lingji' },
    audio: {
      voice_type: params.speakerId, // 克隆的 speaker_id 直接当 voice_type 用
      encoding: 'mp3',
      rate: 24000,
      speed_ratio: speedRatio,
      pitch_ratio: pitchRatio,
      volume_ratio: 1.0,
    },
    request: {
      reqid: `tts_clone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: params.text,
      text_type: 'plain',
      operation: 'query',
    },
  };

  try {
    const response = await fetch(`https://${VOLC_TTS_HOST}/api/v1/tts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer; ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data: any = await response.json();
    if (data.data && data.data.audio) {
      return Buffer.from(data.data.audio, 'base64');
    }
    return null;
  } catch {
    return null;
  }
}

// ====== 阿里 CosyVoice v2 TTS(中文 SOTA) ======
// DashScope 同步 HTTP API:POST /api/v1/services/audio/tts/SpeechSynthesizer
// 流程:POST → 返回 JSON 含 output.audio.url(OSS) → GET 拿 MP3 bytes
// 价格:¥0.6/万字符(超拟人档),新用户 1 万次免费
// 音色:cosyvoice-v2 需带 _v2 后缀(longxiaochun_v2),v3-flash 不带后缀
// 注:cosyvoice-v1 仅支持 WebSocket,不支持 HTTP
// 默认 v2 + 龙小淳(温柔女声·默认)
export type CosyVoiceId = 'longxiaochun_v2' | 'longxiaoxia_v2' | 'longxiaoyu_v2' | 'longhua_v2' | 'longyue_v2' | 'longcheng_v2' | 'longjing_v2' | 'longanhuan' | 'longwan_v2' | 'longfei_v2';
export type CosyVoiceModel = 'cosyvoice-v2' | 'cosyvoice-v3-flash';

export interface CosyVoiceOptions {
  voice?: CosyVoiceId;
  speed?: number;     // 0.5-2.0,默认 1.0
  pitch?: number;     // 0.5-2.0,默认 1.0
  volume?: number;    // 0-100,默认 50
  model?: CosyVoiceModel;
}

export async function synthesizeWithCosyVoice(params: {
  text: string;
  options?: CosyVoiceOptions;
}): Promise<Buffer | null> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) {
    console.warn('[CosyVoice] DASHSCOPE_API_KEY 未配置(getDashScopeApiKey 返回空)');
    return null;
  }
  console.log('[CosyVoice] API key 已加载, 前8位:', apiKey.slice(0, 8));

  const {
    voice = 'longxiaochun_v2',
    speed = 1.0,
    pitch = 1.0,
    volume = 50,
    model = 'cosyvoice-v2',
  } = params.options || {};

  try {
    // Step 1: 调用同步 HTTP API,获取 OSS 音频 URL
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: {
          text: params.text,
          voice,
          format: 'mp3',
          sample_rate: 24000,
          rate: speed,
          pitch,
          volume,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[CosyVoice] HTTP ${response.status}:`, errText.slice(0, 300));
      return null;
    }

    const json: any = await response.json();
    if (json.code) {
      console.error(`[CosyVoice] 业务错误 code=${json.code}:`, json.message);
      return null;
    }

    const audioUrl = json?.output?.audio?.url;
    if (!audioUrl) {
      console.warn('[CosyVoice] 响应中无 audio.url:', JSON.stringify(json).slice(0, 200));
      return null;
    }

    // Step 2: 下载 OSS 上的 MP3
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) {
      console.error(`[CosyVoice] 下载音频失败 HTTP ${audioResp.status}`);
      return null;
    }

    const ab = await audioResp.arrayBuffer();
    if (ab.byteLength < 100) {
      console.warn('[CosyVoice] 返回音频过小,可能合成失败');
      return null;
    }
    return Buffer.from(ab);
  } catch (e: any) {
    console.warn('[CosyVoice] 调用失败:', e?.message || e);
    return null;
  }
}

// ====== Helpers ======

function extractTags(text: string): string[] {
  const commonTags = ['AI', '科技', '创意', '设计', '灵感', '创作', '工具', '趋势'];
  return commonTags.filter((tag) => text.includes(tag)).slice(0, 3);
}

// ====== 数字分身训练 + 生成（HeyGen） ======
// 创始人 IP 高阶:上传 5-10 分钟视频 → 训练专属数字分身 → 用分身生成任意脚本的视频
// 计费: 训练免费,生成按 $0.0667/sec (Digital Twin) 或 $0.05/sec (Photo Avatar)

const HEYGEN_BASE = 'https://api.heygen.com';

export type AvatarTrainingStatus = 'pending' | 'training' | 'ready' | 'failed';

export interface AvatarTrainingResult {
  ok: boolean;
  avatarId: string | null;
  status: AvatarTrainingStatus;
  error?: string;
}

export interface AvatarTrainingStatusResult {
  avatarId: string;
  status: AvatarTrainingStatus;
  error?: string;
  coverUrl?: string;
  previewVideoUrl?: string;
}

/** 提交数字分身训练 — 上传 5-10 分钟清晰人声视频 */
export async function trainAvatar(params: {
  videoUrl: string;
  name: string;
  lookalike?: boolean; // true=Digital Twin(视频), false=Photo Avatar(单图)
}): Promise<AvatarTrainingResult> {
  const heygenKey = getHeyGenApiKey();
  if (!heygenKey) {
    return { ok: false, avatarId: null, status: 'failed', error: 'HEYGEN_API_KEY 未配置,数字分身功能不可用' };
  }

  try {
    // HeyGen: POST /v1/photo_avatar/lookalike (单图)
    // 或 POST /v1/video_avatar/training/upload (Digital Twin 视频)
    // 这里用 lookalike 端点(更普适,支持单图/视频)
    const response = await fetch(`${HEYGEN_BASE}/v1/photo_avatar/lookalike`, {
      method: 'POST',
      headers: {
        'X-Api-Key': heygenKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.name,
        video_url: params.videoUrl,
        lookalike: params.lookalike ?? true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Avatar] 训练 API 错误:', response.status, errText.substring(0, 500));
      if (errText.includes('Unauthorized') || response.status === 401) {
        return { ok: false, avatarId: null, status: 'failed', error: 'HeyGen API Key 无效' };
      }
      if (response.status === 402) {
        return { ok: false, avatarId: null, status: 'failed', error: 'HeyGen 账户余额不足' };
      }
      return { ok: false, avatarId: null, status: 'failed', error: `训练提交失败 (HTTP ${response.status})` };
    }

    const data = await response.json();
    const avatarId = data.data?.avatar_id || data.data?.id;
    if (!avatarId) {
      return { ok: false, avatarId: null, status: 'failed', error: '未获取到 avatar_id' };
    }
    return { ok: true, avatarId, status: 'training' };
  } catch (e: any) {
    return { ok: false, avatarId: null, status: 'failed', error: e?.message || '网络错误' };
  }
}

/** 查询数字分身训练状态 */
export async function getAvatarTrainingStatus(avatarId: string): Promise<AvatarTrainingStatusResult> {
  const heygenKey = getHeyGenApiKey();
  if (!heygenKey) {
    return { avatarId, status: 'failed', error: 'HEYGEN_API_KEY 未配置' };
  }

  try {
    const response = await fetch(`${HEYGEN_BASE}/v1/photo_avatar/lookalike/${avatarId}`, {
      headers: { 'X-Api-Key': heygenKey },
    });

    if (!response.ok) {
      return { avatarId, status: 'failed', error: `查询失败 (HTTP ${response.status})` };
    }

    const data = await response.json();
    const statusRaw = data.data?.status || 'pending';
    // 映射: pending/training/ready/failed
    const status: AvatarTrainingStatus = statusRaw === 'completed' ? 'ready'
      : statusRaw === 'success' ? 'ready'
      : statusRaw === 'failed' ? 'failed'
      : statusRaw === 'training' ? 'training'
      : 'pending';

    return {
      avatarId,
      status,
      error: data.data?.error,
      coverUrl: data.data?.cover_url,
      previewVideoUrl: data.data?.preview_video_url,
    };
  } catch (e: any) {
    return { avatarId, status: 'failed', error: e?.message || '网络错误' };
  }
}

/** 用已训练的数字分身生成视频 */
export async function generateAvatarVideo(params: {
  avatarId: string;
  script: string;
  voiceId?: string; // 可选 TTS 音色
  backgroundColor?: string;
}): Promise<{ ok: boolean; videoId?: string; videoUrl?: string; error?: string }> {
  const heygenKey = getHeyGenApiKey();
  if (!heygenKey) {
    return { ok: false, error: 'HEYGEN_API_KEY 未配置' };
  }

  try {
    // POST /v1/video/generate
    const response = await fetch(`${HEYGEN_BASE}/v1/video/generate`, {
      method: 'POST',
      headers: {
        'X-Api-Key': heygenKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_inputs: [
          {
            character: {
              type: 'avatar',
              avatar_id: params.avatarId,
              avatar_style: 'normal',
            },
            voice: {
              type: 'text',
              input_text: params.script,
              voice_id: params.voiceId,
            },
            background: {
              type: 'color',
              value: params.backgroundColor || '#0F172A',
            },
          },
        ],
        dimension: { width: 1280, height: 720 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, error: `视频生成失败 (HTTP ${response.status}): ${errText.substring(0, 200)}` };
    }

    const data = await response.json();
    const videoId = data.data?.video_id;
    if (!videoId) return { ok: false, error: '未获取到 video_id' };
    return { ok: true, videoId };
  } catch (e: any) {
    return { ok: false, error: e?.message || '网络错误' };
  }
}

/** 查询数字分身视频生成状态 */
export async function getAvatarVideoStatus(videoId: string): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}> {
  const heygenKey = getHeyGenApiKey();
  if (!heygenKey) {
    return { status: 'failed', error: 'HEYGEN_API_KEY 未配置' };
  }

  try {
    const response = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
      headers: { 'X-Api-Key': heygenKey },
    });
    if (!response.ok) return { status: 'failed', error: '查询失败' };

    const data = await response.json();
    const statusRaw = data.data?.status;
    const status = statusRaw === 'completed' ? 'completed'
      : statusRaw === 'failed' ? 'failed'
      : statusRaw === 'processing' ? 'processing'
      : 'pending';

    return {
      status,
      videoUrl: data.data?.video_url,
      error: data.data?.error?.message,
    };
  } catch (e: any) {
    return { status: 'failed', error: e?.message || '网络错误' };
  }
}
