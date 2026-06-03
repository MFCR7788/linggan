import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { withAuth, withHandler } from '@/lib/api-handler';

// Mock dependencies
const mockUser = { id: 'user-123', email: 'test@example.com' };

vi.mock('@/lib/supabase-server', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/api-utils', () => ({
  createApiError: vi.fn((msg: string, status: number) =>
    new Response(JSON.stringify({ success: false, error: msg }), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  ),
  createUnauthorizedResponse: vi.fn(() =>
    new Response(JSON.stringify({ success: false, error: '未授权访问' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  ),
}));

import { getCurrentUser } from '@/lib/supabase-server';

function mockRequest(method = 'GET', path = '/test'): NextRequest {
  return new Request(`http://localhost${path}`, { method }) as unknown as NextRequest;
}

describe('withAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('认证成功时调用 handler 并传入 user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

    const handler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        headers: { 'content-type': 'application/json' },
      })
    );

    const wrapped = withAuth(handler);
    const res = await wrapped(mockRequest());
    const body = await res.json();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ user: mockUser })
    );
    expect(body.data.ok).toBe(true);
  });

  it('未认证返回 401', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const handler = vi.fn();
    const wrapped = withAuth(handler);
    const res = await wrapped(mockRequest());

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('handler 抛出异常时返回 500', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapped = withAuth(handler);
    const res = await wrapped(mockRequest());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('自定义 onError 处理', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

    const onError = vi.fn().mockReturnValue(
      new Response(JSON.stringify({ error: 'custom' }), { status: 418 })
    );
    const handler = vi.fn().mockRejectedValue(new Error('custom error'));
    const wrapped = withAuth(handler, { onError });
    const res = await wrapped(mockRequest());

    expect(res.status).toBe(418);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.any(Request)
    );
  });

  it('传递 params 给 handler', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

    const handler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' },
      })
    );

    const wrapped = withAuth(handler);
    await wrapped(mockRequest(), { params: { id: '42' } });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: '42' }, user: mockUser })
    );
  });
});

describe('withHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('已登录用户可获取 user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

    const handler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' },
      })
    );

    const wrapped = withHandler(handler);
    await wrapped(mockRequest());

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ user: mockUser })
    );
  });

  it('未登录也能通过（user 为 undefined）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const handler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' },
      })
    );

    const wrapped = withHandler(handler);
    const res = await wrapped(mockRequest());

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ user: undefined })
    );
  });

  it('认证抛异常时不阻止公开路由', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('auth service down'));

    const handler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' },
      })
    );

    const wrapped = withHandler(handler);
    const res = await wrapped(mockRequest());

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('handler 异常返回 500', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const handler = vi.fn().mockRejectedValue(new Error('handler error'));
    const wrapped = withHandler(handler);
    const res = await wrapped(mockRequest());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
