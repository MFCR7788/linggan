'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Copy, Check, ExternalLink, ChevronLeft, ChevronRight, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Toast } from '@/components/Toast';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { ProtectedRoute } from '@/components';
import { apiClient } from '@/lib/api-client';
import { PLATFORMS, type PlatformId } from '@/lib/platforms/types';
import { ManualMetricsForm } from '@/components/ManualMetricsForm';

interface Publication {
  id: string;
  platform: string;
  title: string;
  content: string;
  cover_url: string | null;
  status: string;
  external_url: string | null;
  tags: string[];
}

const PLATFORM_DEEPLINKS: Partial<Record<PlatformId, string>> = {
  douyin: 'snssdk1233://',
  xiaohongshu: 'xhsdiscover://',
  wechat_video: 'weixin://',
  bilibili: 'bilibili://',
};

function PublishGuideContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idsStr = searchParams.get('ids') || '';
  const ids = idsStr.split(',').filter(Boolean);

  const [publications, setPublications] = useState<Publication[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [submittingUrl, setSubmittingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  useEffect(() => {
    if (ids.length === 0) {
      router.push('/publish');
      return;
    }
    loadPublications();
  }, []);

  const loadPublications = async () => {
    setLoading(true);
    try {
      const results: Publication[] = [];
      for (const id of ids) {
        const res = await apiClient.get<{ publication: Publication }>(`/platforms/publications/${id}`);
        if (res.success && res.data?.publication) {
          results.push(res.data.publication);
        }
      }
      setPublications(results);
      if (results[0]?.external_url) setUrlInput(results[0].external_url);
    } catch (e: any) {
      setToast({ message: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const current = publications[currentIdx];
  const meta = current ? PLATFORMS[current.platform as PlatformId] : null;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ message: `${label}已复制`, type: 'success' });
    } catch {
      setToast({ message: '复制失败', type: 'error' });
    }
  };

  const handleOpenApp = () => {
    if (!current) return;
    const deepLink = PLATFORM_DEEPLINKS[current.platform as PlatformId];
    if (deepLink) {
      window.location.href = deepLink;
    } else {
      setToast({ message: '请手动打开 App', type: 'error' });
    }
  };

  const handleSubmitUrl = async () => {
    if (!current) return;
    if (!urlInput.trim()) {
      setToast({ message: '请填写链接', type: 'error' });
      return;
    }
    setSubmittingUrl(true);
    try {
      const res = await apiClient.patch(`/platforms/publications/${current.id}`, {
        external_url: urlInput.trim(),
        status: 'published',
      });
      if (res.success) {
        setToast({ message: '已保存', type: 'success' });
        // 跳到下一条
        if (currentIdx < publications.length - 1) {
          setCurrentIdx(currentIdx + 1);
          setUrlInput(publications[currentIdx + 1]?.external_url || '');
        } else {
          router.push('/insights');
        }
      } else {
        setToast({ message: res.error || '保存失败', type: 'error' });
      }
    } catch (e: any) {
      setToast({ message: e.message, type: 'error' });
    } finally {
      setSubmittingUrl(false);
    }
  };

  const handleNavigate = (page: PageKey) => {
    const map: Partial<Record<PageKey, string>> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(map[page] || '/home');
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen pb-20">
        <TopNav title="复制引导" showBack onBack={() => router.push('/publish')} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} color="#6B7280" className="animate-spin" />
        </div>
      </div>
    );
  }

  if (!current || !meta) {
    return (
      <div className="flex flex-col min-h-screen pb-20">
        <TopNav title="复制引导" showBack onBack={() => router.push('/publish')} />
        <div className="flex-1 flex items-center justify-center p-4">
          <p style={{ color: '#9CA3AF' }}>无内容</p>
        </div>
      </div>
    );
  }

  const fullText = `${current.title}\n\n${current.content}${current.tags?.length ? '\n\n' + current.tags.map((t) => `#${t}#`).join(' ') : ''}`;

  return (
    <div className="flex flex-col min-h-screen pb-20 overflow-x-hidden">
      <TopNav title={`发布到 ${meta.name}`} showBack onBack={() => router.push('/publish')} />

      <div className="flex-1 px-4 pt-4 space-y-4 min-w-0">
        {/* 进度 */}
        {publications.length > 1 && (
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: '#9CA3AF' }}>
              {currentIdx + 1} / {publications.length}
            </span>
            <div className="flex gap-1">
              {publications.map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{ background: i === currentIdx ? '#3B82F6' : 'rgba(255,255,255,0.2)' }}
                />
              ))}
            </div>
          </div>
        )}

        {/* 3 步引导 */}
        <GlassCard className="!p-3">
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            📋 3 步发布到 {meta.name}
          </p>
          <ol className="space-y-1.5 text-xs" style={{ color: '#E5E7EB', lineHeight: 1.5 }}>
            <li><span style={{ color: '#3B82F6', fontWeight: 700 }}>1.</span> 点击下方「复制全部」</li>
            <li><span style={{ color: '#3B82F6', fontWeight: 700 }}>2.</span> 打开 {meta.name} App,粘贴发布</li>
            <li><span style={{ color: '#3B82F6', fontWeight: 700 }}>3.</span> 把发布后的链接粘贴回下方 → 状态变「已发布」</li>
          </ol>
        </GlassCard>

        {/* 复制区 */}
        <GlassCard>
          {current.cover_url && (
            <div className="mb-2">
              <p style={{ color: '#9CA3AF', fontSize: 10, marginBottom: 4 }}>封面</p>
              <img src={current.cover_url} alt="cover" className="w-20 h-20 rounded-lg object-cover" />
            </div>
          )}
          <CopyBlock label="标题" text={current.title} onCopy={() => copy(current.title, '标题')} />
          <CopyBlock label="正文" text={current.content} onCopy={() => copy(current.content, '正文')} />
          {current.tags?.length > 0 && (
            <CopyBlock
              label="话题"
              text={current.tags.map((t) => `#${t}#`).join(' ')}
              onCopy={() => copy(current.tags.map((t) => `#${t}#`).join(' '), '话题')}
            />
          )}
          <button
            onClick={() => copy(fullText, '全部')}
            className="w-full mt-2 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
            style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(139,92,246,0.25))',
              border: '1px solid rgba(59,130,246,0.5)',
              color: '#93C5FD',
            }}
          >
            <Copy size={12} /> 复制全部 (标题+正文+话题)
          </button>
        </GlassCard>

        {/* 打开 App */}
        <PrimaryButton fullWidth onClick={handleOpenApp}>
          <ExternalLink size={14} /> 打开 {meta.name}
        </PrimaryButton>

        {/* 回填链接 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            🔗 回填发布链接
          </p>
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="把发布后的链接粘贴到这里"
            className="w-full px-3 py-2 rounded-lg text-xs bg-transparent outline-none mb-2"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
          />
          <PrimaryButton
            fullWidth
            size="sm"
            onClick={handleSubmitUrl}
            disabled={submittingUrl || !urlInput.trim()}
          >
            {submittingUrl ? <><Loader2 size={12} className="animate-spin" /> 保存中...</> : <><Check size={12} /> 标记为已发布</>}
          </PrimaryButton>
        </GlassCard>

        {/* 上一步/下一步 */}
        {publications.length > 1 && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setCurrentIdx(Math.max(0, currentIdx - 1));
                setUrlInput(publications[currentIdx - 1]?.external_url || '');
              }}
              disabled={currentIdx === 0}
              className="flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: currentIdx === 0 ? '#6B7280' : '#E5E7EB',
              }}
            >
              <ChevronLeft size={12} /> 上一个
            </button>
            <button
              onClick={() => {
                setCurrentIdx(Math.min(publications.length - 1, currentIdx + 1));
                setUrlInput(publications[currentIdx + 1]?.external_url || '');
              }}
              disabled={currentIdx === publications.length - 1}
              className="flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: currentIdx === publications.length - 1 ? '#6B7280' : '#E5E7EB',
              }}
            >
              下一个 <ChevronRight size={12} />
            </button>
          </div>
        )}

        {/* 录入数据 */}
        {current.status === 'published' && (
          <ManualMetricsForm
            publicationId={current.id}
            platformName={meta.name}
            onSaved={() => setToast({ message: '已保存,可在数据看板查看', type: 'success' })}
          />
        )}
      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function CopyBlock({ label, text, onCopy }: { label: string; text: string; onCopy: () => void }) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <p style={{ color: '#9CA3AF', fontSize: 10 }}>{label}</p>
        <button onClick={onCopy} className="text-[10px] flex items-center gap-0.5" style={{ color: '#93C5FD' }}>
          <Copy size={9} /> 复制
        </button>
      </div>
      <div
        className="p-2 rounded-md text-xs whitespace-pre-wrap"
        style={{
          background: 'rgba(255,255,255,0.03)',
          color: '#E5E7EB',
          maxHeight: 100,
          overflow: 'auto',
          lineHeight: 1.5,
        }}
      >
        {text}
      </div>
    </div>
  );
}

export default function PublishGuidePage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p style={{ color: '#9CA3AF' }}>加载中...</p></div>}>
        <PublishGuideContent />
      </Suspense>
    </ProtectedRoute>
  );
}
