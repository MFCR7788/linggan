'use client';

// 全局"内容流水线"组件 — 显示用户当前在内容创作 6 步的哪一步
// 6 步:inspiration(灵感) → copywriting(文案) → image(图片) → digital-human(数字人) → video(视频) → publish(分发)
// 通过 usePathname 判断当前所在页面,自动高亮对应步骤
// 已完成步骤(用户最近有过活动)标绿,下一步加 ⭐

import { usePathname } from 'next/navigation';
import {
  Lightbulb, FileText, Image as ImageIcon, Mic, Video as ImageVideo, Send, Check,
} from 'lucide-react';

interface Step {
  id: 'inspiration' | 'copywriting' | 'image' | 'digital-human' | 'video' | 'publish';
  label: string;
  path: string;
  icon: React.ComponentType<any>;
}

// 6 步定义(路径匹配规则从长到短,避免误匹配)
const STEPS: Step[] = [
  { id: 'inspiration', label: '灵感', path: '/inspiration', icon: Lightbulb },
  { id: 'copywriting', label: '文案', path: '/ai/copywriting', icon: FileText },
  { id: 'image', label: '图片', path: '/ai/image', icon: ImageIcon },
  { id: 'digital-human', label: '数字人', path: '/ai/digital-human', icon: Mic },
  { id: 'video', label: '视频', path: '/ai/video', icon: ImageVideo },
  { id: 'publish', label: '分发', path: '/publish', icon: Send },
];

/** 根据当前路径推断 step index */
function detectStep(pathname: string | null): number {
  if (!pathname) return -1;
  if (pathname.startsWith('/inspiration')) return 0;
  if (pathname.startsWith('/ai/copywriting') || pathname.startsWith('/ai/ads')) return 1; // ads 归到文案后
  if (pathname.startsWith('/ai/image')) return 2;
  if (pathname.startsWith('/ai/digital-human') || pathname.startsWith('/ai/tts')) return 3; // tts 归到数字人前
  if (pathname.startsWith('/ai/video')) return 4;
  if (pathname.startsWith('/publish') || pathname.startsWith('/insights')) return 5;
  return -1;
}

interface WorkflowStepperProps {
  /** 已完成步骤(0-based index 列表,来自用户活动历史 / 灵感库条目数 / 视频数等) */
  completed?: number[];
  /** 紧凑模式(用于 /ai 顶部一行展示) */
  compact?: boolean;
  /** 会话步骤标签（传入时使用会话数据，否则用 URL 推断） */
  sessionSteps?: { label: string }[];
  /** 会话当前步骤索引 */
  currentStepIndex?: number;
  /** 会话已完成步骤索引 */
  completedSteps?: number[];
}

export function WorkflowStepper({ completed = [], compact = false, sessionSteps, currentStepIndex, completedSteps }: WorkflowStepperProps) {
  const pathname = usePathname();
  const urlIdx = detectStep(pathname);

  // 会话模式：使用传入的步骤数据
  const steps = sessionSteps
    ? sessionSteps.map((s, i) => ({
        id: `step-${i}` as Step['id'],
        label: s.label,
        path: '',
        icon: () => null,
      }))
    : STEPS;

  const currentIdx = sessionSteps ? (currentStepIndex ?? 0) : urlIdx;
  const doneSet = new Set(completedSteps ?? completed);

  if (compact) {
    // 紧凑模式:单行圆点 + 标签
    return (
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((step, i) => {
          const isCurrent = i === currentIdx;
          const isDone = doneSet.has(i) && i !== currentIdx;
          const isNext = i === currentIdx + 1;
          const Icon = step.icon;
          return (
            <div key={step.id} className="flex items-center flex-shrink-0">
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                style={{
                  background: isCurrent
                    ? 'linear-gradient(135deg, rgba(244,114,182,0.25), rgba(139,92,246,0.25))'
                    : isDone
                    ? 'rgba(34,197,94,0.12)'
                    : 'rgba(255,255,255,0.04)',
                  border: isCurrent
                    ? '1px solid rgba(244,114,182,0.5)'
                    : isDone
                    ? '1px solid rgba(34,197,94,0.3)'
                    : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {isDone ? (
                  <Check size={12} color="#22C55E" />
                ) : (
                  <Icon size={12} color={isCurrent ? '#F9A8D4' : isNext ? '#FBBF24' : '#6B7280'} />
                )}
                <span
                  style={{
                    color: isCurrent ? '#F9A8D4' : isDone ? '#22C55E' : isNext ? '#FBBF24' : '#9CA3AF',
                    fontSize: 11,
                    fontWeight: isCurrent || isNext ? 600 : 400,
                  }}
                >
                  {step.label}
                </span>
                {isNext && <span style={{ fontSize: 10, color: '#FBBF24' }}>⭐</span>}
              </div>
              {i < steps.length - 1 && (
                <div
                  className="w-3 h-px mx-0.5"
                  style={{ background: isDone ? '#22C55E' : 'rgba(255,255,255,0.1)' }}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 完整模式:横向 stepper(更详细的展示)
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {STEPS.map((step, i) => {
        const isCurrent = i === currentIdx;
        const isDone = completed.includes(i) && i !== currentIdx;
        const isNext = i === currentIdx + 1;
        const Icon = step.icon;
        return (
          <div key={step.id} className="flex items-center flex-shrink-0">
            <div
              className="flex flex-col items-center gap-1 px-2.5 py-2 rounded-2xl min-w-[60px]"
              style={{
                background: isCurrent
                  ? 'linear-gradient(135deg, rgba(244,114,182,0.2), rgba(139,92,246,0.2))'
                  : isDone
                  ? 'rgba(34,197,94,0.1)'
                  : 'rgba(255,255,255,0.04)',
                border: isCurrent
                  ? '1px solid rgba(244,114,182,0.5)'
                  : isDone
                  ? '1px solid rgba(34,197,94,0.3)'
                  : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {isDone ? (
                <Check size={16} color="#22C55E" />
              ) : (
                <Icon size={16} color={isCurrent ? '#F9A8D4' : isNext ? '#FBBF24' : '#6B7280'} />
              )}
              <span
                style={{
                  color: isCurrent ? '#F9A8D4' : isDone ? '#22C55E' : isNext ? '#FBBF24' : '#9CA3AF',
                  fontSize: 11,
                  fontWeight: isCurrent || isNext ? 600 : 400,
                }}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="w-4 h-px"
                style={{ background: isDone ? '#22C55E' : 'rgba(255,255,255,0.1)' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default WorkflowStepper;
