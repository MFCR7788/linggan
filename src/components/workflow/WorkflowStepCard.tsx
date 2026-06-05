'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, ChevronUp, Lock, ExternalLink, AlertCircle } from 'lucide-react';
import type { StepResult } from '@/types';
import type { LingjiEntry } from '@/lib/account-presets';

interface Props {
  stepIndex: number;
  step: { label: string; entry: LingjiEntry; paramKey?: string };
  status: 'pending' | 'active' | 'completed';
  children?: React.ReactNode;
  result?: StepResult;
}

const entryLabels: Partial<Record<LingjiEntry, string>> = {
  '/inspiration': '素材库',
  '/ai/copywriting': 'AI 文案',
  '/ai/image': 'AI 图片',
  '/ai/image-editor': 'AI 图片编辑',
  '/ai/tts': 'AI 配音',
  '/ai/video': 'AI 视频',
  '/ai/digital-human': 'AI 数字人',
  '/ai/ads': '9 宫格',
  '/hotspot': '热点选题',
  '/publish': '多平台分发',
};

export function WorkflowStepCard({ stepIndex, step, status, children, result }: Props) {
  const [expanded, setExpanded] = useState(status === 'active');
  const cardRef = useRef<HTMLDivElement>(null);
  const isPending = status === 'pending';
  const isActive = status === 'active';
  const isCompleted = status === 'completed';

  useEffect(() => {
    if (isActive) {
      setExpanded(true);
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive]);

  return (
    <div
      ref={cardRef}
      className="rounded-xl transition-all"
      style={{
        background: isActive
          ? 'rgba(139,92,246,0.06)'
          : isCompleted
            ? 'rgba(34,197,94,0.04)'
            : 'rgba(255,255,255,0.02)',
        border: isActive
          ? '1px solid rgba(139,92,246,0.25)'
          : isCompleted
            ? '1px solid rgba(34,197,94,0.15)'
            : '1px solid rgba(255,255,255,0.06)',
        opacity: isPending ? 0.5 : 1,
      }}
    >
      {/* Header */}
      <button
        onClick={() => !isPending && setExpanded(!expanded)}
        disabled={isPending}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        {/* Step number circle */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: isCompleted
              ? 'linear-gradient(135deg, #22C55E, #16A34A)'
              : isActive
                ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)'
                : 'rgba(255,255,255,0.06)',
            border: isPending ? '1px solid rgba(255,255,255,0.08)' : 'none',
          }}
        >
          {isCompleted ? (
            <Check size={14} color="#FFFFFF" />
          ) : isPending ? (
            <Lock size={12} color="#4B5563" />
          ) : (
            <span style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 700 }}>
              {stepIndex + 1}
            </span>
          )}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <p
            style={{
              color: isPending ? '#4B5563' : '#E5E7EB',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {step.label}
          </p>
          <p style={{ color: '#6B7280', fontSize: 10 }}>
            {entryLabels[step.entry] || step.entry}
            {result?.completedAt && (
              <span style={{ marginLeft: 8 }}>
                {new Date(result.completedAt).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </p>
        </div>

        {/* Status badge */}
        {isCompleted && (
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-medium"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}
          >
            完成
          </span>
        )}
        {isActive && (
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-medium"
            style={{ background: 'rgba(139,92,246,0.2)', color: '#A78BFA' }}
          >
            进行中
          </span>
        )}

        {/* Expand/collapse */}
        {!isPending && (
          expanded
            ? <ChevronUp size={14} color="#6B7280" />
            : <ChevronDown size={14} color="#6B7280" />
        )}
      </button>

      {/* Content */}
      {expanded && !isPending && (
        <div className="px-4 pb-4">
          {/* Divider */}
          <div
            className="mb-3"
            style={{ height: 1, background: 'rgba(255,255,255,0.06)' }}
          />

          {/* Step widget content */}
          <div>{children}</div>

          {/* Footer: link to full tool */}
          {!isCompleted && (
            <div className="mt-3 pt-3 flex items-center justify-end" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <a
                href={step.entry}
                target="_blank"
                className="flex items-center gap-1 text-[10px] hover:underline"
                style={{ color: '#6B7280' }}
              >
                <ExternalLink size={10} />
                在独立页面打开
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
