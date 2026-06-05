'use client';

import { useParams } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useWorkflowSession } from '@/hooks/use-workflow-session';
import { WorkflowStepCard } from '@/components/workflow/WorkflowStepCard';
import { WorkflowCompletion } from '@/components/workflow/WorkflowCompletion';
import { getStepWidget } from '@/components/workflow/StepWidgetRegistry';
import { TopNav } from '@/components/TopNav';
import { LoadingSpinner } from '@/components/loading-spinner';
import type { LingjiEntry } from '@/lib/account-presets';

interface StepDef {
  label: string;
  entry: string;
  paramKey?: string;
}

export default function WorkflowPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, isLoading, error, completeCurrentStep, isCompleting } =
    useWorkflowSession(sessionId);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A0A' }}>
        <LoadingSpinner text="加载工作流..." />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0A0A0A' }}>
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

  const handleComplete = async (data: {
    handoffData: Record<string, string>;
    outputContentId?: string;
  }) => {
    await completeCurrentStep(data.handoffData, data.outputContentId, {
      redirectOnComplete: false,
    });
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: '#0A0A0A' }}>
      <TopNav title={session.title || '工作流'} showBack onBack={() => window.history.back()} />

      <div className="px-4 pt-4">
        {/* Progress indicator */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${steps.length > 0 ? (session.current_step_index / steps.length) * 100 : 0}%`,
                background: 'linear-gradient(90deg, #8B5CF6, #6D28D9)',
              }}
            />
          </div>
          <span style={{ color: '#6B7280', fontSize: 10 }}>
            {session.current_step_index}/{steps.length}
          </span>
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
