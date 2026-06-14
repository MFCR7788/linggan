import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: vi.fn(() => mockSupabase),
}));

import { InsufficientCreditsError, getBalance } from '@/lib/credits';

function chain() {
  const calls: Record<string, unknown> = {};
  const builder: Record<string, any> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => calls.single),
    maybeSingle: vi.fn(() => calls.maybeSingle),
  };
  return { builder, calls };
}

describe('InsufficientCreditsError', () => {
  it('在构造时传入 required 和 available', () => {
    const err = new InsufficientCreditsError(100, 50);
    expect(err.required).toBe(100);
    expect(err.available).toBe(50);
    expect(err.name).toBe('InsufficientCreditsError');
    expect(err instanceof Error).toBe(true);
  });
});

describe('getBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('返回已有用户余额', async () => {
    const { builder, calls } = chain();
    calls.maybeSingle = Promise.resolve({
      data: { balance: 500, tier: 'pro', lifetime_consumed: 100, lifetime_purchased: 600 },
      error: null,
    });

    mockSupabase.from.mockReturnValue(builder);

    const result = await getBalance('user-1');
    expect(result).toEqual({
      balance: 500,
      tier: 'pro',
      lifetimeConsumed: 100,
      lifetimePurchased: 600,
    });
  });

  it('无记录时 lazy init 返回默认值', async () => {
    const { builder, calls } = chain();
    // First call: maybeSingle returns null (no record)
    calls.maybeSingle = Promise.resolve({ data: null, error: null });

    // Second call: insert
    builder.insert.mockReturnValue({ select: vi.fn() });

    mockSupabase.from.mockReturnValue(builder);

    const result = await getBalance('new-user');
    expect(result).toEqual({
      balance: 0,
      tier: 'free',
      lifetimeConsumed: 0,
      lifetimePurchased: 0,
    });
    // Verify insert was called for lazy init
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'new-user', balance: 0, tier: 'free' })
    );
  });

  it('查询出错抛出异常', async () => {
    const { builder, calls } = chain();
    calls.maybeSingle = Promise.resolve({ data: null, error: new Error('db down') });
    mockSupabase.from.mockReturnValue(builder);

    await expect(getBalance('user-1')).rejects.toThrow('db down');
  });
});
