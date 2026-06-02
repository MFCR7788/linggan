// 批量任务单卡 (V2.0.1)
// 显示单张图的进度 + 缩略图 + 状态

'use client';

import { Check, X, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import type { AiTask } from '@/types';

interface BatchProgressCardProps {
  task: AiTask;
  index: number;
  onRetry?: (taskId: string) => void;
  onDownload?: (imageUrl: string) => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  pending: { label: '等待中', color: '#9CA3AF', emoji: '⏳' },
  processing: { label: '生成中', color: '#3B82F6', emoji: '🔄' },
  completed: { label: '已完成', color: '#22C55E', emoji: '✅' },
  failed: { label: '失败', color: '#EF4444', emoji: '❌' },
  cancelled: { label: '已取消', color: '#6B7280', emoji: '🚫' },
};

export function BatchProgressCard({ task, index, onRetry, onDownload }: BatchProgressCardProps) {
  const statusKey = task.status as keyof typeof STATUS_LABELS;
  const status = STATUS_LABELS[statusKey] || STATUS_LABELS.pending;
  const input = (task.input as any) || {};
  const output = (task.output as any) || {};
  const imageUrl = output.imageUrl || output.imageUrls?.[0];

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* 缩略图 / 状态区 */}
      <div
        className="relative aspect-square flex items-center justify-center"
        style={{
          background:
            task.status === 'failed' ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.06)',
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={input.prompt?.substring(0, 30) || `任务 ${index + 1}`}
            className="w-full h-full object-cover cursor-pointer"
            loading="lazy"
          />
        ) : task.status === 'failed' ? (
          <div className="flex flex-col items-center gap-2 px-3 text-center">
            <AlertCircle size={28} color="#EF4444" />
            <p style={{ color: '#FCA5A5', fontSize: 10, lineHeight: 1.4 }}>
              {task.error_code || '生成失败'}
            </p>
          </div>
        ) : task.status === 'processing' ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={28} color="#3B82F6" className="animate-spin" />
            <p style={{ color: '#93C5FD', fontSize: 11, fontWeight: 600 }}>{task.progress || 0}%</p>
          </div>
        ) : task.status === 'cancelled' ? (
          <X size={28} color="#6B7280" />
        ) : task.status === 'pending' ? (
          <div className="flex flex-col items-center gap-1">
            <span style={{ fontSize: 28 }}>⏳</span>
            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600 }}>等待中</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <span style={{ fontSize: 28 }}>{status.emoji}</span>
            <p style={{ color: status.color, fontSize: 11, fontWeight: 600 }}>{status.label}</p>
          </div>
        )}

        {/* 编号 */}
        <div
          className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold"
          style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}
        >
          #{index + 1}
        </div>

        {/* 完成时下载按钮 */}
        {imageUrl && onDownload && (
          <button
            onClick={() => onDownload(imageUrl)}
            className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            title="下载"
          >
            <span style={{ color: '#fff', fontSize: 10 }}>⬇</span>
          </button>
        )}

        {/* 失败时重试按钮 */}
        {task.status === 'failed' && onRetry && (
          <button
            onClick={() => onRetry(task.id)}
            className="absolute bottom-1.5 right-1.5 px-2 py-1 rounded-md text-[10px] flex items-center gap-1"
            style={{ background: 'rgba(239,68,68,0.25)', color: '#FCA5A5' }}
            title="重试"
          >
            <RotateCcw size={10} /> 重试
          </button>
        )}
      </div>

      {/* 进度条（仅 processing） */}
      {task.status === 'processing' && (
        <div className="px-2 py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${task.progress || 0}%`,
                background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
              }}
            />
          </div>
        </div>
      )}

      {/* 标题 */}
      <div className="px-2 py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <p style={{ color: '#E5E7EB', fontSize: 10, lineHeight: 1.3 }} className="line-clamp-2">
          {input.prompt || '...'}
        </p>
      </div>
    </div>
  );
}
