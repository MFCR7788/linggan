'use client';


import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, ChevronDown, ChevronUp, TrendingUp, ExternalLink, Loader2 } from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { ProtectedRoute, LoadingSpinner } from '@/components';

interface HotspotItem {
  id: string;
  title: string;
  platform: string;
  source: string;
  original_content: string | null;
  ai_summary: string | null;
  relevance_score: number;
  credibility_level: string;
  importance_level: string;
  captured_at: string;
  status: string;
  heatScore: number;
  key_points: string[] | null;
  creation_suggestions: string[] | null;
  relevance_reason: string | null;
  original_url: string;
}

const sortOptions = [
  { key: 'captured_at', label: '时间' },
  { key: 'relevance_score', label: '相关性' },
];

const credibilityConfig: Record<string, { label: string; color: string }> = {
  green: { label: '高可信', color: '#22C55E' },
  yellow: { label: '中可信', color: '#F59E0B' },
  red: { label: '低可信', color: '#EF4444' },
};

function HotspotLibraryContent() {
  const router = useRouter();
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSort, setActiveSort] = useState('captured_at');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchHotspots = useCallback(async (pageNum: number, append: boolean = false) => {
    try {
      const res = await fetch(`/api/hotspot?page=${pageNum}&limit=20&sortBy=${activeSort}&sortOrder=desc`);
      const data = await res.json();
      if (data.success) {
        if (append) {
          setHotspots(prev => [...prev, ...(data.data || [])]);
        } else {
          setHotspots(data.data || []);
        }
        setHasMore(data.data?.length === 20);
      }
    } catch (e) {
      console.error('获取热点库失败:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeSort]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchHotspots(1);
  }, [fetchHotspots]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchHotspots(nextPage, true);
  };

  const handleNavigate = (page: PageKey) => {
    const routes: Record<string, string> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai',
      hotspot: '/hotspot', profile: '/profile', login: '/login',
      'inspiration-detail': '/inspiration/detail',
      'ai-copywriting': '/ai/copywriting', 'ai-image': '/ai/image',
      'ai-video': '/ai/video', 'hotspot-detail': '/hotspot/detail',
      'hotspot-library': '/hotspot/library', notification: '/notification',
    };
    router.push(routes[page] || '/home');
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  const platformColors: Record<string, string> = {
    weibo: '#E0534A', zhihu: '#3B82F6', bilibili: '#FB7299',
    sogou: '#FF8C00', baidu: '#1E90FF', douyin: '#000000',
    toutiao: '#FF4757', bing: '#00A4EF', hackernews: '#FF6600',
  };

  const getPlatformColor = (platform: string) => platformColors[platform.toLowerCase()] || '#6366F1';
  const getThumbnail = (platform: string) => {
    const emojis: Record<string, string> = {
      weibo: '📡', zhihu: '🤖', bilibili: '📺', sogou: '🔍',
      baidu: '🔎', douyin: '🎵', toutiao: '📰', bing: '🌐',
      hackernews: '💻',
    };
    return emojis[platform.toLowerCase()] || '📡';
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav
        title="热点库"
        right={
          <div className="flex gap-3">
            <button className="p-1"><Search size={20} color="#E5E7EB" /></button>
            <button className="p-1"><SlidersHorizontal size={20} color="#E5E7EB" /></button>
          </div>
        }
      />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* Sort Options */}
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
          {sortOptions.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveSort(key)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                background: activeSort === key ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.07)',
                border: activeSort === key ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.12)',
                color: activeSort === key ? '#93C5FD' : '#9CA3AF',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="py-20">
            <LoadingSpinner text="加载热点库..." />
          </div>
        )}

        {/* Empty state */}
        {!loading && hotspots.length === 0 && (
          <div className="py-20 text-center">
            <p style={{ color: '#9CA3AF', fontSize: 14 }}>暂无热点数据</p>
            <button
              onClick={() => router.push('/hotspot')}
              className="mt-4 px-4 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.4)' }}
            >
              返回热点雷达添加关键词
            </button>
          </div>
        )}

        {/* Hotspot Cards */}
        {!loading && hotspots.length > 0 && (
          <div className="space-y-3">
            {hotspots.map((item) => {
              const cred = credibilityConfig[item.credibility_level] || credibilityConfig.green;
              const isExpanded = expandedId === item.id;
              const thumbnail = getThumbnail(item.platform || item.source);
              return (
                <GlassCard key={item.id} className="!p-0 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <span style={{ fontSize: 32 }}>{thumbnail}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          <span className="px-2 py-0.5 rounded-lg text-xs"
                            style={{ background: cred.color + '22', color: cred.color, border: `1px solid ${cred.color}44` }}>
                            {cred.label}
                          </span>
                          <GlassBadge>{item.importance_level === 'high' ? '重要' : item.importance_level === 'urgent' ? '紧急' : '一般'}</GlassBadge>
                          <span className="px-1.5 py-0.5 rounded text-xs"
                            style={{ background: getPlatformColor(item.platform || item.source) + '22', color: getPlatformColor(item.platform || item.source), border: `1px solid ${getPlatformColor(item.platform || item.source)}44`, fontSize: 11 }}>
                            {item.platform || item.source}
                          </span>
                          <span style={{ color: '#9CA3AF', fontSize: 11 }}>{formatTime(item.captured_at)}</span>
                        </div>
                        <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 4 }} className="line-clamp-2">{item.title}</p>
                        {!isExpanded && item.original_content && (
                          <p style={{ color: '#9CA3AF', fontSize: 12 }} className="line-clamp-2">{item.original_content}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expand Toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex items-center justify-center w-full py-2 gap-1"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: '#9CA3AF', fontSize: 12 }}
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {isExpanded ? '收起' : '展开详情'}
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div
                        className="mt-4 p-3 rounded-xl"
                        style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}
                      >
                        <p style={{ color: '#93C5FD', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>AI 分析</p>

                        {item.ai_summary && (
                          <p style={{ color: '#E5E7EB', fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>{item.ai_summary}</p>
                        )}
                        {item.relevance_reason && (
                          <div className="mb-3">
                            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>相关性分析</p>
                            <p style={{ color: '#E5E7EB', fontSize: 12 }}>{item.relevance_reason}</p>
                          </div>
                        )}

                        {item.key_points && item.key_points.length > 0 && (
                          <>
                            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>关键观点</p>
                            {item.key_points.map((p, i) => (
                              <p key={i} style={{ color: '#E5E7EB', fontSize: 12 }} className="flex gap-2">
                                <span style={{ color: '#3B82F6' }}>•</span>{p}
                              </p>
                            ))}
                          </>
                        )}
                        {item.creation_suggestions && item.creation_suggestions.length > 0 && (
                          <>
                            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginTop: 8, marginBottom: 6 }}>创作建议</p>
                            {item.creation_suggestions.map((s, i) => (
                              <p key={i} style={{ color: '#E5E7EB', fontSize: 12 }} className="flex gap-2">
                                <span style={{ color: '#22C55E' }}>→</span>{s}
                              </p>
                            ))}
                          </>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleNavigate('inspiration')}
                          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm"
                          style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#93C5FD' }}
                        >
                          <TrendingUp size={14} /> 转灵感
                        </button>
                        <a
                          href={item.original_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm"
                          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB', textDecoration: 'none' }}
                        >
                          <ExternalLink size={14} /> 查看原文
                        </a>
                      </div>
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </div>
        )}

        {/* Load More */}
        {!loading && hasMore && (
          <div className="flex justify-center py-4">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm"
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93C5FD' }}
            >
              {loadingMore ? (
                <><Loader2 size={16} className="animate-spin" /> 加载中...</>
              ) : (
                '加载更多'
              )}
            </button>
          </div>
        )}
      </div>

      <BottomNav activePage="hotspot" onNavigate={handleNavigate} />
    </div>
  );
}

export default function HotspotLibraryPage() {
  return (
    <ProtectedRoute>
      <HotspotLibraryContent />
    </ProtectedRoute>
  );
}
