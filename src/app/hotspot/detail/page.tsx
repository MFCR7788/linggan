'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { ExternalLink, TrendingUp, CheckCircle, XCircle, ArrowLeft, Clock, Eye, MessageSquare, ThumbsUp, Share2, Copy, Check } from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { PageKey } from "@/components/BottomNav";
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/Toast';
import { ProtectedRoute, LoadingSpinner } from '@/components';
import FormattedText from '@/components/FormattedText';

interface RelatedHotspot {
  id: string;
  title: string;
  platform: string;
  relevance_score: number | null;
}

interface HotspotDetail {
  id: string;
  platform: string;
  original_url: string;
  title: string;
  author: string | null;
  original_content: string | null;
  ai_summary: string | null;
  key_points: string[] | null;
  relevance_reason: string | null;
  creation_suggestions: string[] | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  credibility_score: number | null;
  credibility_level: string | null;
  relevance_score: number | null;
  importance_score: number | null;
  importance_level: string | null;
  tags: string[] | null;
  status: string;
  captured_at: string;
  published_at: string | null;
  created_at: string;
  heatScore: number;
  relatedHotspots: RelatedHotspot[];
}

function HotspotDetailContent() {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [detail, setDetail] = useState<HotspotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('缺少热点 ID');
      return;
    }

    const fetchDetail = async () => {
      try {
        const response = await fetch(`/api/hotspot/${id}`);
        const data = await response.json();
        if (data.success) {
          setDetail(data.data);
          // 标记为已读
          fetch(`/api/hotspot/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_read: true }),
          }).catch((e) => { console.error('[Hotspot] 标记已读失败:', e); });
        } else {
          setError(data.error || '获取热点详情失败');
        }
      } catch (e) {
        console.error('[Hotspot] 获取详情失败:', e);
        setError('网络请求失败');
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [id]);

  const handleNavigate = (page: PageKey) => {
    switch (page) {
      case 'home': router.push('/home'); break;
      case 'inspiration': router.push('/inspiration'); break;
      case 'ai': router.push('/ai'); break;
      case 'hotspot': router.push('/hotspot'); break;
      case 'profile': router.push('/profile'); break;
      case 'login': router.push('/login'); break;
      case 'inspiration-detail': router.push('/inspiration/detail'); break;
      case 'ai-copywriting': router.push('/ai/copywriting'); break;
      case 'ai-image': router.push('/ai/image'); break;
      case 'ai-video': router.push('/ai/video'); break;
      case 'hotspot-detail': router.push('/hotspot/detail'); break;
      case 'hotspot-library': router.push('/hotspot/library'); break;
      case 'notification': router.push('/notification'); break;
      default: router.push('/home'); break;
    }
  };

  const handleBack = () => {
    router.push('/hotspot');
  };

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    return new Date(iso).toLocaleDateString('zh-CN');
  };

  const handleImportToInspiration = async () => {
    if (!detail || importing) return;
    setImporting(true);
    try {
      const res = await fetch('/api/inspiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'link',
          title: detail.title,
          original_text: detail.original_content || detail.ai_summary || detail.title,
          summary: detail.ai_summary,
          source_url: detail.original_url,
          source_platform: detail.platform,
          tags: detail.tags,
          media_urls: [],
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push('/inspiration');
      } else {
        console.error('转灵感失败:', data.error);
      }
    } catch (e) {
      console.error('转灵感失败:', e);
    } finally {
      setImporting(false);
    }
  };

  const credibilityLabel = (level: string | null) => {
    switch (level) {
      case 'green': return { label: '高可信度', color: '#86EFAC', bg: 'rgba(34,197,94,0.2)', border: 'rgba(34,197,94,0.4)' };
      case 'yellow': return { label: '中等可信', color: '#FBBF24', bg: 'rgba(251,191,36,0.2)', border: 'rgba(251,191,36,0.4)' };
      case 'red': return { label: '低可信度', color: '#FCA5A5', bg: 'rgba(239,68,68,0.2)', border: 'rgba(239,68,68,0.4)' };
      default: return null;
    }
  };

  const importanceLabel = (level: string | null) => {
    switch (level) {
      case 'high': return { label: '重要', color: '#93C5FD', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)' };
      case 'medium': return { label: '一般', color: '#9CA3AF', bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.3)' };
      case 'low': return { label: '次要', color: '#6B7280', bg: 'rgba(107,114,128,0.15)', border: 'rgba(107,114,128,0.3)' };
      default: return null;
    }
  };

  // 热度档位
  const heatBars = 5;

  // Loading 状态
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner text="加载热点详情..." />
      </div>
    );
  }

  // 错误或缺少 id
  if (error || !detail) {
    return (
      <div className="flex flex-col min-h-screen">
        <TopNav title="热点详情" showBack onBack={handleBack} />
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 16 }}>{error || '热点不存在'}</p>
          <PrimaryButton size="sm" onClick={handleBack}>返回热点列表</PrimaryButton>
        </div>
      </div>
    );
  }

  const credInfo = credibilityLabel(detail.credibility_level);
  const impInfo = importanceLabel(detail.importance_level);

  return (
    <div className="flex flex-col min-h-screen pb-28">
      <TopNav title="热点详情" showBack onBack={handleBack} showShare />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* Overview Badges */}
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {credInfo && (
              <span className="px-2 py-0.5 rounded-lg text-xs"
                style={{ background: credInfo.bg, color: credInfo.color, border: `1px solid ${credInfo.border}` }}>
                {credInfo.label}
              </span>
            )}
            {detail.relevance_score !== null && (
              <GlassBadge color="primary">相关性 {detail.relevance_score}</GlassBadge>
            )}
            {impInfo && (
              <GlassBadge>{impInfo.label}</GlassBadge>
            )}
            <span className="px-2 py-0.5 rounded-lg text-xs"
              style={{ background: '#E0534A22', color: '#E0534A', border: '1px solid #E0534A44', fontSize: 11 }}>
              {detail.platform}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {detail.published_at && (
              <>
                <span style={{ color: '#9CA3AF', fontSize: 12 }}>发布：{formatTime(detail.published_at)}</span>
                <span style={{ color: '#9CA3AF', fontSize: 12 }}>·</span>
              </>
            )}
            <span style={{ color: '#9CA3AF', fontSize: 12 }}>抓取：{formatTime(detail.captured_at)}</span>
          </div>
        </div>

        {/* Content */}
        <GlassCard>
          <h1 style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 700, lineHeight: 1.4, marginBottom: 12 }}>
            {detail.title}
          </h1>

          {/* 热度指数 */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1">
              {[...Array(heatBars)].map((_, i) => (
                <div key={i}
                  className="w-2 h-4 rounded-sm"
                  style={{
                    background: i < Math.round(detail.heatScore / (100 / heatBars)) ? '#EF4444' : 'rgba(255,255,255,0.1)',
                  }}
                />
              ))}
            </div>
            <span style={{ color: '#EF4444', fontSize: 13, fontWeight: 600 }}>{detail.heatScore.toFixed(1)}</span>
          </div>

          {/* 互动数据 */}
          <div className="flex items-center gap-4 mb-4">
            {detail.view_count > 0 && (
              <div className="flex items-center gap-1">
                <Eye size={13} color="#9CA3AF" />
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>{detail.view_count}</span>
              </div>
            )}
            {detail.like_count > 0 && (
              <div className="flex items-center gap-1">
                <ThumbsUp size={13} color="#9CA3AF" />
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>{detail.like_count}</span>
              </div>
            )}
            {detail.comment_count > 0 && (
              <div className="flex items-center gap-1">
                <MessageSquare size={13} color="#9CA3AF" />
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>{detail.comment_count}</span>
              </div>
            )}
            {detail.share_count > 0 && (
              <div className="flex items-center gap-1">
                <Share2 size={13} color="#9CA3AF" />
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>{detail.share_count}</span>
              </div>
            )}
          </div>

          {/* 原文内容 */}
          {detail.original_content && (
            <div style={{ marginBottom: 12 }}>
              <FormattedText text={detail.original_content} color="#E5E7EB" fontSize={14} lineHeight={1.8} />
            </div>
          )}

          {detail.author && (
            <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>作者：{detail.author}</p>
          )}

          <a
            href={detail.original_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm"
            style={{ color: '#3B82F6' }}
          >
            <ExternalLink size={14} /> 跳转原文
          </a>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(detail.original_url);
                setCopied(true);
                showToast('链接已复制', 'success');
                setTimeout(() => setCopied(false), 2000);
              } catch {
                showToast('复制失败，请手动复制', 'error');
              }
            }}
            className="mt-4 ml-4 inline-flex items-center gap-2 text-sm"
            style={{ color: '#3B82F6' }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? '已复制' : '复制链接'}
          </button>
        </GlassCard>

        {/* AI Analysis */}
        {(detail.ai_summary || detail.key_points?.length || detail.relevance_reason || detail.creation_suggestions?.length) && (
          <GlassCard style={{ border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.06)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: '#3B82F6', fontSize: 10, color: '#fff', fontWeight: 700 }}>AI</div>
              <span style={{ color: '#93C5FD', fontSize: 14, fontWeight: 600 }}>AI 分析</span>
            </div>

            {detail.ai_summary && (
              <>
                <p style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>摘要</p>
                <div style={{ marginBottom: 14 }}>
                  <FormattedText text={detail.ai_summary} color="#E5E7EB" fontSize={13} lineHeight={1.7} />
                </div>
              </>
            )}

            {detail.key_points && detail.key_points.length > 0 && (
              <>
                <p style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>关键观点</p>
                {detail.key_points.map((pt: string, i: number) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <span style={{ color: '#3B82F6', flexShrink: 0, marginTop: 2 }}>•</span>
                    <FormattedText text={pt} color="#E5E7EB" fontSize={13} lineHeight={1.6} compact />
                  </div>
                ))}
              </>
            )}

            {detail.relevance_reason && (
              <>
                <p style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, marginTop: 12, marginBottom: 8 }}>相关性分析</p>
                <div style={{ marginBottom: 14 }}>
                  <FormattedText text={detail.relevance_reason} color="#E5E7EB" fontSize={13} lineHeight={1.7} />
                </div>
              </>
            )}

            {detail.creation_suggestions && detail.creation_suggestions.length > 0 && (
              <>
                <p style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>创作建议</p>
                {detail.creation_suggestions.map((s: string, i: number) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <span style={{ color: '#22C55E', flexShrink: 0, marginTop: 2 }}>→</span>
                    <FormattedText text={s} color="#E5E7EB" fontSize={13} lineHeight={1.6} compact />
                  </div>
                ))}
              </>
            )}
          </GlassCard>
        )}

        {/* Related Hotspots */}
        {detail.relatedHotspots && detail.relatedHotspots.length > 0 && (
          <div>
            <h3 style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>相关热点</h3>
            <div className="space-y-3">
              {detail.relatedHotspots.map((h) => (
                <GlassCard
                  key={h.id}
                  hover
                  onClick={() => router.push(`/hotspot/detail?id=${h.id}`)}
                  className="!p-4"
                >
                  <div className="flex items-start gap-3">
                    <span style={{ fontSize: 28 }}>🔥</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <GlassBadge>{h.platform || '热点'}</GlassBadge>
                        <span style={{ color: '#EF4444', fontSize: 11, fontWeight: 600 }}>
                          相关度 {h.relevance_score ?? '-'}
                        </span>
                      </div>
                      <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 4 }} className="truncate">
                        {h.title}
                      </p>
                      <div className="flex items-center gap-1" style={{ color: '#9CA3AF', fontSize: 11 }}>
                        <TrendingUp size={11} /> 点击查看详情
                      </div>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 py-3 flex items-center gap-2"
        style={{
          background: 'rgba(10,22,41,0.92)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          maxWidth: 480,
          margin: '0 auto',
          zIndex: 40,
        }}
      >
        <PrimaryButton fullWidth size="md" fontSize={14} onClick={handleImportToInspiration} disabled={importing}>
          <TrendingUp size={16} /> {importing ? '导入中...' : '一键转灵感'}
        </PrimaryButton>
        <PrimaryButton
          variant="ghost"
          size="md"
          onClick={async () => {
            try {
              await fetch(`/api/hotspot/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'confirmed' }),
              });
              showToast('已标记为有用', 'success');
            } catch (e) { console.error('[Hotspot] 标记有用失败:', e); }
          }}
          className="!px-3"
          style={{
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.3)',
            color: '#86EFAC'
          }}
        >
          <CheckCircle size={16} />
        </PrimaryButton>
        <PrimaryButton
          variant="ghost"
          size="md"
          onClick={async () => {
            try {
              await fetch(`/api/hotspot/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'dismissed' }),
              });
              showToast('已忽略该热点', 'info');
            } catch (e) { console.error('[Hotspot] 忽略热点失败:', e); }
          }}
          className="!px-3"
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#FCA5A5'
          }}
        >
          <XCircle size={16} />
        </PrimaryButton>
      </div>

      
    </div>
  );
}

export default function HotspotDetailPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><LoadingSpinner text="加载中..." /></div>}>
        <HotspotDetailContent />
      </Suspense>
    </ProtectedRoute>
  );
}
