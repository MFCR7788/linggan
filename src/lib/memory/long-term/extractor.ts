// MemoryExtractor — 会话结束后调用 LLM 提取关键记忆
// 参考 Hermes trajectory_compressor.py 的压缩提取模式
// 后台异步执行，不阻塞 Agent 主循环

import type { MemoryExtractResult } from './types';
import { defaultModelRouter } from '@/lib/providers/model-router';

const EXTRACT_PROMPT = `分析以下对话，提取关于用户的重要信息。只提取值得跨会话记住的内容。

返回 JSON 数组，每条记忆包含:
- type: "preference" (偏好/喜好), "fact" (事实/信息), "style" (创作风格), "workflow" (工作流程)
- content: 简洁描述（一句话）
- importance: 重要性 1-10

规则:
- 只提取与用户直接相关的信息（用户的偏好、背景、风格、工作习惯）
- 忽略一次性、临时的信息
- 每个关键发现单独一条记忆
- 没有值得记住的内容则返回空数组 []
- importance >= 5: 重要信息（用户明确表达）
- importance >= 3: 可能有用（间接推断）
- importance < 3: 不值得记忆

对话内容:
{conversation}

只输出 JSON 数组，不要其他内容。`;

interface ExtractInput {
  userId: string;
  sessionId?: string;
  messages: Array<{ role: string; content: string }>;
}

export class MemoryExtractor {
  private extractEnabled: boolean;

  constructor(enabled = true) {
    this.extractEnabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.extractEnabled = enabled;
  }

  async extract(input: ExtractInput): Promise<MemoryExtractResult[]> {
    if (!this.extractEnabled) return [];
    if (!input.messages || input.messages.length < 2) return [];

    try {
      const conversationText = input.messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n')
        .slice(0, 8000); // 限制长度控制成本

      const prompt = EXTRACT_PROMPT.replace('{conversation}', conversationText);

      const response = await defaultModelRouter.chat(
        [
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          temperature: 0.3,
          maxTokens: 1024,
        }
      );

      return this.parseResponse(response);
    } catch (e) {
      console.warn('[MemoryExtractor] 提取失败:', e);
      return [];
    }
  }

  private parseResponse(text: string): MemoryExtractResult[] {
    try {
      // 尝试提取 JSON
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(
          (item: unknown): item is MemoryExtractResult =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as Record<string, unknown>).type === 'string' &&
            typeof (item as Record<string, unknown>).content === 'string' &&
            ['preference', 'fact', 'style', 'workflow'].includes(
              (item as Record<string, unknown>).type as string
            )
        )
        .map((item) => ({
          type: item.type,
          content: item.content,
          importance: Math.max(1, Math.min(10, Math.round(Number(item.importance) || 5))),
        }))
        .filter((item) => item.importance >= 3);
    } catch {
      console.warn('[MemoryExtractor] JSON 解析失败');
      return [];
    }
  }
}

/** 全局单例 */
let globalExtractor: MemoryExtractor | null = null;

export function getMemoryExtractor(): MemoryExtractor {
  if (!globalExtractor) {
    globalExtractor = new MemoryExtractor();
  }
  return globalExtractor;
}
