'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings, Bell, HelpCircle, LogOut, ChevronRight, Edit3,
  BookOpen, Sparkles, TrendingUp, Star, Wallet, ArrowRight, Globe,
} from 'lucide-react';
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

interface BillingSummary {
  balance: number;
  tier: string;
}

function useProfileStats() {
  return useQuery({
    queryKey: ['user-stats'],
    queryFn: async () => {
      const response = await apiClient.get<UserStats>('/user/stats');
      if (!response.success) throw new Error(response.error);
      return response.data;
    },
    staleTime: 30_000,
  });
}

// 拉真实余额 + 订阅档位(代替硬编码的 planLabel)
function useBillingSummary() {
  return useQuery({
    queryKey: ['billing-summary'],
    queryFn: async () => {
      const r = await apiClient.get<BillingSummary>('/credits');
      if (!r.success) throw new Error(r.error);
      return r.data;
    },
    staleTime: 30_000,
  });
}

const TIER_LABELS: Record<string, string> = {
  free: '免费版',
  basic: '个人版',
  pro: '创作者版',
  studio: '工作室版',
  enterprise: '企业版',
};

const TIER_COLORS: Record<string, string> = {
  free: '#9CA3AF',
  basic: '#67E8F9',
  pro: '#F472B6',
  studio: '#A78BFA',
  enterprise: '#FCD34D',
};

// 菜单项:只保留真实可达的入口
const menuItems = [
  { icon: <Wallet size={18} />, label: '我的灵感点', href: '/profile/billing', color: '#F472B6', desc: '余额 · 流水 · 加油包 · 订阅' },
  { icon: <Bell size={18} />, label: '通知设置', page: 'notification' as PageKey, color: '#3B82F6', desc: '热点预警 · 系统消息' },
  { icon: <TrendingUp size={18} />, label: '热点监控', page: 'hotspot' as PageKey, color: '#EF4444', desc: '关键词驱动的实时追踪' },
  { icon: <BookOpen size={18} />, label: '灵感库', page: 'inspiration' as PageKey, color: '#F59E0B', desc: '查看 / 编辑全部素材' },
  { icon: <Globe size={18} />, label: '平台集成', page: 'profile-integrations' as PageKey, color: '#22C55E', desc: '公众号 / 微博 OAuth 授权' },
  { icon: <Settings size={18} />, label: '账号设置', page: 'profile-settings' as PageKey, color: '#8B5CF6', desc: '账号类型 · 安全 · 密码' },
  { icon: <HelpCircle size={18} />, label: '帮助与反馈', page: 'profile-help' as PageKey, color: '#9CA3AF', desc: '功能说明 · 常见问题' },
];

function ProfileContent() {
  const router = useRouter();
  const { data: user, isLoading: userLoading, error: userError } = useUser();
  const { data: stats, isLoading: statsLoading } = useProfileStats();
  const { data: billing } = useBillingSummary();

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
    if (typeof window !== 'undefined') {
      // 清除 dev auth
      localStorage.removeItem('dev_user');
      // 清除 Supabase auth cookies
      document.cookie.split(';').forEach(c => {
        const name = c.trim().split('=')[0];
        if (name) {
          document.cookie = `${name}=; path=/; max-age=0; domain=.zjsifan.com`;
          document.cookie = `${name}=; path=/; max-age=0; domain=ai.zjsifan.com`;
          document.cookie = `${name}=; path=/; max-age=0`;
        }
      });
    }
    router.push('/login');
  };

  const displayName = user?.username || user?.phone || '创作者';
  const userAvatar = user?.username?.charAt(0)?.toUpperCase() || user?.phone?.charAt(0) || '🧑‍💻';

  // 真实 tier + 余额(代替硬编码的 planLabel='免费')
  const tier = billing?.tier || 'free';
  const tierLabel = TIER_LABELS[tier] || tier;
  const tierColor = TIER_COLORS[tier] || '#9CA3AF';
  const balance = billing?.balance ?? 0;

  const statsArray = [
    { label: '灵感记录', value: String(stats?.inspirationCount ?? 0), icon: <BookOpen size={16} />, color: '#3B82F6' },
    { label: 'AI 作品', value: String(stats?.aiWorks ?? 0), icon: <Sparkles size={16} />, color: '#8B5CF6' },
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

      <div className="flex-1 px-4 pt-4 space-y-4">
        {userLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : userError ? (
          <GlassCard className="!p-5 text-center">
            <p style={{ color: '#FCA5A5', fontSize: 14 }}>加载用户信息失败</p>
            <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>{(userError as Error)?.message}</p>
          </GlassCard>
        ) : (
          <>
        {/* 头像 + 名字 + 真实订阅档位 */}
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
                onClick={() => router.push('/profile/settings')}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: '#3B82F6', border: '2px solid rgba(10,22,41,1)' }}
                title="编辑资料"
              >
                <Edit3 size={11} color="#FFFFFF" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700 }}>{displayName}</p>
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                  style={{ background: `${tierColor}20`, color: tierColor, border: `1px solid ${tierColor}44` }}
                >
                  {tierLabel}
                </span>
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

        {/* 我的灵感点 — 真实余额卡片(原「我的灵感点」+「订阅管理」合并入口) */}
        <GlassCard
          className="!p-4 cursor-pointer"
          onClick={() => router.push('/profile/billing')}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(244,114,182,0.2), rgba(236,72,153,0.15))', border: '1px solid rgba(244,114,182,0.4)' }}
            >
              <Wallet size={22} color="#F472B6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 700 }}>{balance.toLocaleString()}</span>
                <span style={{ color: '#9CA3AF', fontSize: 12 }}>credits</span>
              </div>
              <p style={{ color: '#9CA3AF', fontSize: 11 }} className="mt-0.5">
                余额 · {tierLabel} · 加油包 / 流水 / 取消订阅
              </p>
            </div>
            <ArrowRight size={16} color="#9CA3AF" />
          </div>
        </GlassCard>

        {/* 菜单 — 全部真实可达,删除重复/死链 */}
        <GlassCard className="!p-2">
          {menuItems.map(({ icon, label, page, href, color, desc }) => (
            <button
              key={label}
              onClick={() => {
                if (href) router.push(href);
                else if (page) handleNavigate(page);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}20`, border: `1px solid ${color}33` }}
              >
                <span style={{ color }}>{icon}</span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 500 }}>{label}</p>
                <p style={{ color: '#6B7280', fontSize: 10 }} className="mt-0.5">{desc}</p>
              </div>
              <ChevronRight size={16} color="#9CA3AF" />
            </button>
          ))}
        </GlassCard>

        {/* 退出登录 */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}
        >
          <LogOut size={16} /> 退出登录
        </button>
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
