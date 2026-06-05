'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, Check, X } from 'lucide-react';
import { buildHandoffUrl } from '@/lib/handoff-url';
import type { WorkflowSession } from '@/types';

interface Props {
  session: WorkflowSession;
  onResume: () => void;
  onDelete?: (id: string) => void;
  manageMode?: boolean;
  checked?: boolean;
  onToggleSelect?: (id: string) => void;
}

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

export function WorkflowSessionCard({ session, onResume, onDelete, manageMode, checked, onToggleSelect }: Props) {
  const router = useRouter();
  const total = session.total_steps || 4;
  const completed = (session.step_results || []).length;
  const currentIdx = session.current_step_index;
  const pct = Math.round((completed / total) * 100);

  const combo = session.combo_snapshot as Record<string, unknown> | undefined;
  const emoji = (combo?.emoji as string) || '🚀';
  const steps = (combo?.steps as Array<{ label: string; entry: string }>) || [];
  const isPaused = session.status === 'paused';

  const handleCardClick = () => {
    if (manageMode && onToggleSelect) {
      onToggleSelect(session.id);
      return;
    }
    onResume();
    const currentStep = steps[currentIdx];
    if (currentStep?.entry) {
      const base = buildHandoffUrl(currentStep.entry, session.accumulated_handoff);
      const url = `${base}${base.includes('?') ? '&' : '?'}workflow_session_id=${session.id}`;
      router.push(url);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className="rounded-lg p-3 transition-all hover:bg-white/[0.06] relative group"
      style={{
        background: checked ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)',
        border: checked ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.08)',
        cursor: manageMode ? 'default' : 'pointer',
      }}
    >
      {/* 标题行 */}
      <div className="flex items-center gap-2 mb-2">
        {manageMode && (
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
            style={{
              background: checked ? '#8B5CF6' : 'rgba(255,255,255,0.08)',
              border: checked ? 'none' : '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {checked && <Check size={12} color="#FFFFFF" />}
          </div>
        )}
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <p
          className="flex-1 min-w-0"
          style={{
            color: '#E5E7EB', fontSize: 13, fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {session.title || '创作工作流'}
        </p>
        {isPaused && (
          <span
            className="px-1.5 py-0.5 rounded text-[9px]"
            style={{ background: 'rgba(251,191,36,0.12)', color: '#FBBF24' }}
          >
            已暂停
          </span>
        )}
        {!manageMode && onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
            className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(239,68,68,0.08)' }}
            title="删除"
          >
            <X size={12} color="#FCA5A5" />
          </button>
        )}
        {!manageMode && <ChevronRight size={14} color="#6B7280" />}
      </div>

      {/* 步骤时间线 */}
      {steps.length > 0 && (
        <div className="flex items-start gap-0 mb-2">
          {steps.map((step, i) => {
            const isCompleted = i < completed;
            const isCurrent = i === currentIdx;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                {/* 连接线 + 圆点行 */}
                <div className="flex items-center w-full">
                  {i > 0 && (
                    <div
                      className="flex-1 h-0.5"
                      style={{
                        background: i <= completed
                          ? 'linear-gradient(90deg, #3B82F6, #8B5CF6)'
                          : 'rgba(255,255,255,0.08)',
                      }}
                    />
                  )}
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: isCompleted
                        ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)'
                        : isCurrent
                          ? 'rgba(59,130,246,0.25)'
                          : 'rgba(255,255,255,0.06)',
                      border: isCurrent && !isCompleted
                        ? '1.5px solid #3B82F6'
                        : isCompleted
                          ? 'none'
                          : '1px solid rgba(255,255,255,0.1)',
                      boxShadow: isCurrent ? '0 0 8px rgba(59,130,246,0.4)' : undefined,
                    }}
                  >
                    {isCompleted ? (
                      <Check size={10} color="#FFFFFF" />
                    ) : (
                      <span
                        style={{
                          color: isCurrent ? '#3B82F6' : '#4B5563',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {i + 1}
                      </span>
                    )}
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className="flex-1 h-0.5"
                      style={{
                        background: i < completed
                          ? 'linear-gradient(90deg, #3B82F6, #8B5CF6)'
                          : 'rgba(255,255,255,0.08)',
                      }}
                    />
                  )}
                </div>
                {/* 步骤标签 */}
                <span
                  className="text-center leading-tight"
                  style={{
                    color: isCompleted ? '#93C5FD' : isCurrent ? '#E5E7EB' : '#4B5563',
                    fontSize: 9,
                    fontWeight: isCurrent ? 600 : 400,
                    maxWidth: '100%',
                    wordBreak: 'break-all',
                  }}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 进度条 + 时间 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: isPaused ? '#FBBF24' : 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
            }}
          />
        </div>
        <span style={{ color: '#4B5563', fontSize: 10, whiteSpace: 'nowrap' }}>
          {formatRelativeTime(session.updated_at)}
        </span>
      </div>
    </div>
  );
}
