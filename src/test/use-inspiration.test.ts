import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import { useInspiration, useInspirations, useCreateInspiration, useDeleteInspiration } from '@/hooks/use-inspiration';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useInspiration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('id 为空时 disabled', async () => {
    mockGet.mockResolvedValue({ success: true, data: null });

    const { result } = renderHook(() => useInspiration(undefined), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    // Should not have called get because it's disabled
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('有 id 时请求详情', async () => {
    const item = { id: '123', title: 'Test Inspiration', type: 'article' };
    mockGet.mockResolvedValue({ success: true, data: item });

    const { result } = renderHook(() => useInspiration('123'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(item);
    expect(mockGet).toHaveBeenCalledWith('/inspiration/123');
  });

  it('请求失败时返回 error', async () => {
    mockGet.mockResolvedValue({ success: false, error: 'Not found' });

    const { result } = renderHook(() => useInspiration('999'), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe('useInspirations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('请求列表并返回 data', async () => {
    const items = [
      { id: '1', title: 'Item 1', type: 'article' },
      { id: '2', title: 'Item 2', type: 'image' },
    ];
    mockGet.mockResolvedValue({ success: true, data: items });

    const { result } = renderHook(() => useInspirations({ page: 1, limit: 10 }), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(items);
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('page=1')
    );
  });
});

describe('useCreateInspiration', () => {
  it('调用 mutation 创建 inspiration', async () => {
    const newItem = { id: 'new-1', title: 'New Item', type: 'text' };
    mockPost.mockResolvedValue({ success: true, data: newItem });

    const { result } = renderHook(() => useCreateInspiration(), { wrapper });

    await result.current.mutateAsync({
      type: 'text',
      title: 'New Item',
      original_text: 'Hello',
    });

    expect(mockPost).toHaveBeenCalledWith('/inspiration', {
      type: 'text',
      title: 'New Item',
      original_text: 'Hello',
    });
  });
});

describe('useDeleteInspiration', () => {
  it('调用 mutation 删除', async () => {
    mockDelete.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeleteInspiration(), { wrapper });

    await result.current.mutateAsync('item-1');

    expect(mockDelete).toHaveBeenCalledWith('/inspiration/item-1');
  });
});
