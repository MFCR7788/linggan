'use client';

import { CheckCircle2, ExternalLink } from 'lucide-react';
import type { WorkflowSession } from '@/types';

interface Props {
  session: WorkflowSession;
}

export function WorkflowCompletion({ session }: Props) {
  const steps: Array<{ label: string; entry: string }> =
    (session.combo_snapshot as Record<string, unknown>)?.steps as Array<{ label: string; entry: string }> || [];

  return (
    <div className="space-y-6">
      {/* Success banner */}
      <div
        className="rounded-xl p-6 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(16,185,129,0.04))',
          border: '1px solid rgba(34,197,94,0.2)',
        }}
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #22C55E, #16A34A)' }}>
          <CheckCircle2 size={32} color="#FFFFFF" />
        </div>
        <h2 style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          工作流已完成
        </h2>
        <p style={{ color: '#9CA3AF', fontSize: 13 }}>
          {session.title || '创作方案'} - 全部 {session.total_steps} 步已完成
        </p>
        {session.completed_at && (
          <p style={{ color: '#6B7280', fontSize: 11, marginTop: 4 }}>
            完成时间: {new Date(session.completed_at).toLocaleString('zh-CN')}
          </p>
        )}
      </div>

      {/* Step summary */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>步骤回顾</p>
        <div className="space-y-2">
          {steps.map((step, i) => {
            const result = session.step_results?.find((r) => r.index === i);
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(34,197,94,0.2)' }}
                >
                  <CheckCircle2 size={12} color="#4ADE80" />
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ color: '#E5E7EB', fontSize: 12, fontWeight: 600 }}>{step.label}</p>
                  {result?.completedAt && (
                    <p style={{ color: '#6B7280', fontSize: 10 }}>
                      {new Date(result.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Outputs */}
      {session.accumulated_handoff && Object.keys(session.accumulated_handoff).length > 0 && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>产出</p>
          <div className="space-y-1">
            {Object.entries(session.accumulated_handoff).map(([key, value]) => {
              if (!value) return null;
              const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('/'));
              return (
                <div key={key} className="flex items-center gap-2 text-xs" style={{ color: '#9CA3AF' }}>
                  <span style={{ color: '#6B7280' }}>{key}:</span>
                  {isUrl ? (
                    <a href={value} target="_blank" rel="noreferrer" className="flex items-center gap-1" style={{ color: '#93C5FD' }}>
                      {value.substring(0, 60)}... <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span style={{ color: '#D1D5DB' }}>{String(value).substring(0, 100)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <a
          href="/ai"
          className="flex-1 py-3 rounded-xl text-center text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF' }}
        >
          继续创作
        </a>
        <a
          href="/home"
          className="flex-1 py-3 rounded-xl text-center text-sm font-semibold"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
        >
          回到首页
        </a>
      </div>
    </div>
  );
}
