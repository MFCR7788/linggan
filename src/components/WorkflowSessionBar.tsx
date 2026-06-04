'use client';

import { Pause, Play, X } from 'lucide-react';
import type { WorkflowSession } from '@/types';

interface Props {
  session: WorkflowSession;
  onPause: () => void;
  onResume: () => void;
  onAbandon: () => void;
}

export function WorkflowSessionBar({ session, onPause, onResume, onAbandon }: Props) {
  const total = session.total_steps || 4;
  const current = session.current_step_index || 0;
  const completed = (session.step_results || []).length;
  const pct = Math.round((completed / total) * 100);

  const combo = session.combo_snapshot as Record<string, unknown> | undefined;
  const steps = (combo?.steps as Array<{ label: string }>) || [];
  const currentLabel = steps[current]?.label || '';

  const isPaused = session.status === 'paused';

  return (
    <div
      className="px-3 py-2 flex items-center gap-2 text-xs flex-shrink-0"
      style={{
        background: isPaused ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.04)',
        borderBottom: `1px solid ${isPaused ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {/* 标题 + 进度 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span style={{ color: '#E5E7EB', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {session.title || '创作工作流'}
          </span>
          {isPaused && (
            <span className="px-1 py-0.5 rounded text-[10px]" style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24' }}>
              已暂停
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 进度条 */}
          <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: isPaused ? '#FBBF24' : 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
              }}
            />
          </div>
          <span style={{ color: '#6B7280', fontSize: 10, whiteSpace: 'nowrap' }}>
            {completed}/{total} 步 · Step {current + 1} {currentLabel}
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {isPaused ? (
          <button
            onClick={onResume}
            className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px]"
            style={{ background: 'rgba(34,197,94,0.12)', color: '#86EFAC', border: '1px solid rgba(34,197,94,0.25)' }}
          >
            <Play size={10} /> 继续
          </button>
        ) : (
          <button
            onClick={onPause}
            className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px]"
            style={{ background: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.2)' }}
          >
            <Pause size={10} /> 暂停
          </button>
        )}
        <button
          onClick={onAbandon}
          className="p-1 rounded"
          style={{ color: '#6B7280' }}
          title="放弃此工作流"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
