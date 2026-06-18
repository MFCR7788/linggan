'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ExternalLink, Clock, CheckCircle2, XCircle, Loader2, Trash2, ArrowLeft } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Toast } from '@/components/Toast';
import { TopNav } from '@/components/TopNav';
import { PageKey } from "@/components/BottomNav";
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
  is_manual_post: boolean;
  external_url: string | null;
  external_post_id: string | null;
  scheduled_publish_at: string | null;
  published_at: string | null;
  error_message: string | null;
  tags: string[];
  created_at: string;
  platform_accounts: { account_name: string; account_avatar: string | null } | null;
}

function PublicationDetailContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [pub, setPub] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ publication: Publication }>(`/platforms/publications/${id}`);
      if (res.success && res.data) setPub(res.data.publication);
    } catch (e: any) {
      setToast({ message: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleDelete = async () => {
    if (!confirm('确定删除?')) return;
    try {
      await apiClient.delete(`/platforms/publications/${id}`);
      setToast({ message: '已删除', type: 'success' });
      router.push('/publish');
    } catch (e: any) {
      setToast({ message: e.message, type: 'error' });
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
        <TopNav title="发布详情" showBack onBack={() => router.push('/publish')} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} color="#6B7280" className="animate-spin" />
        </div>
      </div>
    );
  }

  if (!pub) {
    return (
      <div className="flex flex-col min-h-screen pb-20">
        <TopNav title="发布详情" showBack onBack={() => router.push('/publish')} />
        <div className="flex-1 flex items-center justify-center p-4">
          <p style={{ color: '#9CA3AF' }}>未找到</p>
        </div>
      </div>
    );
  }

  const meta = PLATFORMS[pub.platform as PlatformId];
  const statusConfig = {
    draft: { color: '#9CA3AF', text: '草稿', icon: <Loader2 size={12} /> },
    scheduled: { color: '#FCD34D', text: '待发布', icon: <Clock size={12} /> },
    publishing: { color: '#93C5FD', text: '发布中', icon: <Loader2 size={12} className="animate-spin" /> },
    published: { color: '#86EFAC', text: '已发布', icon: <CheckCircle2 size={12} /> },
    failed: { color: '#FCA5A5', text: '失败', icon: <XCircle size={12} /> },
  }[pub.status] || { color: '#9CA3AF', text: pub.status, icon: null };

  return (
    <div className="flex flex-col min-h-screen pb-20 overflow-x-hidden">
      <TopNav title="发布详情" showBack onBack={() => router.push('/publish')} />

      <div className="flex-1 px-4 pt-4 space-y-4 min-w-0">
        {/* 状态卡 */}
        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontSize: 24 }}>{meta?.emoji}</span>
            <div className="flex-1">
              <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>{meta?.name || pub.platform}</p>
              {pub.platform_accounts && (
                <p style={{ color: '#9CA3AF', fontSize: 10 }}>账号: {pub.platform_accounts.account_name}</p>
              )}
            </div>
            <span
              className="px-2 py-1 rounded text-[10px] flex items-center gap-1"
              style={{ background: `${statusConfig.color}22`, color: statusConfig.color }}
            >
              {statusConfig.icon} {statusConfig.text}
            </span>
          </div>
          {pub.error_message && (
            <div className="mt-2 p-2 rounded text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#FCA5A5' }}>
              错误: {pub.error_message}
            </div>
          )}
          {pub.external_url && (
            <a
              href={pub.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 text-xs flex items-center gap-1"
              style={{ color: '#93C5FD' }}
            >
              <ExternalLink size={12} /> 打开原文
            </a>
          )}
        </GlassCard>

        {/* 内容预览 */}
        <GlassCard>
          {pub.cover_url && (
            <img src={pub.cover_url} alt="cover" className="w-full rounded-lg mb-2 max-h-48 object-cover" />
          )}
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{pub.title}</p>
          <p style={{ color: '#E5E7EB', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {pub.content}
          </p>
          {pub.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {pub.tags.map((t, i) => (
                <span key={i} style={{ color: '#93C5FD', fontSize: 10, padding: '2px 6px', background: 'rgba(59,130,246,0.1)', borderRadius: 4 }}>
                  #{t}
                </span>
              ))}
            </div>
          )}
        </GlassCard>

        {/* 时间线 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>时间线</p>
          <div className="space-y-1.5 text-xs">
            <Timeline label="创建" time={pub.created_at} />
            {pub.scheduled_publish_at && <Timeline label="定时" time={pub.scheduled_publish_at} />}
            {pub.published_at && <Timeline label="发布" time={pub.published_at} highlight />}
          </div>
        </GlassCard>

        {/* 手动录入数据 */}
        {(pub.status === 'published' || pub.status === 'failed') && (
          <ManualMetricsForm
            publicationId={pub.id}
            platformName={meta?.name || pub.platform}
            onSaved={load}
          />
        )}

        {/* 操作 */}
        <button
          onClick={handleDelete}
          className="w-full py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}
        >
          <Trash2 size={12} /> 删除发布记录
        </button>
      </div>

      
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function Timeline({ label, time, highlight }: { label: string; time: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: highlight ? '#86EFAC' : '#9CA3AF' }}>{label}</span>
      <span style={{ color: highlight ? '#86EFAC' : '#E5E7EB' }}>{new Date(time).toLocaleString('zh-CN')}</span>
    </div>
  );
}

export default function PublicationDetailPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p style={{ color: '#9CA3AF' }}>加载中...</p></div>}>
        <PublicationDetailContent />
      </Suspense>
    </ProtectedRoute>
  );
}
