// ContextPipeline — 多源上下文检索与 Prompt 组装
// 并行检索：记忆 + 灵感库 → 公共知识库 → 联网搜索（fallback）

import type { PipelineContext, PipelineResult } from './types';
import type { DetectedIntent } from './intent';
import type { KnowledgeManager } from './knowledge/manager';
import type { MemoryManager } from './memory/manager';
import { generateEmbedding } from './embedding';
import { detectIntent } from './intent';
import { buildPrompt, PROMPT_MODULES, LINGJI_IDENTITY, GEN_JSON_TEMPLATE } from './prompts';
import { sanitizeContext } from './memory/provider';

export interface PipelineDeps {
  memoryManager: MemoryManager;
  knowledgeManager: KnowledgeManager;
}

export interface PipelineInput {
  query: string;
  userId: string;
  images?: string[];
  videos?: string[];
  documents?: string[];
  historyMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionId?: string;
}

export class ContextPipeline {
  private memoryManager: MemoryManager;
  private knowledgeManager: KnowledgeManager;

  constructor(deps: PipelineDeps) {
    this.memoryManager = deps.memoryManager;
    this.knowledgeManager = deps.knowledgeManager;
  }

  /** 执行完整上下文检索管道 */
  async execute(input: PipelineInput): Promise<PipelineResult> {
    const { query, userId, images, videos, historyMessages } = input;
    const hasImages = !!(images && images.length > 0);
    const hasVideos = !!(videos && videos.length > 0);

    // 1. 生成 embedding
    let embedding: number[] = [];
    try {
      embedding = await generateEmbedding(query);
    } catch (e) {
      console.warn('[Pipeline] embedding 生成失败，降级为纯文本检索:', e);
    }

    // 2. 并行检索：记忆 + 知识库
    const [memoryBlock, knowledge] = await Promise.all([
      embedding.length > 0
        ? this.memoryManager.prefetchAll(query, embedding)
        : Promise.resolve(''),
      this.knowledgeManager.search(query, embedding, userId),
    ]);

    // 3. 分离知识库结果
    const inspirations = knowledge.results.filter(r => r.source === '你的灵感库');
    const knowledgeResults = knowledge.results.filter(
      r => r.source !== '你的灵感库' && r.source !== '联网搜索'
    );

    // 4. 意图检测
    const intent = detectIntent(query, hasImages, hasVideos, historyMessages || []);

    // 5. 构建上下文
    const context: PipelineContext = {
      memoryBlock,
      inspirations,
      knowledgeResults,
      webSearchResults: knowledge.fellBackToWeb
        ? knowledge.results.filter(r => r.source === '联网搜索').map(r => r.content).join('\n\n')
        : undefined,
      historyMessages: historyMessages || [],
      matchedSkills: [],
      skillInvocations: [],
    };

    // 6. 构建 Prompt（注入记忆和知识上下文）
    const mod = PROMPT_MODULES[intent.type];
    const requiresJSON =
      (intent.wantsGeneration && (intent.type === 'image' || intent.type === 'video')) ||
      mod.requiresJSON;

    const systemPrompt = this.buildEnhancedSystemPrompt(intent, context, requiresJSON);
    const userPrompt = this.buildEnhancedUserPrompt(intent, query);

    return {
      systemPrompt,
      userPrompt,
      context,
      requiresJSON,
      intentType: intent.type,
    };
  }

  /** 构建增强版 System Prompt（注入记忆 + 知识上下文） */
  private buildEnhancedSystemPrompt(
    intent: DetectedIntent,
    ctx: PipelineContext,
    requiresJSON: boolean
  ): string {
    const mod = PROMPT_MODULES[intent.type];
    const parts: string[] = [LINGJI_IDENTITY];

    // 记忆上下文（prefetchAll 已生成完整 <memory-context> 块）
    if (ctx.memoryBlock) {
      parts.push(ctx.memoryBlock);
    }

    // 灵感库上下文
    if (ctx.inspirations.length > 0) {
      const block = ctx.inspirations
        .map(
          (r, i) =>
            `[灵感${i + 1}] ${sanitizeContext(r.title)}\n${sanitizeContext(r.content.slice(0, 300))}`
        )
        .join('\n\n');
      parts.push(
        `<knowledge-context type="inspirations">\n以下是用户灵感库中与当前话题相关的内容：\n\n${block}\n</knowledge-context>`
      );
    }

    // 公共知识库上下文
    if (ctx.knowledgeResults.length > 0) {
      const block = ctx.knowledgeResults
        .map(
          (r, i) =>
            `[知识${i + 1}] ${sanitizeContext(r.title)}\n${sanitizeContext(r.content.slice(0, 300))}`
        )
        .join('\n\n');
      parts.push(
        `<knowledge-context type="public-kb">\n以下是公共知识库中与当前话题相关的内容：\n\n${block}\n</knowledge-context>`
      );
    }

    // 联网搜索回退
    if (ctx.webSearchResults) {
      parts.push(
        `<knowledge-context type="web-search">\n以下是联网搜索到的最新信息：\n\n${sanitizeContext(ctx.webSearchResults.slice(0, 800))}\n</knowledge-context>`
      );
    }

    // 模块化 System Prompt
    parts.push(mod.systemPrompt);

    if (requiresJSON) {
      parts.push(
        `\n请按以下JSON格式返回结果：\n${GEN_JSON_TEMPLATE}\n\n注意：先给自然语言回复，再输出JSON。JSON必须放在最后。`
      );
    }

    return parts.join('\n\n---\n\n');
  }

  /** 构建增强版 User Prompt */
  private buildEnhancedUserPrompt(intent: DetectedIntent, query: string): string {
    const { requiresJSON } = buildPrompt(intent, query);
    return requiresJSON
      ? `用户意图：${intent.label}（${intent.description}）\n\n用户输入：${query}`
      : `用户输入：${query}`;
  }

  /** 获取管道统计 */
  getStats(lastContext: PipelineContext): {
    memoriesUsed: number;
    inspirationsUsed: number;
    knowledgeUsed: number;
    webSearchUsed: boolean;
  } {
    return {
      memoriesUsed: lastContext.memoryBlock ? 1 : 0, // memoryBlock 已合并为单个块
      inspirationsUsed: lastContext.inspirations.length,
      knowledgeUsed: lastContext.knowledgeResults.length,
      webSearchUsed: !!lastContext.webSearchResults,
    };
  }
}
