import { describe, it, expect } from 'vitest';
import {
  getPlatformColor,
  getFilterButtonStyle,
  formatRelativeTime,
  TYPE_EMOJIS,
  TYPE_LABELS,
  PLATFORM_COLORS,
  PAGE_ROUTES,
} from '@/lib/style-constants';

describe('getPlatformColor', () => {
  it('returns correct color for known platforms', () => {
    expect(getPlatformColor('weibo')).toBe('#E0534A');
    expect(getPlatformColor('zhihu')).toBe('#3B82F6');
    expect(getPlatformColor('xiaohongshu')).toBe('#F43F5E');
  });

  it('is case insensitive', () => {
    expect(getPlatformColor('Weibo')).toBe('#E0534A');
    expect(getPlatformColor('ZHIHU')).toBe('#3B82F6');
  });

  it('returns fallback color for unknown platforms', () => {
    expect(getPlatformColor('unknown')).toBe('#6366F1');
    expect(getPlatformColor('')).toBe('#6366F1');
  });
});

describe('getFilterButtonStyle', () => {
  it('returns active style when active is true', () => {
    const style = getFilterButtonStyle(true);
    expect(style.background).toBe('rgba(59,130,246,0.2)');
    expect(style.color).toBe('#93C5FD');
  });

  it('returns inactive style when active is false', () => {
    const style = getFilterButtonStyle(false);
    expect(style.color).toBe('#9CA3AF');
  });
});

describe('formatRelativeTime', () => {
  it('returns empty string for nullish input', () => {
    expect(formatRelativeTime('')).toBe('');
  });

  it('returns "刚刚" for times less than 1 minute ago', () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe('刚刚');
  });

  it('returns minutes ago for times less than 1 hour ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('5分钟前');
  });

  it('returns hours ago for times less than 24 hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe('3小时前');
  });

  it('returns days ago for times more than 24 hours ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe('2天前');
  });
});

describe('constants', () => {
  it('TYPE_EMOJIS covers all types', () => {
    expect(TYPE_EMOJIS).toHaveProperty('text');
    expect(TYPE_EMOJIS).toHaveProperty('image');
    expect(TYPE_EMOJIS).toHaveProperty('video');
  });

  it('TYPE_LABELS covers all types', () => {
    expect(TYPE_LABELS).toHaveProperty('text');
    expect(TYPE_LABELS).toHaveProperty('image');
  });

  it('PLATFORM_COLORS covers major platforms', () => {
    expect(PLATFORM_COLORS).toHaveProperty('weibo');
    expect(PLATFORM_COLORS).toHaveProperty('zhihu');
    expect(PLATFORM_COLORS).toHaveProperty('bilibili');
  });

  it('PAGE_ROUTES has all navigation targets', () => {
    expect(PAGE_ROUTES.home).toBe('/home');
    expect(PAGE_ROUTES.inspiration).toBe('/inspiration');
    expect(PAGE_ROUTES['ai-copywriting']).toBe('/ai/copywriting');
  });
});
