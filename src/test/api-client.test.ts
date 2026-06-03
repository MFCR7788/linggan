import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dev-auth before importing the module under test
vi.mock('@/lib/dev-auth', () => ({
  syncDevAuthCookie: vi.fn(),
  getDevUserIdHeader: vi.fn(() => ({ 'x-dev-user-id': 'dev-user-1' })),
}));

describe('ApiClient', () => {
  let apiClient: { get: <T>(url: string) => Promise<{ success: boolean; error?: string; data?: T }>; post: <T>(url: string, data?: unknown) => Promise<{ success: boolean; error?: string; data?: T }>; put: <T>(url: string, data?: unknown) => Promise<{ success: boolean; error?: string; data?: T }>; patch: <T>(url: string, data?: unknown) => Promise<{ success: boolean; error?: string; data?: T }>; delete: <T>(url: string) => Promise<{ success: boolean; error?: string; data?: T }> };

  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
    // Re-import to get fresh instance
    const mod = await import('@/lib/api-client');
    apiClient = mod.apiClient;
  });

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
  });

  describe('GET 请求', () => {
    it('成功返回 data', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: 1, name: 'test' } }), {
          headers: { 'content-type': 'application/json' },
        })
      );

      const result = await apiClient.get<{ id: number; name: string }>('/test');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1, name: 'test' });
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({ method: 'GET' }));
    });

    it('API 返回错误', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: 'Not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      );

      const result = await apiClient.get('/missing');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not found');
    });

    it('网络错误', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await apiClient.get('/test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('POST 请求', () => {
    it('发送 JSON body', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { created: true } }), {
          headers: { 'content-type': 'application/json' },
        })
      );

      const result = await apiClient.post('/create', { name: 'new-item' });
      expect(result.success).toBe(true);
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/create');
      expect(JSON.parse(call[1].body)).toEqual({ name: 'new-item' });
    });

    it('无 body 的 POST', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          headers: { 'content-type': 'application/json' },
        })
      );

      const result = await apiClient.post('/action');
      expect(result.success).toBe(true);
      const call = mockFetch.mock.calls[0];
      expect(call[1].body).toBeUndefined();
    });
  });

  describe('PUT 请求', () => {
    it('发送更新数据', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { updated: true } }), {
          headers: { 'content-type': 'application/json' },
        })
      );

      const result = await apiClient.put('/update/1', { name: 'updated' });
      expect(result.success).toBe(true);
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });
  });

  describe('DELETE 请求', () => {
    it('发送删除请求', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          headers: { 'content-type': 'application/json' },
        })
      );

      const result = await apiClient.delete('/resource/1');
      expect(result.success).toBe(true);
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('PATCH 请求', () => {
    it('发送部分更新', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          headers: { 'content-type': 'application/json' },
        })
      );

      const result = await apiClient.patch('/resource/1', { field: 'value' });
      expect(result.success).toBe(true);
      expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    });
  });
});
