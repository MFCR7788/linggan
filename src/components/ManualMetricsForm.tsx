'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, BarChart3, Plus } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { PrimaryButton } from './PrimaryButton';
import { Toast } from './Toast';
import { apiClient } from '@/lib/api-client';

interface Props {
  publicationId: string;
  platformName: string;
  onSaved?: () => void;
  compact?: boolean;
}

export function ManualMetricsForm({ publicationId, platformName, onSaved, compact }: Props) {
  const [views, setViews] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');
  const [shares, setShares] = useState('');
  const [collects, setCollects] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiClient.post<{ success: boolean; error?: string }>(
        '/platforms/metrics-manual',
        {
          publicationId,
          views: views ? Number(views) : null,
          likes: likes ? Number(likes) : null,
          comments: comments ? Number(comments) : null,
          shares: shares ? Number(shares) : null,
          collects: collects ? Number(collects) : null,
          notes: notes || null,
        }
      );
      if (res.success) {
        setToast({ message: '已保存', type: 'success' });
        setViews(''); setLikes(''); setComments(''); setShares(''); setCollects(''); setNotes('');
        onSaved?.();
      } else {
        setToast({ message: res.error || '保存失败', type: 'error' });
      }
    } catch (e: any) {
      setToast({ message: e.message || '网络错误', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassCard className={compact ? '!p-3' : ''}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={16} color="#06B6D4" />
        <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>
          录入「{platformName}」数据
        </p>
        <span style={{ color: '#6B7280', fontSize: 10 }}>(手动)</span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="阅读" value={views} onChange={setViews} />
          <NumberField label="点赞" value={likes} onChange={setLikes} />
          <NumberField label="评论" value={comments} onChange={setComments} />
          <NumberField label="转发" value={shares} onChange={setShares} />
          <NumberField label="收藏" value={collects} onChange={setCollects} />
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="备注(选填, 如「爆款/被限流」)"
          maxLength={100}
          className="w-full px-3 py-2 rounded-lg text-xs bg-transparent outline-none"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#E5E7EB',
          }}
        />
        <PrimaryButton
          type="submit"
          size="sm"
          fullWidth
          disabled={submitting}
        >
          {submitting ? (
            <><Loader2 size={12} className="animate-spin" /> 保存中...</>
          ) : (
            <><CheckCircle2 size={12} /> 保存数据</>
          )}
        </PrimaryButton>
      </form>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </GlassCard>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ color: '#9CA3AF', fontSize: 10, display: 'block', marginBottom: 2 }}>{label}</label>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        placeholder="0"
        min="0"
        className="w-full px-2 py-1.5 rounded-md text-xs bg-transparent outline-none"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#FFFFFF',
        }}
      />
    </div>
  );
}
