'use client';

import { useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, ArrowLeft, Zap } from 'lucide-react';
import { useWorkflowSession } from '@/hooks/use-workflow-session';
import { WorkflowStepCard } from '@/components/workflow/WorkflowStepCard';
import { WorkflowCompletion } from '@/components/workflow/WorkflowCompletion';
import { getStepWidget } from '@/components/workflow/StepWidgetRegistry';
import { TopNav } from '@/components/TopNav';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoadingSpinner } from '@/components/loading-spinner';
import type { LingjiEntry } from '@/lib/account-presets';
import { getStepRole } from '@/lib/account-presets';

interface StepDef {
  label: string;
  entry: string;
  paramKey?: string;
  role?: string;
}

function WorkflowPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, isLoading, error, completeCurrentStep, isCompleting } =
    useWorkflowSession(sessionId);
  const [autoMode, setAutoMode] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const autoErrorRef = useRef<string | null>(null);

  const handleComplete = useCallback(async (data: {
    handoffData: Record<string, string>;
    outputContentId?: string;
  }) => {
    await completeCurrentStep(data.handoffData, data.outputContentId, {
      redirectOnComplete: false,
    });
  }, [completeCurrentStep]);

  const handleAutoError = useCallback((error: string) => {
    autoErrorRef.current = error;
    setAutoPaused(true);
  }, []);

  const resumeAuto = useCallback(() => {
    autoErrorRef.current = null;
    setAutoPaused(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0A0A0A' }}>
        <img src="/brand/logo-mark.png" alt="灵集" className="w-12 h-12 opacity-40" />
        <LoadingSpinner text="加载工作流..." />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0A0A0A' }}>
        <img src="/brand/logo-mark.png" alt="灵集" className="w-10 h-10 mb-2 opacity-40" />
        <p style={{ color: '#FCA5A5', fontSize: 14 }}>会话不存在或已过期</p>
        <a href="/ai" style={{ color: '#93C5FD', fontSize: 13 }}>返回 AI 创作中心</a>
      </div>
    );
  }

  const steps: StepDef[] =
    (session.combo_snapshot as Record<string, unknown>)?.steps as StepDef[] || [];

  const allCompleted =
    steps.length > 0 &&
    session.status === 'completed';

  if (allCompleted) {
    return (
      <div className="min-h-screen" style={{ background: '#0A0A0A' }}>
        <TopNav title={session.title || '工作流'} showBack onBack={() => window.history.back()} />
        <div className="px-4 pt-4 pb-20">
          <WorkflowCompletion session={session} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: '#0A0A0A' }}>
      <TopNav title={session.title || '工作流'} showBack onBack={() => window.history.back()} />

      <div className="px-4 pt-4">
        {/* Mode toggle + Progress */}
        <div className="mb-4 space-y-3">
          {/* Segmented control */}
          <div className="flex rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => { setAutoMode(false); setAutoPaused(false); }}
              className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: !autoMode ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: !autoMode ? '#FFFFFF' : '#6B7280',
              }}
            >
              手动一步步
            </button>
            <button
              onClick={() => { setAutoMode(true); setAutoPaused(false); }}
              className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1"
              style={{
                background: autoMode ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : 'transparent',
                color: autoMode ? '#FFFFFF' : '#6B7280',
              }}
            >
              <Zap size={12} /> 一键自动
            </button>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${steps.length > 0 ? (session.current_step_index / steps.length) * 100 : 0}%`,
                  background: autoMode ? 'linear-gradient(90deg, #8B5CF6, #A78BFA)' : 'linear-gradient(90deg, #8B5CF6, #6D28D9)',
                }}
              />
            </div>
            <span style={{ color: '#6B7280', fontSize: 10 }}>
              {session.current_step_index}/{steps.length}
            </span>
          </div>

          {/* Auto-execution paused banner */}
          {autoMode && autoPaused && (
            <div
              className="p-3 rounded-lg flex items-center justify-between"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <div>
                <p style={{ color: '#FCA5A5', fontSize: 12, fontWeight: 600 }}>自动执行暂停</p>
                <p style={{ color: '#F87171', fontSize: 11 }}>
                  {autoErrorRef.current || '步骤执行失败，请手动继续'}
                </p>
              </div>
              <button
                onClick={resumeAuto}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#FCA5A5' }}
              >
                重试
              </button>
            </div>
          )}

          {/* Auto mode active indicator */}
          {autoMode && !autoPaused && (
            <div className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" color="#A78BFA" />
              <span style={{ color: '#A78BFA', fontSize: 11 }}>自动执行中，请勿离开页面...</span>
            </div>
          )}
        </div>

        {/* Step cards */}
        <div className="space-y-3">
          {steps.map((step, i) => {
            const Widget = getStepWidget(step.entry);
            const isCompleted = session.step_results?.some((r) => r.index === i);
            const isActive = session.current_step_index === i && session.status === 'active';
            const status = isCompleted ? 'completed' as const : isActive ? 'active' as const : 'pending' as const;

            return (
              <WorkflowStepCard
                key={i}
                stepIndex={i}
                step={{ label: step.label, entry: step.entry as LingjiEntry, paramKey: step.paramKey }}
                status={status}
                result={session.step_results?.find((r) => r.index === i)}
              >
                {Widget ? (
                  <Widget
                    session={session}
                    handoff={session.accumulated_handoff || {}}
                    onComplete={handleComplete}
                    isCompleting={isCompleting}
                    autoExecute={autoMode && !autoPaused}
                    onAutoError={handleAutoError}
                    role={getStepRole(step.entry, step.role)}
                  />
                ) : (
                  <p style={{ color: '#6B7280', fontSize: 11 }}>
                    未知步骤类型: {step.entry}
                  </p>
                )}
              </WorkflowStepCard>
            );
          })}
        </div>

        {/* Pause / Abandon buttons */}
        {session.status === 'active' && (
          <div className="mt-6 flex gap-2 justify-center">
            <button
              onClick={async () => {
                await fetch(`/api/workflow/sessions/${sessionId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'abandoned' }),
                });
                window.location.reload();
              }}
              className="px-4 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}
            >
              放弃此工作流
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkflowPageWrapper() {
  return (
    <ProtectedRoute>
      <WorkflowPage />
    </ProtectedRoute>
  );
}
