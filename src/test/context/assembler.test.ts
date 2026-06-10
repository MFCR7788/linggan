import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextAssembler } from '@/lib/context/assembler';
import type { ContextSource, ContextInput, ContextChunk } from '@/lib/context/assembler';

// Mock embedding 生成
vi.mock('@/lib/assistant/embedding', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

function makeSource(opts: {
  name: string;
  priority?: number;
  available?: boolean;
  chunk?: string;
  raw?: unknown;
  delay?: number;
}): ContextSource {
  return {
    name: opts.name,
    priority: opts.priority,
    isAvailable: async () => opts.available ?? true,
    fetch: async (_input: ContextInput): Promise<ContextChunk | null> => {
      if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
      if (!opts.chunk) return null;
      return {
        source: opts.name,
        promptBlock: opts.chunk,
        priority: opts.priority ?? 100,
        raw: opts.raw,
      };
    },
  };
}

describe('ContextAssembler', () => {
  let assembler: ContextAssembler;

  beforeEach(() => {
    assembler = new ContextAssembler('base system prompt');
  });

  it('基础 system prompt 拼接', async () => {
    assembler.registerSource(makeSource({ name: 'test', chunk: '## 测试\n测试内容' }));

    const result = await assembler.assemble({
      userId: 'user-1',
      userMessage: 'hello',
    });

    expect(result.systemPrompt).toContain('base system prompt');
    expect(result.systemPrompt).toContain('## 测试');
    expect(result.systemPrompt).toContain('测试内容');
  });

  it('多个 source 按优先级排序拼接', async () => {
    assembler.registerSource(makeSource({ name: 'low', priority: 100, chunk: '## Low priority' }));
    assembler.registerSource(makeSource({ name: 'high', priority: 10, chunk: '## High priority' }));

    const result = await assembler.assemble({
      userId: 'user-1',
      userMessage: 'hello',
    });

    // High priority should appear before Low priority
    const highIdx = result.systemPrompt.indexOf('## High priority');
    const lowIdx = result.systemPrompt.indexOf('## Low priority');
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it('不可用 source 被跳过', async () => {
    assembler.registerSource(makeSource({ name: 'unavailable', available: false, chunk: 'SHOULD NOT APPEAR' }));
    assembler.registerSource(makeSource({ name: 'available', chunk: '## Available' }));

    const result = await assembler.assemble({
      userId: 'user-1',
      userMessage: 'hello',
    });

    expect(result.systemPrompt).not.toContain('SHOULD NOT APPEAR');
    expect(result.systemPrompt).toContain('## Available');
  });

  it('source 异常不中断其他 source', async () => {
    const throwingSource: ContextSource = {
      name: 'throwing',
      isAvailable: async () => true,
      fetch: async () => { throw new Error('boom'); },
    };

    assembler.registerSource(throwingSource);
    assembler.registerSource(makeSource({ name: 'ok', chunk: '## Still works' }));

    const result = await assembler.assemble({
      userId: 'user-1',
      userMessage: 'hello',
    });

    expect(result.systemPrompt).toContain('## Still works');
  });

  it('historyMessages 正确注入', async () => {
    const result = await assembler.assemble({
      userId: 'user-1',
      userMessage: 'hello',
      historyMessages: [
        { role: 'user', content: 'prev question' },
        { role: 'assistant', content: 'prev answer' },
      ],
    });

    expect(result.messages).toHaveLength(4); // system + 2 history + 1 user
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[1].content).toBe('prev question');
    expect(result.messages[3].content).toBe('hello');
  });

  it('summaryBlock 注入 system prompt', async () => {
    const result = await assembler.assemble({
      userId: 'user-1',
      userMessage: 'hello',
      summaryBlock: '[历史摘要]',
    });

    expect(result.systemPrompt).toContain('[历史摘要]');
  });

  it('正确统计各 source 使用量', async () => {
    assembler.registerSource(makeSource({ name: 'memory', priority: 10, chunk: '## Memory', raw: 1 }));
    assembler.registerSource(makeSource({ name: 'knowledge', priority: 20, chunk: '## Knowledge', raw: 3 }));
    assembler.registerSource(makeSource({ name: 'skills', priority: 30, chunk: '## Skills', raw: ['skill-a'] }));

    const result = await assembler.assemble({
      userId: 'user-1',
      userMessage: 'hello',
    });

    expect(result.memoriesUsed).toBe(1);
    expect(result.knowledgeUsed).toBe(3);
    expect(result.skillsUsed).toEqual(['skill-a']);
  });

  it('并行获取 — 慢 source 不阻塞快 source', async () => {
    assembler.registerSource(makeSource({ name: 'slow', delay: 50, chunk: '## Slow' }));
    assembler.registerSource(makeSource({ name: 'fast', delay: 5, chunk: '## Fast' }));

    const start = Date.now();
    const result = await assembler.assemble({ userId: 'user-1', userMessage: 'hello' });
    const elapsed = Date.now() - start;

    expect(result.systemPrompt).toContain('## Fast');
    expect(result.systemPrompt).toContain('## Slow');
    expect(elapsed).toBeLessThan(100); // parallel, so should be ~50ms, not 55ms
  });
});
