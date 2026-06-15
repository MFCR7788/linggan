'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';

export interface ProgressEvent {
  type: 'progress' | 'step_complete' | 'complete' | 'error';
  step?: string;
  percent?: number;
  message?: string;
  result?: unknown;
}

interface Props {
  taskId: string | null;
  onComplete?: (result: unknown) => void;
  onError?: (message: string) => void;
}

export function ProgressPanel({ taskId, onComplete, onError }: Props) {
  const [step, setStep] = useState('');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!taskId) {
      cleanup();
      return;
    }

    setStep('连接中...');
    setPercent(0);
    setError('');

    const es = new EventSource(`/api/smart-clip/stream?taskId=${taskId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        switch (data.type) {
          case 'progress':
            setStep(data.step || '');
            if (typeof data.percent === 'number') setPercent(data.percent);
            break;
          case 'complete':
            setStep('完成');
            setPercent(100);
            onCompleteRef.current?.(data.result);
            break;
          case 'error':
            setError(data.message || '处理失败');
            onErrorRef.current?.(data.message || '处理失败');
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setError('连接中断，请重试');
      es.close();
    };

    return cleanup;
  }, [taskId, cleanup]);

  if (error) {
    return (
      <GlassCard className="p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: '#EF4444' }}>✗ {error}</span>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: '#E5E7EB' }}>{step || '准备中...'}</span>
          <span className="text-xs" style={{ color: '#9CA3AF' }}>{Math.round(percent)}%</span>
        </div>
        <div className="w-full h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${percent}%`,
              background: percent >= 100
                ? 'linear-gradient(90deg, #34D399, #10B981)'
                : 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
            }}
          />
        </div>
      </div>
    </GlassCard>
  );
}
