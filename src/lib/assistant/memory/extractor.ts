// 记忆提取器 — 从对话中自动提取关键信息写入记忆
// 使用 LLM 从用户消息中提取可持久化的事实/偏好

import { callDeepSeek } from '@/lib/ai-services';

export interface ExtractedMemory {
  category: 'profile' | 'preference' | 'fact' | 'workflow' | 'general';
  key?: string;
  value: string;
  importance: number;
}

const EXTRACTION_PROMPT = `你是一个信息提取助手。从用户的对话消息中提取值得持久化记忆的信息。

提取规则：
1. profile: 用户身份/角色/工作领域相关信息（如"我是母婴博主""我做小红书"）
2. preference: 用户的偏好/习惯/要求（如"我喜欢口语化风格""不要用emoji"）
3. fact: 用户陈述的客观事实（如"我的账号有10万粉丝""我3月发过XXX内容"）
4. workflow: 用户重复的工作模式（如"我每周一发布内容""我通常先写文案再生成图片"）
5. general: 其他值得记住的信息

importance 评分 (1-10)：
- 10: 核心身份信息，每次对话都需要知道
- 7-9: 重要偏好或频繁使用的工作流
- 4-6: 一般事实或偶尔需要的偏好
- 1-3: 临时信息，可能很快过时

如果没有值得提取的信息，返回空数组。

请严格按以下 JSON 格式输出（不要 markdown 代码块）：
{
  "memories": [
    {
      "category": "preference",
      "key": "writing_style",
      "value": "用户喜欢口语化风格",
      "importance": 8
    }
  ]
}`;

export async function extractMemories(
  userContent: string,
  assistantContent: string
): Promise<ExtractedMemory[]> {
  // 跳过太短的消息
  if (userContent.length < 20) return [];

  const prompt = `${EXTRACTION_PROMPT}\n\n用户消息：${userContent.slice(0, 500)}\nAI 回复：${assistantContent.slice(0, 200)}`;

  try {
    const result = await callDeepSeek(prompt, { temperature: 0.1, maxTokens: 500 });
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const memories: ExtractedMemory[] = (parsed.memories || [])
      .filter((m: { value?: string }) => m.value && m.value.trim().length > 3)
      .map((m: { category: string; key?: string; value: string; importance: number }) => ({
        category: validateCategory(m.category),
        key: m.key || undefined,
        value: m.value.trim(),
        importance: Math.min(10, Math.max(1, m.importance || 3)),
      }));

    return memories;
  } catch (e) {
    console.warn('[MemoryExtractor] 提取失败:', e);
    return [];
  }
}

function validateCategory(c: string): ExtractedMemory['category'] {
  const valid = new Set(['profile', 'preference', 'fact', 'workflow', 'general']);
  return valid.has(c) ? (c as ExtractedMemory['category']) : 'general';
}
