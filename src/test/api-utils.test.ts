import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPaginationParams } from '@/lib/api-utils';

describe('getPaginationParams', () => {
  it('returns default values for empty params', () => {
    const params = new URLSearchParams();
    const result = getPaginationParams(params);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('parses page and limit from params', () => {
    const params = new URLSearchParams({ page: '3', limit: '10' });
    const result = getPaginationParams(params);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(20);
  });

  it('caps limit at 100', () => {
    const params = new URLSearchParams({ limit: '999' });
    const result = getPaginationParams(params);
    expect(result.limit).toBe(100);
  });

  it('ensures minimum page is 1', () => {
    const params = new URLSearchParams({ page: '0' });
    const result = getPaginationParams(params);
    expect(result.page).toBe(1);
    expect(result.offset).toBe(0);
  });

  it('handles NaN gracefully', () => {
    const params = new URLSearchParams({ page: 'abc', limit: 'xyz' });
    const result = getPaginationParams(params);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });
});
