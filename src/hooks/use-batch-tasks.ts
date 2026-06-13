// 批量任务进度 hook (V2.0.1)
// SWR 风格轮询 /api/jobs/[batchId]
// 完成后自动停止轮询

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { BatchProgress } from '@/types';

interface UseBatchProgressResult {
  data: BatchProgress | null;
  error: string | null;
  isLoading: boolean;
  isPolling: boolean;
  refresh: () => Promise<void>;
  cancel: () => Promise<void>;
}

const POLL_INTERVAL_MS = 3000;

export function useBatchProgress(batchId: string | null): UseBatchProgressResult {
  const [data, setData] = useState<BatchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const stoppedRef = useRef(false);

  const fetchOnce = useCallback(async (): Promise<BatchProgress | null> => {
    if (!batchId) return null;
    try {
      const res = await fetch(`/api/jobs/${batchId}`);
      const json = await res.json();
      if (json.success) return json.data;
      setError(json.error || '查询失败');
      return null;
    } catch (e: any) {
      setError(e.message || '网络错误');
      return null;
    }
  }, [batchId]);

  const refresh = async () => {
    const d = await fetchOnce();
    if (d) setData(d);
  };

  const cancel = async () => {
    if (!batchId) return;
    try {
      await fetch(`/api/jobs/${batchId}`, { method: 'DELETE' });
      await refresh();
    } catch (e: any) {
      setError(e.message || '取消失败');
    }
  };

  useEffect(() => {
    if (!batchId) {
      setData(null);
      setIsPolling(false);
      stoppedRef.current = false;
      return;
    }

    stoppedRef.current = false;
    setIsLoading(true);
    setIsPolling(true);
    setError(null);

    const tick = async () => {
      const d = await fetchOnce();
      if (d) {
        setData(d);
        // 全部完成或失败/取消 → 停止轮询
        const allDone =
          d.total > 0 &&
          d.completed + d.failed + d.cancelled >= d.total;
        if (allDone && !stoppedRef.current) {
          stoppedRef.current = true;
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsPolling(false);
        }
      }
      setIsLoading(false);
    };

    tick();
    intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [batchId]);

  return { data, error, isLoading, isPolling, refresh, cancel };
}
