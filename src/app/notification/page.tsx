'use client';


import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, TrendingUp, Settings, CheckCheck } from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { ProtectedRoute, LoadingSpinner } from '@/components';

const filters = ['全部', '热点', '系统'];

const priorityConfig: Record<string, { label: string; color: string }> = {
  urgent: { label: '紧急', color: '#EF4444' },
  high: { label: '高', color: '#F97316' },
  medium: { label: '中', color: '#F59E0B' },
  low: { label: '低', color: '#9CA3AF' },
};

const typeIcons: Record<string, { icon: JSX.Element; color: string }> = {
  hotspot: { icon: <TrendingUp size={20} />, color: '#EF4444' },
  system: { icon: <Bell size={20} />, color: '#8B5CF6' },
};

const fallbackNotifications = [
  {
    id: '1', type: 'hotspot',
    title: '紧急热点预警：AI监管新政策发布',
    content: '相关部门发布AI内容监管新规，对内容创作者影响重大。',
    is_read: false, created_at: new Date().toISOString(),
  },
  {
    id: '2', type: 'hotspot',
    title: '新热点：AI创作关键词有新动态',
    content: '检测到3个与您关注领域高度相关的热点。',
    is_read: false, created_at: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: '3', type: 'system',
    title: '系统通知：周报已生成',
    content: '您的创作周报已生成，请查看。',
    is_read: true, created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  content: string;
  is_read: boolean;
  created_at: string;
  priority?: string;
}

function NotificationContent() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('全部');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readState, setReadState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      const res = await fetch(`/api/notification?${params}`);
      const data = await res.json();

      if (data.success && data.data) {
        setNotifications(data.data);
      } else {
        setNotifications(fallbackNotifications);
      }
    } catch {
      setNotifications(fallbackNotifications);
    } finally {
      setIsLoading(false);
    }
  };

  const markAllRead = useCallback(async () => {
    try {
      await fetch('/api/notification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      });
    } catch {}
    setReadState(Object.fromEntries(notifications.map((n) => [n.id, true])));
  }, [notifications]);

  const markOneRead = useCallback(async (id: string) => {
    try {
      await fetch('/api/notification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {}
    setReadState((s) => ({ ...s, [id]: true }));
  }, []);

  const filtered = useMemo(() => {
    if (activeFilter === '全部') return notifications;
    return notifications.filter((n) => n.type === (activeFilter === '热点' ? 'hotspot' : 'system'));
  }, [activeFilter, notifications]);

  const isRead = (n: NotificationItem) => n.is_read || readState[n.id];

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

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = Date.now();
    const diff = now - date.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav
        title="通知中心"
        showBack
        onBack={() => router.push('/profile')}
        right={
          <button
            className="text-xs px-2 py-1 rounded-lg flex items-center gap-1"
            style={{ color: '#3B82F6', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}
            onClick={markAllRead}
          >
            <CheckCheck size={13} /> 全部已读
          </button>
        }
      />

      <div className="flex-1 px-4 pt-4">
        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className="px-4 py-1.5 rounded-lg text-sm transition-all"
              style={{
                background: activeFilter === f ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.07)',
                border: activeFilter === f ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.12)',
                color: activeFilter === f ? '#93C5FD' : '#9CA3AF',
                fontSize: 13,
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && <div className="py-12"><LoadingSpinner /></div>}

        {/* Notification List */}
        {!isLoading && (
          <div className="space-y-3">
            {filtered.map((notif) => {
              const typeIcon = typeIcons[notif.type] || typeIcons.system;
              const read = isRead(notif);
              const priority = priorityConfig[notif.priority || (notif.type === 'hotspot' ? 'high' : 'low')];

              return (
                <GlassCard
                  key={notif.id}
                  hover
                  onClick={() => markOneRead(notif.id)}
                  className="!p-4"
                  style={!read ? { border: '1px solid rgba(59,130,246,0.3)' } : undefined}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: typeIcon.color + '22', border: `1px solid ${typeIcon.color}44` }}
                    >
                      <span style={{ color: typeIcon.color }}>{typeIcon.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="px-1.5 py-0.5 rounded text-xs"
                            style={{ background: priority.color + '22', color: priority.color, border: `1px solid ${priority.color}44`, fontSize: 10 }}
                          >
                            {priority.label}
                          </span>
                          {!read && (
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#3B82F6', boxShadow: '0 0 6px rgba(59,130,246,0.8)' }} />
                          )}
                        </div>
                        <span style={{ color: '#9CA3AF', fontSize: 11, flexShrink: 0 }}>{formatTime(notif.created_at)}</span>
                      </div>
                      <p style={{ color: read ? '#9CA3AF' : '#FFFFFF', fontSize: 13, fontWeight: read ? 400 : 600, marginBottom: 4 }} className="line-clamp-2">
                        {notif.title}
                      </p>
                      <p style={{ color: '#9CA3AF', fontSize: 12, lineHeight: 1.5 }} className="line-clamp-2">{notif.content}</p>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center py-20 gap-4">
            <Bell size={40} color="#9CA3AF" />
            <p style={{ color: '#9CA3AF', fontSize: 14 }}>暂无通知</p>
          </div>
        )}
      </div>

      <BottomNav activePage="profile" onNavigate={handleNavigate} />
    </div>
  );
}

export default function NotificationPage() {
  return (
    <ProtectedRoute>
      <NotificationContent />
    </ProtectedRoute>
  );
}
