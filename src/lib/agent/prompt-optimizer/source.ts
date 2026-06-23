// PromptOptimizerSource — ContextSource 实现，在 Agent 循环前优化用户输入

import type { ContextSource, ContextInput, ContextChunk } from '@/lib/context/assembler';
import type { PromptOptimizerRaw } from './types';
import { defaultPromptOptimizer } from './optimizer';
import { tacticalMemory } from './evolution/tactical-memory';
import { strategicMemory } from './evolution/strategic-memory';

const MIN_LENGTH = 8;

export class PromptOptimizerSource implements ContextSource {
  readonly name = 'prompt-optimizer';
  readonly priority = 5;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async fetch(input: ContextInput): Promise<ContextChunk | null> {
    if (input.userMessage.length < MIN_LENGTH) return null;

    try {
      // 构建记忆偏置 Map
      const memoryBiases = new Map<string, number>();

      // 战术记忆（会话内）
      if (input.sessionId) {
        const tacticalBiases = tacticalMemory.getAllBiases(input.sessionId);
        for (const [fid, adj] of tacticalBiases) {
          memoryBiases.set(fid, adj.bias);
        }
      }

      // 战略记忆（跨会话）
      try {
        const strategicPrefs = await strategicMemory.getAllPreferences(input.userId);
        for (const [fid, pref] of strategicPrefs) {
          // 战略偏置 = (平滑成功率 - 0.5) * 0.2，范围 ±0.1
          const strategicBias = (pref.smoothedRate - 0.5) * 0.2;
          // 叠加：战术偏置优先（范围 ±0.15），战略偏置补充（范围 ±0.1）
          const existing = memoryBiases.get(fid) || 0;
          memoryBiases.set(fid, existing + strategicBias);
        }
      } catch { /* 战略记忆不可用时跳过 */ }

      const result = await defaultPromptOptimizer.optimize({
        originalPrompt: input.userMessage,
        userId: input.userId,
        sessionId: input.sessionId,
        memoryBiases: memoryBiases.size > 0 ? memoryBiases : undefined,
      });

      if (result.optimized === result.original) return null;

      const raw: PromptOptimizerRaw = {
        original: result.original,
        optimized: result.optimized,
        frameworkId: result.frameworkUsed.id,
        frameworkName: result.frameworkUsed.name,
        confidence: result.frameworkUsed.confidence,
      };

      return {
        source: this.name,
        promptBlock: '',
        priority: this.priority,
        raw,
      };
    } catch {
      return null;
    }
  }
}
