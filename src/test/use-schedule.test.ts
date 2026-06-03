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

import { useSchedule, useSchedules, useCreateSchedule, useDeleteSchedule } from '@/hooks/use-schedule';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('id 为空时 disabled', async () => {
    mockGet.mockResolvedValue({ success: true, data: null });

    const { result } = renderHook(() => useSchedule(undefined), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('有 id 时请求详情', async () => {
    const schedule = { id: 's1', title: 'Meeting', status: 'pending' as const };
    mockGet.mockResolvedValue({ success: true, data: schedule });

    const { result } = renderHook(() => useSchedule('s1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(schedule);
    expect(mockGet).toHaveBeenCalledWith('/schedule/s1');
  });

  it('请求失败', async () => {
    mockGet.mockResolvedValue({ success: false, error: 'Schedule not found' });

    const { result } = renderHook(() => useSchedule('999'), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useSchedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('请求列表', async () => {
    const schedules = [
      { id: '1', title: 'Event 1', status: 'pending' },
      { id: '2', title: 'Event 2', status: 'completed' },
    ];
    mockGet.mockResolvedValue({ success: true, data: schedules });

    const { result } = renderHook(() => useSchedules({ page: 1, limit: 20 }), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(schedules);
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('page=1'));
  });

  it('带筛选条件', async () => {
    mockGet.mockResolvedValue({ success: true, data: [] });

    renderHook(
      () => useSchedules({ status: 'pending', startDate: '2026-01-01' }),
      { wrapper }
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const call = mockGet.mock.calls[0][0];
    expect(call).toContain('status=pending');
    expect(call).toContain('start_date=2026-01-01');
  });
});

describe('useCreateSchedule', () => {
  it('调用 mutation 创建日程', async () => {
    const created = { id: 'new-s', title: 'New Schedule' };
    mockPost.mockResolvedValue({ success: true, data: created });

    const { result } = renderHook(() => useCreateSchedule(), { wrapper });

    await result.current.mutateAsync({
      title: 'New Schedule',
      scheduled_at: '2026-06-15T10:00:00Z',
      description: 'Test event',
    });

    expect(mockPost).toHaveBeenCalledWith('/schedule', {
      title: 'New Schedule',
      scheduled_at: '2026-06-15T10:00:00Z',
      description: 'Test event',
    });
  });
});

describe('useDeleteSchedule', () => {
  it('调用 mutation 删除', async () => {
    mockDelete.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeleteSchedule(), { wrapper });

    await result.current.mutateAsync('schedule-1');

    expect(mockDelete).toHaveBeenCalledWith('/schedule/schedule-1');
  });
});
