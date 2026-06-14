// AI 字幕优化器 — 用 DeepSeek 优化字幕断句、时间轴和翻译
// 输入: 语音识别原始结果 → 输出: 优化后的字幕片段

import type { OptimizedSubtitle } from './types';

interface RawSubtitleLine {
  index: number;
  startTime: number; // 秒
  endTime: number;   // 秒
  text: string;
}

interface OptimizationOptions {
  /** 目标语言 */
  language?: string;
  /** 是否生成双语字幕翻译 */
  translateTo?: string;
  /** 每行最大字符数 */
  maxCharsPerLine?: number;
  /** 最短持续时间(秒) */
  minDuration?: number;
}

/**
 * 用 AI 优化字幕：
 * 1. 合并过短的相邻字幕
 * 2. 拆分过长的字幕
 * 3. 优化标点符号和断句
 * 4. 可选：生成双语翻译
 */
export async function optimizeSubtitles(
  rawSubtitles: RawSubtitleLine[],
  options: OptimizationOptions = {}
): Promise<OptimizedSubtitle[]> {
  const { maxCharsPerLine = 25, minDuration = 0.8 } = options;

  if (rawSubtitles.length === 0) return [];

  // 第一阶段：规则优化
  let optimized = ruleBasedOptimize(rawSubtitles, { maxCharsPerLine, minDuration });

  // 第二阶段：AI 优化（仅在配置了 API Key 时）
  const aiOptimized = await aiOptimize(optimized, options);
  if (aiOptimized) {
    optimized = aiOptimized;
  }

  return optimized;
}

/** 规则优化：合并短句、拆分长句 */
function ruleBasedOptimize(
  subtitles: RawSubtitleLine[],
  opts: { maxCharsPerLine: number; minDuration: number }
): OptimizedSubtitle[] {
  const result: OptimizedSubtitle[] = [];
  let buffer: RawSubtitleLine | null = null;

  for (const line of subtitles) {
    if (!buffer) {
      buffer = { ...line };
      continue;
    }

    const duration = line.endTime - line.startTime;
    const combinedText = buffer.text + line.text;

    // 合并条件：当前是短句 或 合并后不超过最大字符
    if (duration < opts.minDuration || combinedText.length <= opts.maxCharsPerLine) {
      buffer.endTime = line.endTime;
      buffer.text = combinedText;
    } else {
      result.push({
        index: result.length,
        startTime: buffer.startTime,
        endTime: buffer.endTime,
        text: buffer.text.trim(),
      });
      buffer = { ...line };
    }
  }

  if (buffer) {
    result.push({
      index: result.length,
      startTime: buffer.startTime,
      endTime: buffer.endTime,
      text: buffer.text.trim(),
    });
  }

  return result;
}

/** AI 优化字幕质量和翻译 */
async function aiOptimize(
  subtitles: OptimizedSubtitle[],
  options: OptimizationOptions
): Promise<OptimizedSubtitle[] | null> {
  const apiKey = (() => {
    try {
      // eslint-disable-next-line
      const { getDeepSeekApiKey } = require('@/lib/runtime-config');
      return getDeepSeekApiKey() || process.env.DEEPSEEK_API_KEY || '';
    } catch {
      return process.env.DEEPSEEK_API_KEY || '';
    }
  })();

  if (!apiKey || subtitles.length === 0) return null;

  try {
    const subText = subtitles.map(s => `[${s.startTime.toFixed(1)}-${s.endTime.toFixed(1)}] ${s.text}`).join('\n');

    let prompt = `优化以下字幕的断句和表达。规则：
1. 每行不超过25个字符
2. 合并语义不完整的短句
3. 拆分过长的句子
4. 保持在相同时间范围内
5. 去除语气词（嗯、啊、呃）
保持格式: [开始-结束] 文本`;

    if (options.translateTo) {
      prompt += `\n6. 同时在每行后添加${options.translateTo === 'en' ? '英文' : '翻译'}（格式: [开始-结束] 中文 | English）`;
    }

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: subText },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';

    // 解析优化后的字幕
    const lines = content.split('\n').filter((l: string) => l.trim());
    const optimized: OptimizedSubtitle[] = [];

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/\[([\d.]+)-([\d.]+)\]\s*(.+)/);
      if (match) {
        let text = match[3].trim();
        let translation: string | undefined;
        // 检测双语分隔符 |
        const pipeIdx = text.indexOf(' | ');
        if (pipeIdx > 0) {
          translation = text.slice(pipeIdx + 3).trim();
          text = text.slice(0, pipeIdx).trim();
        }
        optimized.push({
          index: i,
          startTime: parseFloat(match[1]),
          endTime: parseFloat(match[2]),
          text,
          translation,
        });
      }
    }

    return optimized.length > 0 ? optimized : null;
  } catch (e) {
    console.warn('[subtitle-optimizer] AI 优化失败:', e);
    return null;
  }
}

export type { RawSubtitleLine, OptimizationOptions };
