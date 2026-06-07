'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, Loader2, Download, Sparkles, AlertCircle, CheckCircle2, X, Plus, Trash2, Copy } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Toast } from '@/components/Toast';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { ProtectedRoute } from '@/components';
import { useContentHandoff } from '@/hooks/use-content-handoff';
import { useWorkflowSession } from '@/hooks/use-workflow-session';
import { WorkflowSessionBar } from '@/components/WorkflowSessionBar';
import { useAdsGrid, type GridCell } from '@/hooks/ai/use-ads-grid';
import { useWorkHistory } from '@/hooks/use-work-history';

const DEMO_SELLING_POINTS = ['轻便折叠', '避震舒适', '时尚颜值'];

function AdsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { receive } = useContentHandoff();
  const workflowSessionId = searchParams.get('workflow_session_id') || undefined;
  const { session, isInWorkflow, completeCurrentStep, pauseSession, resumeSession, abandonSession } = useWorkflowSession(workflowSessionId);

  // ─── 表单 state ──────────────────────────────
  const [product, setProduct] = useState('');
  const [sellingPoints, setSellingPoints] = useState<string[]>([...DEMO_SELLING_POINTS]);
  const [referenceImage, setReferenceImage] = useState<string>('');

  // 接收 handoff（从生图页带过来）
  useEffect(() => {
    const params = receive(['prompt', 'imageUrl', 'topic', 'text']);
    if (params.prompt) {
      setProduct(params.prompt.substring(0, 30));
    }
    if (params.topic && !params.prompt) {
      setProduct(params.topic.substring(0, 30));
    }
    if (params.text) {
      setProduct(params.text.substring(0, 30));
    }
    if (params.imageUrl) {
      setReferenceImage(params.imageUrl);
    }
  }, []);

  // 工作流：从 session.accumulated_handoff 预填
  useEffect(() => {
    if (!session?.accumulated_handoff) return;
    const h = session.accumulated_handoff as Record<string, string>;
    if (h.topic) setProduct(h.topic.substring(0, 30));
    else if (h.text) setProduct(h.text.substring(0, 30));
    if (h.imageUrl) setReferenceImage(h.imageUrl);
  }, [session]);

  // ─── 生成 state ──────────────────────────────
  const { generate: generateAds, generating: isGenerating, cells: adsCells, error: adsError } = useAdsGrid();
  const [cells, setCells] = useState<GridCell[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [progressText, setProgressText] = useState('');
  const [jszipLoaded, setJszipLoaded] = useState(false);

  // ─── 历史生成 ──────────────────────────────
  const { items: historyItems, isLoading: historyLoading } = useWorkHistory('图片');

  // 动态加载 JSZip（CDN）
  useEffect(() => {
    if ((window as any).JSZip) {
      setJszipLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js';
    script.async = true;
    script.onload = () => setJszipLoaded(true);
    script.onerror = () => console.error('JSZip 加载失败');
    document.body.appendChild(script);
  }, []);

  // ─── 卖点编辑 ──────────────────────────────
  const updateSellingPoint = (i: number, v: string) => {
    setSellingPoints((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  };

  const addSellingPoint = () => {
    if (sellingPoints.length >= 5) {
      setToast({ message: '最多 5 个卖点', type: 'error' });
      return;
    }
    setSellingPoints((prev) => [...prev, '']);
  };

  const removeSellingPoint = (i: number) => {
    if (sellingPoints.length <= 3) {
      setToast({ message: '至少 3 个卖点', type: 'error' });
      return;
    }
    setSellingPoints((prev) => prev.filter((_, idx) => idx !== i));
  };

  // ─── 生成 9 宫格 ──────────────────────────────
  const handleGenerate = async () => {
    if (!product.trim()) {
      setToast({ message: '请填写产品/服务名', type: 'error' });
      return;
    }
    const validPoints = sellingPoints.filter((p) => p.trim());
    if (validPoints.length < 3) {
      setToast({ message: '至少需要 3 个有效卖点', type: 'error' });
      return;
    }

    setProgressText('AI 设计 9 个视觉角度...');

    try {
      const result = await generateAds({
        product: product.trim(),
        sellingPoints: validPoints,
        referenceImage: referenceImage || undefined,
      });
      setCells(result.cells);
      setProgressText('');
      setToast({
        message: `已生成 ${result.successCount}/9 张封面`,
        type: result.successCount === 9 ? 'success' : 'error',
      });
      if (isInWorkflow && result.cells.length > 0) {
        const firstCell = result.cells[0];
        completeCurrentStep({ topic: product, text: product, imageUrl: firstCell.imageUrl || '' }, undefined);
      }
    } catch (e: any) {
      setError(e.message || '网络错误');
      setProgressText('');
    }
  };

  // ─── 下载 ZIP ──────────────────────────────
  const handleDownloadZip = async () => {
    if (!cells) return;
    if (!jszipLoaded) {
      setToast({ message: 'ZIP 库未加载, 请稍后再试', type: 'error' });
      return;
    }
    try {
      setProgressText('正在打包 ZIP...');
      const JSZip = (window as any).JSZip;
      const zip = new JSZip();
      const folder = zip.folder(`${product || 'ads'}-朋友圈9宫格`);

      // 写一个 Excel 友好的 CSV 标题行
      let csv = '序号,标题,视觉角度,封面URL,对应卖点\n';
      cells.forEach((c, i) => {
        const sp = sellingPoints[c.sellingPointIndex] || '';
        csv += `${i + 1},"${c.title}","${c.visualAngle}",${c.imageUrl},"${sp}"\n`;
      });
      folder.file('标题文案.csv', `﻿${csv}`); // ﻿ BOM 让 Excel 正确识别 UTF-8

      // 并发下载所有图片
      await Promise.all(
        cells.map(async (c, i) => {
          if (!c.imageUrl) return;
          try {
            const res = await fetch(c.imageUrl);
            const blob = await res.blob();
            const ext = c.imageUrl.includes('.png') ? 'png' : 'jpg';
            const safeTitle = c.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 20);
            folder.file(`${i + 1}_${safeTitle || 'cell'}.${ext}`, blob);
          } catch (e) {
            console.error(`下载 ${i + 1} 失败`, e);
          }
        })
      );

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${product || 'ads'}-朋友圈9宫格.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setProgressText('');
      setToast({ message: '已下载 ZIP', type: 'success' });
    } catch (e: any) {
      setProgressText('');
      setToast({ message: '打包失败: ' + e.message, type: 'error' });
    }
  };

  // 复制单条标题
  const handleCopyTitle = async (title: string) => {
    try {
      await navigator.clipboard.writeText(title);
      setToast({ message: '已复制', type: 'success' });
    } catch {
      setToast({ message: '复制失败', type: 'error' });
    }
  };

  // 快捷导航
  const handleNavigate = (page: PageKey) => {
    const map: Partial<Record<PageKey, string>> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(map[page] || '/home');
  };

  const validPoints = sellingPoints.filter((p) => p.trim()).length;
  const canGenerate = product.trim() && validPoints >= 3 && !isGenerating;

  return (
    <div className="flex flex-col min-h-screen pb-20 overflow-x-hidden">
      <TopNav title="朋友圈广告 9 宫格" showBack onBack={() => router.push('/ai')} />

      {isInWorkflow && session && (
        <WorkflowSessionBar session={session} onPause={pauseSession} onResume={resumeSession} onAbandon={abandonSession} />
      )}

      <div className="flex-1 px-4 pt-4 space-y-4 min-w-0">
        {/* 顶部说明 */}
        <GlassCard className="!p-3">
          <div className="flex items-start gap-2">
            <Sparkles size={16} color="#8B5CF6" />
            <div className="flex-1">
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>朋友圈广告素材包</p>
              <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.5, marginTop: 2 }}>
                输入产品/服务名 + 3-5 个卖点,AI 自动设计 9 个不同视觉角度的 1:1 封面 + 9 句广告标题,一键打包 ZIP(含标题 CSV + 9 张图)。
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Step 1: 产品名 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <span style={{ color: '#3B82F6' }}>Step 1</span> · 产品/服务名
          </p>
          <input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="例: 婴儿推车 / 轻食餐 / 健身房年卡..."
            maxLength={100}
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-transparent outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#E5E7EB',
            }}
          />
        </GlassCard>

        {/* Step 2: 卖点 */}
        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>
              <span style={{ color: '#8B5CF6' }}>Step 2</span> · 卖点 (3-5 个)
            </p>
            <button
              onClick={addSellingPoint}
              disabled={sellingPoints.length >= 5}
              className="text-[10px] flex items-center gap-1"
              style={{ color: sellingPoints.length >= 5 ? '#6B7280' : '#93C5FD' }}
            >
              <Plus size={10} /> 加卖点
            </button>
          </div>
          <div className="space-y-2">
            {sellingPoints.map((sp, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  value={sp}
                  onChange={(e) => updateSellingPoint(i, e.target.value)}
                  placeholder={`卖点 ${i + 1} (例: 轻便折叠)`}
                  maxLength={50}
                  className="flex-1 px-3 py-2 rounded-lg text-xs bg-transparent outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#E5E7EB',
                  }}
                />
                {sellingPoints.length > 3 && (
                  <button
                    onClick={() => removeSellingPoint(i)}
                    className="px-2 py-2 rounded-lg"
                    style={{ background: 'rgba(239,68,68,0.1)' }}
                    title="删除"
                  >
                    <Trash2 size={12} color="#FCA5A5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Step 3: 参考图（可选） */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <span style={{ color: '#22C55E' }}>Step 3</span> · 参考图(可选,从 AI 生图带入)
          </p>
          {referenceImage ? (
            <div className="relative inline-block">
              <img
                src={referenceImage}
                alt="参考"
                className="w-24 h-24 rounded-lg object-cover"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <button
                onClick={() => setReferenceImage('')}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.8)' }}
                title="移除"
              >
                <X size={10} color="#fff" />
              </button>
            </div>
          ) : (
            <p style={{ color: '#6B7280', fontSize: 11 }}>
              从 AI 生图页 → 选「AI 图生视频」旁加个「导入朋友圈 9 宫格」按钮, 或手动粘贴 URL
            </p>
          )}
        </GlassCard>

        {/* 生成按钮 */}
        <PrimaryButton
          fullWidth
          size="lg"
          onClick={handleGenerate}
          disabled={!canGenerate}
        >
          {isGenerating ? (
            <><Loader2 size={16} className="animate-spin" /> {progressText || '生成中...'}</>
          ) : (
            <><Zap size={16} /> 生成 9 宫格素材包</>
          )}
        </PrimaryButton>

        {/* 错误 */}
        {error && (
          <GlassCard>
            <div className="flex items-start gap-2">
              <AlertCircle size={16} color="#EF4444" />
              <p style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</p>
            </div>
          </GlassCard>
        )}

        {/* 结果 9 宫格 */}
        {cells && cells.length > 0 && (
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>
                📦 9 宫格素材
              </p>
              <button
                onClick={handleDownloadZip}
                className="px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1"
                style={{
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
                  border: '1px solid rgba(59,130,246,0.5)',
                  color: '#93C5FD',
                  fontWeight: 600,
                }}
              >
                <Download size={11} /> 下载 ZIP
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {cells.map((c, i) => (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {/* 缩略图 */}
                  <div
                    className="relative aspect-square"
                    style={{
                      background: c.imageUrl
                        ? 'transparent'
                        : 'rgba(239,68,68,0.08)',
                    }}
                  >
                    {c.imageUrl ? (
                      <img
                        src={c.imageUrl}
                        alt={c.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                        <AlertCircle size={20} color="#EF4444" />
                        <p style={{ color: '#FCA5A5', fontSize: 9 }}>生成失败</p>
                      </div>
                    )}
                    <div
                      className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}
                    >
                      #{i + 1}
                    </div>
                  </div>

                  {/* 标题 */}
                  <div className="p-1.5">
                    <p
                      style={{ color: '#E5E7EB', fontSize: 10, fontWeight: 600, lineHeight: 1.3 }}
                      className="line-clamp-2"
                    >
                      {c.title}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span style={{ color: '#9CA3AF', fontSize: 9 }}>
                        {c.visualAngle}
                      </span>
                      <button
                        onClick={() => handleCopyTitle(c.title)}
                        className="p-0.5"
                        title="复制标题"
                      >
                        <Copy size={9} color="#9CA3AF" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 提示 */}
            <div
              className="mt-3 p-2.5 rounded-lg flex items-start gap-2"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              <CheckCircle2 size={14} color="#86EFAC" />
              <p style={{ color: '#86EFAC', fontSize: 11, lineHeight: 1.5 }}>
                下载的 ZIP 含 9 张 1:1 封面 + 1 份标题 CSV(序号/标题/角度/对应卖点)。可直接投放朋友圈广告。
              </p>
            </div>
          </GlassCard>
        )}
      </div>

      {/* 历史生成 */}
      {!historyLoading && historyItems.length > 0 && (
        <div className="px-4 pb-20">
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>历史生成</p>
          <div className="grid grid-cols-3 gap-1.5">
            {historyItems.map((item) => {
              const images = item.metadata?.generatedImage?.batchImages ||
                            (item.metadata?.generatedImage?.imageUrl ? [item.metadata.generatedImage.imageUrl] : []);
              const firstImage = images[0] || item.imageUrl;
              return (
                <div
                  key={item.id}
                  className="rounded-lg overflow-hidden cursor-pointer transition-all"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    aspectRatio: '1',
                  }}
                  onClick={() => {
                    if (item.title) {
                      setProduct(item.title);
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  {firstImage ? (
                    <img src={firstImage} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span style={{ fontSize: 24 }}>🎬</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function AdsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p style={{ color: '#9CA3AF' }}>加载中...</p></div>}>
        <AdsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
