import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextEngine } from '@/lib/agent/context-engine';
import type { ChatMessage } from '@/lib/ai/types';

// Mock context compressor
vi.mock('@/lib/assistant/context-compressor', () => ({
  compressHistory: vi.fn().mockResolvedValue({
    compressedSummary: '[compressed history]',
    recentMessages: [
      { role: 'user' as const, content: 'last question' },
      { role: 'assistant' as const, content: 'last answer' },
    ],
  }),
}));

describe('ContextEngine', () => {
  let engine: ContextEngine;

  beforeEach(() => {
    engine = new ContextEngine({
      thresholdRatio: 0.75,
      contextWindow: 10000,
      minMessagesToCompress: 10,
    });
  });

  describe('updateFromResponse', () => {
    it('从 API usage 字段更新 token 计数', () => {
      engine.updateFromResponse({
        prompt_tokens: 500,
        completion_tokens: 200,
        total_tokens: 700,
      });

      expect(engine.lastPromptTokens).toBe(500);
      expect(engine.lastCompletionTokens).toBe(200);
      expect(engine.lastTotalTokens).toBe(700);
      expect(engine.sessionTotalTokens).toBe(700);
    });

    it('无 usage 数据时不更新', () => {
      engine.updateFromResponse(undefined);
      expect(engine.lastTotalTokens).toBe(0);
    });

    it('累计 session token', () => {
      engine.updateFromResponse({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
      engine.updateFromResponse({ prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 });
      expect(engine.sessionTotalTokens).toBe(450);
    });
  });

  describe('shouldCompress', () => {
    it('消息数不足不触发压缩', () => {
      const msgs: ChatMessage[] = Array.from({ length: 5 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `message ${i}`,
      }));
      expect(engine.shouldCompress(msgs)).toBe(false);
    });

    it('token 估算低于阈值不触发压缩', () => {
      // 少量字符 = 少量 token
      const msgs: ChatMessage[] = Array.from({ length: 15 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: 'hi',
      }));
      expect(engine.shouldCompress(msgs)).toBe(false);
    });
  });

  describe('compress', () => {
    it('压缩后系统消息保留在开头', async () => {
      const msgs: ChatMessage[] = [
        { role: 'system', content: 'system prompt' },
        ...Array.from({ length: 30 }, (_, i) => ({
          role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
          content: `message ${i} with more content to increase token count significantly`,
        })),
      ];

      const result = await engine.compress(msgs);
      expect(result[0].role).toBe('system');
      expect(engine.compressionCount).toBe(1);
    });
  });

  describe('resetSession', () => {
    it('重置会话计数', () => {
      engine.updateFromResponse({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
      engine.compressionCount = 3;
      engine.resetSession();
      expect(engine.sessionTotalTokens).toBe(0);
      expect(engine.compressionCount).toBe(0);
    });
  });
});
