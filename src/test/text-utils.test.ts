import { describe, it, expect } from 'vitest';
import { splitLongText } from '@/lib/text-utils';

describe('splitLongText', () => {
  it('短文本直接返回原数组（不拆分）', () => {
    const result = splitLongText('Hello World', 500);
    expect(result).toEqual(['Hello World']);
  });

  it('空白文本返回空数组', () => {
    expect(splitLongText('   ')).toEqual([]);
    expect(splitLongText('')).toEqual([]);
  });

  it('刚好 500 字符不拆分', () => {
    const text = 'a'.repeat(500);
    const result = splitLongText(text, 500);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(500);
  });

  it('501 字符拆成两段', () => {
    const text = 'a'.repeat(501);
    const result = splitLongText(text, 500);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(500);
    expect(result[1]).toHaveLength(1);
  });

  it('在中文句号处断句', () => {
    const part1 = '第一段内容。';
    const part2 = '第二段内容。';
    const padding = 'x'.repeat(500 - part1.length);
    const text = part1 + padding + part2;
    const result = splitLongText(text, 500);
    expect(result[0]).toContain(part1);
  });

  it('在换行符处断句', () => {
    const text = 'A'.repeat(300) + '\n' + 'B'.repeat(300);
    const result = splitLongText(text, 500);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(300); // .trim() removes trailing \n
  });

  it('极短 maxChars 每个字符一段（边界情况）', () => {
    const result = splitLongText('ABC', 1);
    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('默认 maxChars=500', () => {
    const text = 'x'.repeat(600);
    const result = splitLongText(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(500);
    expect(result[1]).toHaveLength(100);
  });

  it('含中英文标点的混合文本正确断句', () => {
    const chunk = 'x'.repeat(400);
    const text = chunk + '.' + 'y'.repeat(200);
    const result = splitLongText(text, 500);
    // 句子边界在 400 位置（最后一个 .），超过 50% 阈值（250）
    expect(result[0]).toContain('.');
    expect(result).toHaveLength(2);
  });
});
