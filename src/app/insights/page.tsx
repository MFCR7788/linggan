'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, Eye, Heart, MessageCircle, Share2, Bookmark, TrendingUp, ChevronRight, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { ProtectedRoute } from '@/components';
import { Toast } from '@/components/Toast';
import { apiClient } from '@/lib/api-client';
import { PLATFORMS, type PlatformId } from '@/lib/platforms/types';

interface InsightsData {
  range: string;
  days: number;
  overview: {
    totalPublished: number;
    totalPublications: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    collects: number;
    totalInteractions: number;
    avgEngagement: number;
  };
  platformComparison: Array<{
    platform: string;
    count: number;
    views: number;
    avgViews: number;
    engagement: number;
  }>;
  timeline: Array<{ date: string; published: number; views: number }>;
  topItems: Array<{
    publicationId: string;
    platform: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagement: number;
    source: 'auto' | 'manual';
  }>;
}

function InsightsContent() {
  const router = useRouter();
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadData = async (r: string) => {
    setLoading(true);
    try {
      const res = await apiClient.get<InsightsData>(`/insights?range=${r}`);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setData(null);
      }
    } catch (e: any) {
      setToast({ message: e.message || '加载失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(range);
  }, [range]);

  const handleNavigate = (page: PageKey) => {
    const map: Partial<Record<PageKey, string>> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(map[page] || '/home');
  };

  const overview = data?.overview;
  const hasData = overview && overview.totalPublished > 0;

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav title="效果数据" showBack onBack={() => router.push('/ai')} />

      <div className="flex-1 px-4 pt-4 space-y-4 min-w-0">
        {/* 时间范围切换 */}
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                background: range === r ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.05)',
                border: range === r ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                color: range === r ? '#93C5FD' : '#9CA3AF',
              }}
            >
              近 {r === '7d' ? '7' : r === '30d' ? '30' : '90'} 天
            </button>
          ))}
        </div>

        {loading ? (
          <GlassCard>
            <p style={{ color: '#9CA3AF', textAlign: 'center', padding: 20 }}>加载中...</p>
          </GlassCard>
        ) : !hasData ? (
          <GlassCard>
            <div className="text-center py-6">
              <BarChart3 size={48} color="#4B5563" style={{ margin: '0 auto' }} />
              <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginTop: 12 }}>
                还没有数据
              </p>
              <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
                发布内容到各平台后,数据会在这里汇总。<br />
                公众号/微博自动抓取,其他平台手动录入。
              </p>
              <button
                onClick={() => router.push('/publish')}
                className="mt-4 px-4 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                  color: '#FFFFFF',
                }}
              >
                立即发布 →
              </button>
            </div>
          </GlassCard>
        ) : (
          <>
            {/* 总览卡 */}
            <GlassCard>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} color="#8B5CF6" />
                <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>总览</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  icon={<Eye size={14} color="#93C5FD" />}
                  label="总阅读"
                  value={formatNumber(overview!.views)}
                />
                <StatCard
                  icon={<Heart size={14} color="#FCA5A5" />}
                  label="总互动"
                  value={formatNumber(overview!.totalInteractions)}
                />
                <StatCard
                  icon={<TrendingUp size={14} color="#86EFAC" />}
                  label="平均互动率"
                  value={`${overview!.avgEngagement}%`}
                />
                <StatCard
                  icon={<BarChart3 size={14} color="#FCD34D" />}
                  label="已发布"
                  value={`${overview!.totalPublished} 篇`}
                />
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <MiniStat label="赞" value={formatNumber(overview!.likes)} />
                <MiniStat label="评" value={formatNumber(overview!.comments)} />
                <MiniStat label="转" value={formatNumber(overview!.shares)} />
                <MiniStat label="藏" value={formatNumber(overview!.collects)} />
              </div>
            </GlassCard>

            {/* 平台对比 */}
            {data!.platformComparison.length > 0 && (
              <GlassCard>
                <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  平台对比
                </p>
                <div className="space-y-2">
                  {data!.platformComparison.map((p) => {
                    const meta = PLATFORMS[p.platform as PlatformId];
                    const maxAvg = Math.max(...data!.platformComparison.map((x) => x.avgViews), 1);
                    return (
                      <div key={p.platform}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 14 }}>{meta?.emoji || '📊'}</span>
                            <span style={{ color: '#E5E7EB', fontSize: 12, fontWeight: 500 }}>
                              {meta?.name || p.platform}
                            </span>
                            <span style={{ color: '#6B7280', fontSize: 10 }}>
                              ({p.count} 篇)
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span style={{ color: '#93C5FD', fontSize: 11 }}>
                              均阅 {formatNumber(p.avgViews)}
                            </span>
                            <span style={{ color: '#86EFAC', fontSize: 11 }}>
                              {p.engagement.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div
                          className="h-1.5 rounded-full overflow-hidden"
                          style={{ background: 'rgba(255,255,255,0.05)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(p.avgViews / maxAvg) * 100}%`,
                              background: meta?.color || '#3B82F6',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            )}

            {/* 时间线 */}
            {data!.timeline.length > 0 && (
              <GlassCard>
                <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  发布 & 阅读趋势
                </p>
                <Sparkline data={data!.timeline} />
              </GlassCard>
            )}

            {/* Top 10 作品 */}
            {data!.topItems.length > 0 && (
              <GlassCard>
                <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  Top 10 作品(按互动率)
                </p>
                <div className="space-y-2">
                  {data!.topItems.map((item, i) => {
                    const meta = PLATFORMS[item.platform as PlatformId];
                    return (
                      <button
                        key={item.publicationId}
                        onClick={() => router.push(`/publish/${item.publicationId}`)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg text-left"
                        style={{ background: 'rgba(255,255,255,0.03)' }}
                      >
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{
                            background: i < 3 ? 'linear-gradient(135deg, #F59E0B, #EF4444)' : 'rgba(255,255,255,0.1)',
                            color: i < 3 ? '#FFFFFF' : '#9CA3AF',
                          }}
                        >
                          {i + 1}
                        </span>
                        <span style={{ fontSize: 14 }}>{meta?.emoji || '📊'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span style={{ color: '#9CA3AF', fontSize: 10 }}>{meta?.name || item.platform}</span>
                            {item.source === 'manual' && (
                              <span style={{ color: '#6B7280', fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'rgba(255,255,255,0.05)' }}>
                                手动
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span style={{ color: '#E5E7EB', fontSize: 10 }}>阅 {formatNumber(item.views)}</span>
                            <span style={{ color: '#FCA5A5', fontSize: 10 }}>赞 {formatNumber(item.likes)}</span>
                            <span style={{ color: '#93C5FD', fontSize: 10 }}>评 {formatNumber(item.comments)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span style={{ color: '#86EFAC', fontSize: 12, fontWeight: 700 }}>
                            {item.engagement.toFixed(1)}%
                          </span>
                          <ChevronRight size={12} color="#6B7280" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </GlassCard>
            )}
          </>
        )}
      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="p-3 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span style={{ color: '#9CA3AF', fontSize: 10 }}>{label}</span>
      </div>
      <p style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600 }}>{value}</p>
      <p style={{ color: '#6B7280', fontSize: 9, marginTop: 1 }}>{label}</p>
    </div>
  );
}

function Sparkline({ data }: { data: Array<{ date: string; published: number; views: number }> }) {
  const maxViews = Math.max(...data.map((d) => d.views), 1);
  const maxPub = Math.max(...data.map((d) => d.published), 1);
  return (
    <div>
      <div className="flex items-end gap-0.5 h-24">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
            <div
              className="w-full rounded-t"
              style={{
                height: `${(d.views / maxViews) * 70}%`,
                background: 'linear-gradient(180deg, #3B82F6, #1E40AF)',
                minHeight: d.views > 0 ? 2 : 0,
              }}
              title={`${d.date}: ${d.views} 阅读`}
            />
            <div
              className="w-full rounded-b"
              style={{
                height: `${(d.published / maxPub) * 30}%`,
                background: 'linear-gradient(180deg, #F59E0B, #B45309)',
                minHeight: d.published > 0 ? 2 : 0,
              }}
              title={`${d.date}: ${d.published} 发布`}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: '#3B82F6' }} />
          <span style={{ color: '#9CA3AF', fontSize: 10 }}>阅读</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: '#F59E0B' }} />
          <span style={{ color: '#9CA3AF', fontSize: 10 }}>发布</span>
        </div>
        <span style={{ color: '#6B7280', fontSize: 9 }}>{data[0]?.date} - {data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function InsightsPage() {
  return (
    <ProtectedRoute>
      <InsightsContent />
    </ProtectedRoute>
  );
}
