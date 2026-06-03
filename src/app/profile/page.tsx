'use client';


import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Bell, CreditCard, HelpCircle, LogOut, ChevronRight, Edit3, BookOpen, Sparkles, TrendingUp, Star, BarChart2 } from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { useUser } from '@/hooks/use-user';
import { ProtectedRoute } from '@/components';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface UserStats {
  inspirationCount: number;
  aiWorks: number;
  hotspotCount: number;
  publishedCount: number;
}

function useProfileStats() {
  return useQuery({
    queryKey: ['user-stats'],
    queryFn: async () => {
      const response = await apiClient.get<UserStats>('/user/stats');
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    staleTime: 30_000,
  });
}

const subscriptionTiers = [
  { id: 'free', label: '免费版', features: ['每日 5 次 AI 生成', '灵感库 100 条上限', '基础热点监控'], current: false, price: '免费' },
  { id: 'pro', label: '专业版', features: ['无限 AI 生成', '无限灵感存储', '实时热点雷达', '优先生成队列'], current: true, price: '¥39/月' },
  { id: 'team', label: '团队版', features: ['专业版全部功能', '团队协作空间', '专属客服支持', 'API 接入'], current: false, price: '¥199/月' },
];

const menuItems = [
  { icon: <Bell size={18} />, label: '通知设置', page: 'notification' as PageKey | null, color: '#3B82F6' },
  { icon: <Settings size={18} />, label: '账号设置', page: 'profile-settings' as PageKey | null, color: '#8B5CF6' },
  { icon: <CreditCard size={18} />, label: '订阅管理', page: null, color: '#F59E0B' },
  { icon: <BarChart2 size={18} />, label: '数据分析', page: null, color: '#22C55E' },
  { icon: <HelpCircle size={18} />, label: '帮助与反馈', page: 'profile-help' as PageKey | null, color: '#9CA3AF' },
];

function ProfileContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'subscription'>('overview');
  const { data: user } = useUser();
  const { data: stats } = useProfileStats();

  const handleNavigate = (page: PageKey, params?: string) => {
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
      case 'hotspot-detail': router.push(`/hotspot/detail${params || ''}`); break;
      case 'hotspot-library': router.push('/hotspot/library'); break;
      case 'notification': router.push('/notification'); break;
      case 'profile-help': router.push('/profile/help'); break;
      case 'profile-settings': router.push('/profile/settings'); break;
      case 'profile-integrations': router.push('/profile/integrations'); break;
      default: router.push('/home'); break;
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('dev_user');
    document.cookie = 'dev_user_id=; path=/; max-age=0';
    router.push('/login');
  };

  const displayName = user?.username || user?.phone || '创作者';
  const userAvatar = user?.username?.charAt(0)?.toUpperCase() || user?.phone?.charAt(0) || '🧑‍💻';
  const planLabel = user?.plan === 'pro' ? 'Pro' : user?.plan === 'creator' ? 'Creator' : '免费';

  const statsArray = [
    { label: '灵感记录', value: String(stats?.inspirationCount ?? 0), icon: <BookOpen size={16} />, color: '#3B82F6' },
    { label: 'AI作品', value: String(stats?.aiWorks ?? 0), icon: <Sparkles size={16} />, color: '#8B5CF6' },
    { label: '热点追踪', value: String(stats?.hotspotCount ?? 0), icon: <TrendingUp size={16} />, color: '#EF4444' },
    { label: '已发布', value: String(stats?.publishedCount ?? 0), icon: <Star size={16} />, color: '#F59E0B' },
  ];

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav
        title="个人中心"
        right={
          <button className="p-1" onClick={() => router.push('/profile/settings')}>
            <Settings size={20} color="#E5E7EB" />
          </button>
        }
      />

      <div className="flex-1 px-4 pt-4 space-y-5">
        {/* Avatar & Info */}
        <GlassCard className="!p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
                  border: '2px solid rgba(59,130,246,0.5)',
                  boxShadow: '0 0 20px rgba(59,130,246,0.3)',
                }}
              >
                {typeof userAvatar === 'string' && userAvatar.length === 1 ? (
                  <span style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 700 }}>{userAvatar}</span>
                ) : (
                  <span>{userAvatar}</span>
                )}
              </div>
              <button
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: '#3B82F6', border: '2px solid rgba(10,22,41,1)' }}
              >
                <Edit3 size={11} color="#FFFFFF" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700 }}>{displayName}</p>
                <GlassBadge color={planLabel === '免费' ? 'default' : 'primary'}>{planLabel}</GlassBadge>
              </div>
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>{user?.phone ? `📱 ${user.phone}` : '欢迎使用灵集'}</p>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-2 mt-5">
            {statsArray.map(({ label, value, icon, color }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${color}20`, border: `1px solid ${color}44` }}
                >
                  <span style={{ color }}>{icon}</span>
                </div>
                <p style={{ color: '#FFFFFF', fontSize: 17, fontWeight: 700 }}>{value}</p>
                <p style={{ color: '#9CA3AF', fontSize: 10 }}>{label}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Tabs */}
        <div className="flex rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {(['overview', 'subscription'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className="flex-1 py-2.5 text-sm transition-all"
              style={{
                color: activeTab === t ? '#3B82F6' : '#9CA3AF',
                background: activeTab === t ? 'rgba(59,130,246,0.15)' : 'transparent',
                fontWeight: activeTab === t ? 600 : 400,
                borderBottom: activeTab === t ? '2px solid #3B82F6' : '2px solid transparent',
              }}
            >
              {t === 'overview' ? '概览' : '订阅管理'}
            </button>
          ))}
        </div>

        {activeTab === 'overview' ? (
          <>
            {/* Weekly Activity */}
            <GlassCard>
              <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 14 }}>本周活跃度</p>
              <div className="flex items-end gap-2 h-16">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => (
                  <div key={label} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-lg"
                      style={{
                        height: (3 + Math.sin(i * 1.5) * 4 + 3) * 4,
                        background: 'linear-gradient(to top, rgba(59,130,246,0.8), rgba(139,92,246,0.6))',
                        boxShadow: '0 -2px 8px rgba(59,130,246,0.3)',
                      }}
                    />
                    <span style={{ color: '#9CA3AF', fontSize: 9 }}>{label}</span>
                  </div>
                ))}
              </div>
              <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 8 }}>本周共使用 42 次 · 较上周 ↑ 18%</p>
            </GlassCard>

            {/* Menu */}
            <GlassCard className="!p-2">
              {menuItems.map(({ icon, label, page, color }) => (
                <button
                  key={label}
                  onClick={() => page && handleNavigate(page)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${color}20`, border: `1px solid ${color}33` }}
                  >
                    <span style={{ color }}>{icon}</span>
                  </div>
                  <span style={{ color: '#E5E7EB', fontSize: 14, flex: 1, textAlign: 'left' }}>{label}</span>
                  <ChevronRight size={16} color="#9CA3AF" />
                </button>
              ))}
            </GlassCard>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}
            >
              <LogOut size={16} /> 退出登录
            </button>
          </>
        ) : (
          <>
            {/* Subscription Cards */}
            <div className="space-y-3">
              {subscriptionTiers.map(({ id, label, features, current, price }) => (
                <GlassCard
                  key={id}
                  className="!p-4"
                  active={current}
                  style={current ? { border: '1px solid rgba(59,130,246,0.6)', background: 'rgba(59,130,246,0.08)' } : undefined}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700 }}>{label}</p>
                        {current && <GlassBadge color="primary">当前套餐</GlassBadge>}
                      </div>
                      <p style={{ color: current ? '#3B82F6' : '#9CA3AF', fontSize: 20, fontWeight: 700 }}>{price}</p>
                    </div>
                    {!current && (
                      <button
                        className="px-4 py-2 rounded-xl text-sm"
                        style={{
                          background: id === 'team' ? 'rgba(139,92,246,0.2)' : 'rgba(59,130,246,0.2)',
                          border: id === 'team' ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(59,130,246,0.4)',
                          color: id === 'team' ? '#C4B5FD' : '#93C5FD',
                          fontSize: 13,
                        }}
                      >
                        升级
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {features.map((f) => (
                      <div key={f} className="flex items-center gap-2">
                        <span style={{ color: current ? '#22C55E' : '#9CA3AF', fontSize: 12 }}>✓</span>
                        <span style={{ color: current ? '#E5E7EB' : '#9CA3AF', fontSize: 12 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              ))}
            </div>

            {/* Usage */}
            <GlassCard>
              <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>本月使用量</p>
              <div className="space-y-3">
                {[
                  { label: 'AI 文案生成', used: 28, total: '无限' },
                  { label: 'AI 图片生成', used: 15, total: '无限' },
                  { label: 'AI 视频生成', used: 6, total: '无限' },
                  { label: '灵感存储', used: 128, total: '无限' },
                ].map(({ label, used, total }) => (
                  <div key={label}>
                    <div className="flex justify-between mb-1.5">
                      <span style={{ color: '#E5E7EB', fontSize: 13 }}>{label}</span>
                      <span style={{ color: '#9CA3AF', fontSize: 12 }}>{used} / {total}</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: '40%', background: 'linear-gradient(to right, #3B82F6, #8B5CF6)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </>
        )}
      </div>

      <BottomNav activePage="profile" onNavigate={handleNavigate} />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  );
}
