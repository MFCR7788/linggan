// ContextAssembler — 统一上下文组装器
// 替代 route.ts 和 pipeline.ts 中重复的上下文检索 + system prompt 拼接逻辑
// 插件化 ContextSource，并行获取所有上下文片段

import type { ChatMessage } from '@/lib/ai/types';
import type { KnowledgeResult } from '@/lib/assistant/types';
import type { SkillMatch } from '@/lib/assistant/types';

export interface ContextInput {
  userId: string;
  sessionId?: string;
  userMessage: string;
  images?: string[];
  documents?: string[];
  historyMessages?: ChatMessage[];
  /** 已注入 system prompt 的历史摘要 */
  summaryBlock?: string;
}

export interface ContextChunk {
  /** 来源名称（用于日志调试） */
  source: string;
  /** system prompt 注入块 */
  promptBlock: string;
  /** 优先级（数字越小越靠前） */
  priority: number;
  /** 可选的原始数据（供后续使用） */
  raw?: unknown;
}

export interface AssembledContext {
  systemPrompt: string;
  messages: ChatMessage[];
  memoriesUsed: number;
  knowledgeUsed: number;
  skillsUsed: string[];
}

export interface ContextSource {
  /** 来源名称 */
  readonly name: string;
  /** 优先级（数字越小越靠前），默认 100 */
  readonly priority?: number;
  /** 是否可用 */
  isAvailable(): Promise<boolean>;
  /** 获取上下文片段 */
  fetch(input: ContextInput): Promise<ContextChunk | null>;
}

export class ContextAssembler {
  private sources: ContextSource[] = [];
  private baseSystemPrompt: string;

  constructor(baseSystemPrompt: string) {
    this.baseSystemPrompt = baseSystemPrompt;
  }

  /** 注册上下文来源 */
  registerSource(source: ContextSource): void {
    this.sources.push(source);
    // 按优先级排序
    this.sources.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /** 并行获取所有上下文片段，组装最终 system prompt */
  async assemble(input: ContextInput): Promise<AssembledContext> {
    // 并行获取所有来源
    const availableSources = await Promise.all(
      this.sources.map(async (s) => {
        const ok = await s.isAvailable().catch(() => false);
        return ok ? s : null;
      })
    );

    const activeSources = availableSources.filter((s): s is ContextSource => s !== null);

    const chunks = await Promise.all(
      activeSources.map((s) => s.fetch(input).catch(() => null))
    );

    // 拼接 system prompt
    let systemPrompt = this.baseSystemPrompt;

    if (input.summaryBlock) {
      systemPrompt += `\n\n${input.summaryBlock}`;
    }

    for (const chunk of chunks) {
      if (chunk && chunk.promptBlock) {
        systemPrompt += `\n\n${chunk.promptBlock}`;
      }
    }

    // 构建消息列表
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
    if (input.historyMessages) {
      for (const hm of input.historyMessages) {
        messages.push(hm);
      }
    }

    let userContent = input.userMessage;
    if (input.images && input.images.length > 0) {
      userContent += `\n\n[用户上传了 ${input.images.length} 张图片，AI 可以通过 analyze_image 工具分析这些图片: ${input.images.join(', ')}]`;
    }
    if (input.documents && input.documents.length > 0) {
      userContent += `\n\n[用户上传了 ${input.documents.length} 个文档: ${input.documents.join(', ')}]`;
    }
    messages.push({ role: 'user', content: userContent });

    // 统计
    const memoryChunk = chunks.find((c) => c?.source === 'memory');
    const knowledgeChunk = chunks.find((c) => c?.source === 'knowledge');
    const skillChunk = chunks.find((c) => c?.source === 'skills');

    return {
      systemPrompt,
      messages,
      memoriesUsed: memoryChunk ? (memoryChunk.raw as number) ?? 0 : 0,
      knowledgeUsed: knowledgeChunk ? (knowledgeChunk.raw as number) ?? 0 : 0,
      skillsUsed: skillChunk ? (skillChunk.raw as string[]) ?? [] : [],
    };
  }
}
