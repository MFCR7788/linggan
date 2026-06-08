'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Zap, Loader2, Download, Save, Trash2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Toast } from '@/components/Toast';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { ProtectedRoute } from '@/components';
import { BatchProgressCard } from '@/components/BatchProgressCard';
import { useBatchProgress } from '@/hooks/use-batch-tasks';
import { IMAGE_PRESETS, findImagePreset } from '@/lib/preset-templates';

function BatchImageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialBatchId = searchParams.get('batchId');

  // ─── 表单 state ──────────────────────────────
  const [promptsText, setPromptsText] = useState('');
  const [presetId, setPresetId] = useState('xiaohongshu');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(initialBatchId);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 进度
  const { data: progress, isPolling } = useBatchProgress(batchId);

  // 解析输入
  const lines = promptsText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const itemCount = lines.length;

  const preset = findImagePreset(presetId);
  const estimatedSeconds = itemCount * 12;

  // ─── 提交 ──────────────────────────────
  const handleSubmit = async () => {
    if (itemCount === 0) {
      setToast({ message: '请至少输入 1 个 prompt', type: 'error' });
      return;
    }
    if (itemCount > 50) {
      setToast({ message: '单批最多 50 个, 请分批提交', type: 'error' });
      return;
    }
    if (isPolling) {
      setToast({ message: '上一批还在跑, 请等待完成', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const items = lines.map((prompt) => ({
        prompt,
        params: {
          ratio: preset?.ratio || '1:1',
          presetId,
          style: preset?.style,
          paletteId: preset?.palette,
        },
      }));
      const res = await fetch('/api/ai/image/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, priority: 5 }),
      });
      const json = await res.json();
      if (json.success) {
        setBatchId(json.data.batchId);
        setToast({ message: `已提交 ${itemCount} 个任务, 开始生成...`, type: 'success' });
      } else {
        setToast({ message: json.error || '提交失败', type: 'error' });
      }
    } catch (e: any) {
      setToast({ message: e.message || '网络错误', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── 全部存灵感库（实际批量任务已自动写入） ──────────
  const handleDownloadAll = async () => {
    if (!progress) return;
    const completedTasks = progress.tasks.filter((t) => t.status === 'completed');
    for (const t of completedTasks) {
      const out = (t.output as any) || {};
      const url = out.imageUrl || out.imageUrls?.[0];
      if (url) {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const dlUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = dlUrl;
          a.download = `lingji-batch-${t.id.slice(0, 8)}-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(dlUrl);
        } catch (e) {
          console.error('下载失败', e);
        }
      }
    }
    setToast({ message: `已下载 ${completedTasks.length} 张`, type: 'success' });
  };

  const handleClear = async () => {
    if (!batchId) {
      setPromptsText('');
      return;
    }
    if (!confirm('确定要取消当前批次所有任务并清空输入吗?')) return;
    try {
      await fetch(`/api/jobs/${batchId}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
    }
    setBatchId(null);
    setPromptsText('');
  };

  // ─── 快捷导航 ──────────────────────────────
  const handleNavigate = (page: PageKey) => {
    const map: Partial<Record<PageKey, string>> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(map[page] || '/home');
  };

  return (
    <div className="flex flex-col min-h-screen pb-20 overflow-x-hidden">
      <TopNav title="批量生图" showBack onBack={() => router.push('/ai/image')} />

      <div className="flex-1 px-4 pt-4 space-y-4 min-w-0">
        {/* 顶部说明 */}
        <GlassCard className="!p-3">
          <div className="flex items-start gap-2">
            <Zap size={16} color="#3B82F6" />
            <div className="flex-1">
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>AI 批量生图</p>
              <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.5, marginTop: 2 }}>
                一次提交最多 50 个 prompt,自动并发生成。适合电商主图、课程配图、朋友圈素材。
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Step 1: 输入 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <span style={{ color: '#3B82F6' }}>Step 1</span> · 输入 prompt(每行一个)
          </p>
          <textarea
            value={promptsText}
            onChange={(e) => setPromptsText(e.target.value)}
            placeholder={`例:\n轻盈婴儿推车,白色车身,阳光下的公园小径\n简约现代沙发,客厅场景,米白色\n夏日连衣裙,雪纺面料,海边街拍`}
            disabled={!!batchId && isPolling}
            className="w-full p-2.5 rounded-lg text-sm resize-none custom-scrollbar"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#E5E7EB',
              minHeight: 140,
              maxHeight: 280,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: 12,
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <p style={{ color: '#9CA3AF', fontSize: 11 }}>
              {itemCount > 0 ? `已输入 ${itemCount} 行` : '尚未输入'}
              {itemCount > 0 && (
                <span style={{ color: '#6B7280', marginLeft: 8 }}>· 预计 {Math.ceil(estimatedSeconds / 60)} 分钟</span>
              )}
            </p>
            <button
              onClick={() => setPromptsText('')}
              disabled={!promptsText}
              className="text-[10px] flex items-center gap-1"
              style={{ color: '#9CA3AF' }}
            >
              <Trash2 size={10} /> 清空
            </button>
          </div>
        </GlassCard>

        {/* Step 2: 模板 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <span style={{ color: '#8B5CF6' }}>Step 2</span> · 选择预设(联动比例/风格/色调)
          </p>
          <div className="grid grid-cols-4 gap-2">
            {IMAGE_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPresetId(p.id)}
                disabled={!!batchId && isPolling}
                className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all"
                style={{
                  background: presetId === p.id ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
                  border: presetId === p.id ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <span style={{ fontSize: 20 }}>{p.emoji}</span>
                <span style={{ color: presetId === p.id ? '#C4B5FD' : '#E5E7EB', fontSize: 10, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{p.label}</span>
                <span style={{ color: '#9CA3AF', fontSize: 9 }}>{p.ratio}</span>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* 提交 */}
        <div className="flex gap-2">
          <PrimaryButton
            fullWidth
            size="lg"
            onClick={handleSubmit}
            disabled={isSubmitting || itemCount === 0 || (!!batchId && isPolling)}
          >
            {isSubmitting ? (
              <><Loader2 size={16} className="animate-spin" /> 提交中...</>
            ) : isPolling ? (
              <><Loader2 size={16} className="animate-spin" /> 生成中 {progress?.percent || 0}%</>
            ) : (
              <><Zap size={16} /> 批量生成 {itemCount > 0 ? `(${itemCount})` : ''}</>
            )}
          </PrimaryButton>
          {(batchId || promptsText) && (
            <button
              onClick={handleClear}
              className="px-3 py-2 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
              title="清空"
            >
              <X size={16} color="#FCA5A5" />
            </button>
          )}
        </div>

        {/* 进度区 */}
        {batchId && progress && (
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>
                📊 进度 ({progress.completed}/{progress.total})
              </p>
              <p style={{ color: isPolling ? '#3B82F6' : '#22C55E', fontSize: 11, fontWeight: 600 }}>
                {isPolling ? '生成中...' : '已完成'}
              </p>
            </div>

            {/* 总览条 */}
            <div className="grid grid-cols-4 gap-2 mb-3 text-center">
              <div className="p-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)' }}>
                <p style={{ color: '#22C55E', fontSize: 16, fontWeight: 700 }}>{progress.completed}</p>
                <p style={{ color: '#9CA3AF', fontSize: 10 }}>已完成</p>
              </div>
              <div className="p-2 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)' }}>
                <p style={{ color: '#3B82F6', fontSize: 16, fontWeight: 700 }}>{progress.processing}</p>
                <p style={{ color: '#9CA3AF', fontSize: 10 }}>生成中</p>
              </div>
              <div className="p-2 rounded-lg" style={{ background: 'rgba(156,163,175,0.1)' }}>
                <p style={{ color: '#9CA3AF', fontSize: 16, fontWeight: 700 }}>{progress.pending}</p>
                <p style={{ color: '#9CA3AF', fontSize: 10 }}>等待</p>
              </div>
              <div className="p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <p style={{ color: '#EF4444', fontSize: 16, fontWeight: 700 }}>{progress.failed + progress.cancelled}</p>
                <p style={{ color: '#9CA3AF', fontSize: 10 }}>失败</p>
              </div>
            </div>

            {/* 总进度条 */}
            <div
              className="h-2 rounded-full overflow-hidden mb-4"
              style={{ background: 'rgba(255,255,255,0.1)' }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${progress.percent}%`,
                  background: 'linear-gradient(90deg, #22C55E, #3B82F6, #8B5CF6)',
                }}
              />
            </div>

            {/* 任务网格 */}
            <div className="grid grid-cols-3 gap-2">
              {progress.tasks.map((task, i) => (
                <BatchProgressCard
                  key={task.id}
                  task={task}
                  index={i}
                  onDownload={(url) => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `lingji-${i + 1}.png`;
                    a.target = '_blank';
                    a.click();
                  }}
                />
              ))}
            </div>

            {/* 完成后操作栏 */}
            {!isPolling && progress.completed > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs"
                  style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#93C5FD' }}
                >
                  <Download size={14} /> 全部下载 ({progress.completed})
                </button>
                <button
                  onClick={() => setToast({ message: '批量图片已生成', type: 'success' })}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#86EFAC' }}
                >
                  <CheckCircle2 size={14} /> 已完成 ({progress.completed})
                </button>
              </div>
            )}

            {progress.failed > 0 && (
              <div className="mt-3 p-2.5 rounded-lg flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertCircle size={14} color="#FCA5A5" />
                <p style={{ color: '#FCA5A5', fontSize: 11, lineHeight: 1.5 }}>
                  {progress.failed} 个任务失败,已自动重试 3 次。可点卡片「重试」按钮再试。
                </p>
              </div>
            )}
          </GlassCard>
        )}
      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function BatchImagePage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p style={{ color: '#9CA3AF' }}>加载中...</p></div>}>
        <BatchImageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
