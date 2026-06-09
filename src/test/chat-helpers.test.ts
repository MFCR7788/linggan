import { describe, it, expect } from 'vitest';
import { isLinkInput, normalizeUrl } from '@/lib/assistant/chat-helpers';

describe('isLinkInput', () => {
  it('recognizes https URLs', () => {
    expect(isLinkInput('https://example.com/article')).toBe(true);
  });

  it('recognizes www URLs', () => {
    expect(isLinkInput('www.example.com')).toBe(true);
  });

  it('rejects plain text', () => {
    expect(isLinkInput('帮我写一篇文案')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isLinkInput('')).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('adds https:// to bare URLs', () => {
    expect(normalizeUrl('www.example.com')).toBe('https://www.example.com');
  });

  it('preserves existing https://', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });
});
