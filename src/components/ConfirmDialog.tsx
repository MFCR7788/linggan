'use client';

import { X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title = '确认操作',
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full max-w-sm rounded-2xl p-5"
        style={{ background: '#1A2333', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-base font-semibold" style={{ color: '#F3F4F6' }}>{title}</h3>
          <button onClick={onCancel} style={{ color: '#9CA3AF' }}>
            <X size={18} />
          </button>
        </div>
        <p className="text-sm mb-5" style={{ color: '#D1D5DB' }}>{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#D1D5DB', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{
              background: danger ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.25)',
              color: danger ? '#FCA5A5' : '#93C5FD',
              border: `1px solid ${danger ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.35)'}`,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
