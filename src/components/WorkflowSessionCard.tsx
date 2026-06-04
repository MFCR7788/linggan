'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { buildHandoffUrl } from '@/hooks/use-content-handoff';
import type { WorkflowSession } from '@/types';

interface Props {
  session: WorkflowSession;
  onResume: () => void;
}

/** 格式化相对时间 */
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  return `${days} 天前`;
}

export function WorkflowSessionCard({ session, onResume }: Props) {
  const router = useRouter();
  const total = session.total_steps || 4;
  const completed = (session.step_results || []).length;
  const pct = Math.round((completed / total) * 100);

  const combo = session.combo_snapshot as Record<string, unknown> | undefined;
  const emoji = (combo?.emoji as string) || '🚀';
  const steps = (combo?.steps as Array<{ label: string; entry: string }>) || [];

  const isPaused = session.status === 'paused';

  const handleResume = () => {
    onResume();
    // 导航到当前步骤
    const currentStep = steps[session.current_step_index];
    if (currentStep?.entry) {
      const url = buildHandoffUrl(currentStep.entry, session.accumulated_handoff) +
        '&workflow_session_id=' + session.id;
      router.push(url);
    }
  };

  return (
    <div
      onClick={handleResume}
      className="rounded-lg p-3 cursor-pointer transition-all hover:bg-white/[0.06]"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <div className="flex-1 min-w-0">
          <p style={{ color: '#E5E7EB', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {session.title || '创作工作流'}
          </p>
        </div>
        {isPaused && (
          <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'rgba(251,191,36,0.12)', color: '#FBBF24' }}>
            已暂停
          </span>
        )}
        <ChevronRight size={14} color="#6B7280" />
      </div>

      {/* 进度条 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: isPaused ? '#FBBF24' : 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
            }}
          />
        </div>
        <span style={{ color: '#6B7280', fontSize: 10, whiteSpace: 'nowrap' }}>
          {completed}/{total}
        </span>
      </div>

      {/* 底部信息 */}
      <div className="flex items-center justify-between mt-1">
        <span style={{ color: '#6B7280', fontSize: 10 }}>
          Step {session.current_step_index + 1} · {steps[session.current_step_index]?.label || ''}
        </span>
        <span style={{ color: '#4B5563', fontSize: 10 }}>
          {formatRelativeTime(session.updated_at)}
        </span>
      </div>
    </div>
  );
}
