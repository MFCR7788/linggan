// 智能剪辑 LLM 分析 — by_description / product / topic 模式
// 仅这三种模式调 LLM，复用 callDeepSeek

import { callDeepSeek } from '@/lib/ai-services';
import type { TimedSentence } from '@/lib/video-transcriber';
import type { SegmentAnalysis } from './smart-clip-analysis';

export interface SlicePoint {
  id: string;
  start: number;
  end: number;
  title: string;
  description?: string;
  enabled: boolean;
  confidence: number;
}

// ── by_description: 理解自然语言 → 定位时间区间 ──

export async function analyzeClipByDescription(
  sentences: TimedSentence[],
  description: string,
  videoDuration: number
): Promise<SegmentAnalysis[]> {
  const transcript = sentences
    .map((s) => `[${formatTime(s.begin_time / 1000)}-${formatTime(s.end_time / 1000)}] ${s.text}`)
    .join('\n');

  const prompt = `你是一个视频剪辑专家。用户上传了一段视频并描述了想删除的内容。
请根据视频转写结果，找出用户想删除的段落对应的时间区间。

视频时长: ${formatTime(videoDuration)}
转写结果:
${transcript}

用户描述想删除的内容: "${description}"

返回 JSON（只输出 JSON）:
{
  "cuts": [
    { "start": 开始秒数, "end": 结束秒数, "reason": "删除原因" }
  ]
}

规则:
- start/end 是秒数（数字）
- 如果用户描述的是模糊概念（如"广告"、"废话"），根据转写内容判断
- 如果没有找到匹配的段落，返回空数组
- 只输出 JSON，不要任何解释文字`;

  try {
    const result = await callDeepSeek(prompt, { temperature: 0.3, maxTokens: 1500 });
    const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned);
    const cuts: Array<{ start: number; end: number; reason: string }> = parsed.cuts || [];

    // 生成 keep/cut 分段
    const segments: SegmentAnalysis[] = [];
    let cursor = 0;
    const sorted = cuts.sort((a, b) => a.start - b.start);

    for (const cut of sorted) {
      if (cut.start > cursor + 0.1) {
        segments.push({
          start: cursor,
          end: cut.start,
          text: '',
          recommendation: 'keep',
          reason: '内容保留',
          confidence: 1,
        });
      }
      segments.push({
        start: Math.max(cut.start, cursor),
        end: Math.min(cut.end, videoDuration),
        text: '',
        recommendation: 'cut',
        reason: cut.reason,
        confidence: 0.8,
      });
      cursor = Math.max(cursor, cut.end);
    }

    if (cursor < videoDuration - 0.1) {
      segments.push({
        start: cursor,
        end: videoDuration,
        text: '',
        recommendation: 'keep',
        reason: '内容保留',
        confidence: 1,
      });
    }

    return segments;
  } catch (e) {
    console.error('[smart-clip-plan] analyzeClipByDescription 失败:', e);
    throw new Error(`LLM 分析失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── product: 识别产品讲解段落 ──

export async function analyzeSliceByProduct(
  sentences: TimedSentence[],
  keywords: string[],
  videoDuration: number
): Promise<SlicePoint[]> {
  const transcript = sentences
    .map((s) => `[${formatTime(s.begin_time / 1000)}] ${s.text}`)
    .join('\n');

  const keywordHint = keywords.length > 0
    ? `已知产品关键词: ${keywords.join(', ')}`
    : '请根据转写内容自动识别产品/商品';

  const prompt = `你是一个直播带货切片专家。分析以下直播/视频转写，找出所有产品讲解/带货段落。

视频时长: ${formatTime(videoDuration)}
${keywordHint}

转写结果:
${transcript}

返回 JSON（只输出 JSON）:
{
  "slices": [
    {
      "start": 开始秒数,
      "end": 结束秒数,
      "title": "切片标题（15字以内）",
      "confidence": 0.85
    }
  ]
}

规则:
- 识别主播开始介绍产品的时刻（如"这个是..."、"给大家看..."、"链接..."、"多少米"）
- 每段切片 15-180 秒为宜
- 包含产品介绍完整上下文
- 按发生时间排序
- 只输出 JSON，不要任何解释文字`;

  try {
    const result = await callDeepSeek(prompt, { temperature: 0.3, maxTokens: 2000 });
    const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned);
    const slices: SlicePoint[] = (parsed.slices || []).map(
      (s: { start: number; end: number; title: string; confidence?: number }, i: number) => ({
        id: `slice-${i + 1}`,
        start: s.start,
        end: Math.min(s.end, videoDuration),
        title: s.title || `切片 ${i + 1}`,
        enabled: true,
        confidence: s.confidence || 0.7,
      })
    );

    return slices;
  } catch (e) {
    console.error('[smart-clip-plan] analyzeSliceByProduct 失败:', e);
    throw new Error(`LLM 切片分析失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── topic: 话题分段 ──

export async function analyzeSliceByTopic(
  sentences: TimedSentence[],
  videoDuration: number
): Promise<SlicePoint[]> {
  const transcript = sentences
    .map((s) => `[${formatTime(s.begin_time / 1000)}] ${s.text}`)
    .join('\n');

  const prompt = `你是一个视频编辑专家。分析以下视频转写，按话题/主题将视频切分为独立段落。

视频时长: ${formatTime(videoDuration)}

转写结果:
${transcript}

返回 JSON（只输出 JSON）:
{
  "slices": [
    {
      "start": 开始秒数,
      "end": 结束秒数,
      "title": "话题标题（15字以内）",
      "confidence": 0.85
    }
  ]
}

规则:
- 在话题/主题明显切换的地方分段
- 每段 30-300 秒
- 覆盖整个视频，不留空白
- 标题简洁概括该段主题
- 只输出 JSON，不要任何解释文字`;

  try {
    const result = await callDeepSeek(prompt, { temperature: 0.3, maxTokens: 2000 });
    const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned);
    const slices: SlicePoint[] = (parsed.slices || []).map(
      (s: { start: number; end: number; title: string; confidence?: number }, i: number) => ({
        id: `topic-${i + 1}`,
        start: s.start,
        end: Math.min(s.end, videoDuration),
        title: s.title || `段落 ${i + 1}`,
        enabled: true,
        confidence: s.confidence || 0.7,
      })
    );

    return slices;
  } catch (e) {
    console.error('[smart-clip-plan] analyzeSliceByTopic 失败:', e);
    throw new Error(`LLM 话题分段失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
