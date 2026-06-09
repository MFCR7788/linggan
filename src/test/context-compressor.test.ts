import { describe, it, expect } from 'vitest';
import { buildCompressedMessages } from '@/lib/assistant/context-compressor';

describe('buildCompressedMessages', () => {
  it('returns original messages when summary is empty', () => {
    const msgs = [{ role: 'user' as const, content: 'hello' }, { role: 'assistant' as const, content: 'hi' }];
    expect(buildCompressedMessages('', msgs)).toBe(msgs);
  });

  it('prepends summary when provided', () => {
    const msgs = [{ role: 'user' as const, content: 'hello' }];
    const result = buildCompressedMessages('用户讨论了文案优化的话题。', msgs);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toContain('用户讨论了文案优化的话题。');
    expect(result[1]).toBe(msgs[0]);
  });
});
