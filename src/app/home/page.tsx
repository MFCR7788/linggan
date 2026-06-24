"use client";

import { Search, Bell, TrendingUp, ChevronRight, FileText, BookOpen, Radio, Sparkles, Flame, Calendar, Plus, Play } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { PageKey } from "@/components/BottomNav";
import { LoadingSpinner, EmptyState, ProtectedRoute } from "@/components";
import { useToast } from "@/components/Toast";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/hooks/use-page-title";
import { useInspirations } from "@/hooks/use-inspiration";
import { useSchedules, useCreateSchedule, useUpdateSchedule } from "@/hooks/use-schedule";
import { useNotificationScheduler } from "@/hooks/use-notification-scheduler";
import { useSwipe } from "@/hooks/use-swipe";
import { TYPE_EMOJIS, PAGE_ROUTES } from "@/lib/style-constants";
import type { ContentItem, Schedule } from "@/types";

function ScheduleCard({ schedule, onComplete, onNavigate }: {
  schedule: Schedule;
  onComplete: (id: string) => void;
  onNavigate: () => void;
}) {
  const scheduleDate = new Date(schedule.scheduled_at);
  const isToday = scheduleDate.toDateString() === new Date().toDateString();
  const isTomorrow = new Date(Date.now() + 86400000).toDateString() === scheduleDate.toDateString();
  const swipe = useSwipe({
    onSwipeRight: () => onComplete(schedule.id),
  });

  return (
    <GlassCard
      hover
      onClick={onNavigate}
      className="!p-4 touch-pan-y"
      {...swipe}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center"
          style={{
            background: `${schedule.color || "#3B82F6"}22`,
            border: `1px solid ${schedule.color || "#3B82F6"}44`,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: schedule.color || "#3B82F6", lineHeight: 1 }}>
            {scheduleDate.getDate()}
          </span>
          <span style={{ fontSize: 10, color: schedule.color || "#3B82F6", lineHeight: 1 }}>
            {scheduleDate.toLocaleDateString("zh-CN", { month: "short" })}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <p className="text-body text-white font-semibold truncate">
                {schedule.title}
              </p>
              {schedule.remind_before && schedule.remind_before > 0 && (
                <Bell size={12} color="#8B5CF6" className="flex-shrink-0" />
              )}
            </div>
            <GlassBadge color="primary">待处理</GlassBadge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: "#9CA3AF" }}>
              {isToday ? "今天" : isTomorrow ? "明天" : `${scheduleDate.getMonth() + 1}月${scheduleDate.getDate()}日`}
              {" "}
              {scheduleDate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {schedule.location && (
              <>
                <span style={{ color: "#4B5563" }}>·</span>
                <span className="text-xs truncate" style={{ color: "#9CA3AF" }}>
                  {schedule.location}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs mt-2 text-right" style={{ color: 'rgba(255,255,255,0.2)' }}>← 右滑完成</p>
    </GlassCard>
  );
}

interface HotTopic {
  id: number;
  heat: string;
  title: string;
  platform: string;
  platformColor: string;
}

const platformColors: Record<string, string> = {
  weibo: '#E0534A', 微博: '#E0534A',
  zhihu: '#3B82F6', 知乎: '#3B82F6',
  xiaohongshu: '#F43F5E', 小红书: '#F43F5E',
  douyin: '#FFFFFF', 抖音: '#FFFFFF',
  bilibili: '#FB7299', B站: '#FB7299',
};

function HomeContent() {
  const router = useRouter();
  const { data: inspirationsData, isLoading } = useInspirations({ limit: 50 });
  const { data: schedulesData, isLoading: schedulesLoading, isError: schedulesError } = useSchedules({ limit: 50 });
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const { showToast } = useToast();
  useNotificationScheduler();
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const handleSearchInput = (value: string) => {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(value), 300);
  };
  const clearSearch = () => {
    setInputValue("");
    setSearchQuery("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [hotLoading, setHotLoading] = useState(true);
  const [executingIds, setExecutingIds] = useState<Set<string>>(new Set());
  usePageTitle('首页');

  useEffect(() => {
    fetch('/api/hotspot?limit=5')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setHotTopics(data.data.map((item: any, i: number) => ({
            id: item.id || i + 1,
            heat: item.heatScore ? `🔥 ${item.heatScore.toFixed(1)}` : '🔥 热门',
            title: item.title,
            platform: item.platform || '通用',
            platformColor: platformColors[item.platform] || '#9CA3AF',
          })));
        }
      })
      .catch((e) => { console.error('[Home] 热点加载失败:', e); })
      .finally(() => setHotLoading(false));
  }, []);

  const recentInspirations = useMemo(() => inspirationsData || [], [inspirationsData]);

  // 日程：显示最近5条待处理的，优先未来，其次最近过去
  const sortedSchedules = useMemo(() => {
    if (!schedulesData || schedulesData.length === 0) return [];
    const pending = schedulesData.filter(s => s.status === 'pending');
    if (pending.length === 0) return [];
    const now = new Date();
    return pending
      .sort((a, b) => {
        const aTime = new Date(a.scheduled_at || 0).getTime();
        const bTime = new Date(b.scheduled_at || 0).getTime();
        const aIsFuture = aTime >= now.getTime();
        const bIsFuture = bTime >= now.getTime();
        if (aIsFuture && bIsFuture) return aTime - bTime;
        if (!aIsFuture && !bIsFuture) return bTime - aTime;
        return aIsFuture ? -1 : 1;
      })
      .slice(0, 5);
  }, [schedulesData]);

  // 过滤灵感
  const filteredInspirations = useMemo(() => {
    if (searchQuery.trim() === "") return recentInspirations;
    const query = searchQuery.toLowerCase();
    return recentInspirations.filter(item =>
      (item.title && item.title.toLowerCase().includes(query)) ||
      (item.original_text && item.original_text.toLowerCase().includes(query)) ||
      (item.type && item.type.toLowerCase().includes(query))
    );
  }, [searchQuery, recentInspirations]);

  // 过滤热点
  const filteredHotTopics = useMemo(() => {
    if (searchQuery.trim() === "") return hotTopics;
    const query = searchQuery.toLowerCase();
    return hotTopics.filter(item =>
      item.title.toLowerCase().includes(query) ||
      item.platform.toLowerCase().includes(query)
    );
  }, [searchQuery, hotTopics]);

  const hasSearchResults = searchQuery.trim() !== "" && (filteredInspirations.length > 0 || filteredHotTopics.length > 0);
  const hasNoResults = searchQuery.trim() !== "" && filteredInspirations.length === 0 && filteredHotTopics.length === 0;

  const handleNavigate = (page: PageKey) => {
    router.push(PAGE_ROUTES[page] || "/home");
  };

  const handleExecute = async (e: React.MouseEvent, item: ContentItem) => {
    e.stopPropagation();
    const itemId = item.id;
    setExecutingIds(prev => new Set(prev).add(itemId));
    try {
      const tomorrow = new Date(Date.now() + 86400000);
      tomorrow.setHours(9, 0, 0, 0);
      await createSchedule.mutateAsync({
        title: item.title || item.prompt || '未命名灵感',
        scheduled_at: tomorrow.toISOString(),
        color: '#3B82F6',
        source_content_id: item.id,
      });
      showToast('已添加到明日待办 ✨', 'success');
    } catch {
      showToast('添加失败，请重试', 'error');
    } finally {
      setExecutingIds(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <TopNav
        title={
          <div className="flex items-center gap-2">
            <img src="/brand/logo-mark.svg" alt="灵集" className="w-7 h-7" />
            <span style={{ color: "#E5E7EB", fontWeight: 700, fontSize: 18 }}>灵集</span>
          </div>
        }
        right={
          <button onClick={() => handleNavigate("notification")} className="relative p-1">
            <Bell size={22} color="#E5E7EB" />
            <span className="absolute top-0 right-0 w-2 h-2 rounded-full" style={{ background: "#EF4444" }} />
          </button>
        }
      />

      <div className="flex-1 px-4 pt-4 pb-24 space-y-5">
        {/* 问候 + 数据概览 */}
        <div className="px-1">
          <h1 className="text-h1 text-white">你好，创作者</h1>
          <p className="text-aux mt-1">今天有什么灵感？</p>
          {/* 概览数据 */}
          <div className="flex gap-3 mt-4">
            {[
              { label: '待办', count: sortedSchedules.length, color: '#F59E0B', onClick: () => router.push('/schedule') },
              { label: '灵感', count: recentInspirations.length, color: '#3B82F6', onClick: () => router.push('/inspiration') },
              { label: '热点', count: hotTopics.length, color: '#EF4444', onClick: () => router.push('/hotspot') },
            ].map(({ label, count, color, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="flex-1 rounded-xl p-3 text-center transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <p className="text-h1" style={{ color }}>{count}</p>
                <p className="text-aux">{label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 快捷入口一行 */}
        <div className="flex gap-2">
          {[
            { key: "capture", label: "快速采集", emoji: "✍️", color: "#3B82F6" },
            { key: "inspiration", label: "灵感库", emoji: "💡", color: "#8B5CF6" },
            { key: "agent", label: "AI助手", emoji: "🤖", color: "#10B981" },
          ].map(({ key, label, emoji, color }) => (
            <button
              key={key}
              onClick={() => handleNavigate(key as PageKey)}
              className="flex-1 flex items-center gap-2 px-3 py-3 rounded-xl transition-all active:scale-95"
              style={{
                background: `${color}18`,
                border: `1px solid ${color}33`,
              }}
            >
              <span style={{ fontSize: 20 }}>{emoji}</span>
              <span className="text-body text-white font-semibold">{label}</span>
            </button>
          ))}
        </div>

        {/* 日程安排 */}
        {!searchQuery && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-h2 text-white">日程安排</h3>
              <button onClick={() => handleNavigate("schedule")} className="flex items-center gap-1 text-aux">
                查看全部 <ChevronRight size={14} />
              </button>
            </div>

            {schedulesLoading ? (
              <GlassCard className="!p-5 text-center">
                <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin mx-auto" />
                <p className="text-aux mt-2">加载日程...</p>
              </GlassCard>
            ) : schedulesError ? (
              <GlassCard className="!p-5 text-center">
                <span style={{ fontSize: 32 }}>⚠️</span>
                <p className="text-body mt-2 mb-1" style={{ color: "#F87171" }}>日程加载失败</p>
                <p className="text-sm" style={{ color: "#6B7280" }}>请检查数据库连接或稍后重试</p>
              </GlassCard>
            ) : sortedSchedules.length > 0 ? (
              <div className="space-y-3">
                {sortedSchedules.map((schedule) => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    onComplete={async (id) => {
                      try {
                        await updateSchedule.mutateAsync({ id, data: { status: 'completed' } });
                        showToast('已完成 ✓', 'success');
                      } catch { showToast('操作失败', 'error'); }
                    }}
                    onNavigate={() => router.push("/schedule")}
                  />
                ))}
              </div>
            ) : (
              <GlassCard className="!p-5 text-center">
                <span style={{ fontSize: 32 }}>📅</span>
                <p className="text-body mt-2 mb-1" style={{ color: "#9CA3AF" }}>暂无日程安排</p>
                <p className="text-sm mb-3" style={{ color: "#6B7280" }}>
                  在灵感助手中输入"明天下午3点开会"，<br />AI 会帮你自动提取并添加日程
                </p>
                <button
                  onClick={() => handleNavigate("capture")}
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ background: "linear-gradient(135deg, #3B82F6, #8B5CF6)" }}
                >
                  去灵感助手
                </button>
              </GlassCard>
            )}
          </div>
        )}

        {/* Search */}
        <div
          className="flex items-center gap-3 px-4 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            height: 44,
            backdropFilter: "blur(8px)",
          }}
        >
          <Search size={18} color="#9CA3AF" />
          <input
            type="text"
            placeholder="搜索灵感和热点..."
            value={inputValue}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="flex-1 bg-transparent outline-none text-body"
            style={{ color: "#E5E7EB" }}
          />
          {searchQuery && (
            <button onClick={clearSearch} className="p-1 rounded-full hover:bg-white/10">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* 搜索结果提示 */}
        {searchQuery && (
          <div className="px-2">
            <p className="text-sm" style={{ color: "#9CA3AF" }}>
              搜索 "{searchQuery}" 的结果
            </p>
          </div>
        )}

        {/* Recent Inspirations */}
        <div style={{ display: searchQuery && filteredInspirations.length === 0 ? "none" : "block" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-h2 text-white">
              {searchQuery ? "灵感搜索结果" : "最近灵感"}
            </h3>
            <button onClick={() => handleNavigate("inspiration")} className="flex items-center gap-1 text-aux">
              查看全部 <ChevronRight size={14} />
            </button>
          </div>

          {isLoading ? (
            <div className="py-8">
              <LoadingSpinner text="加载中..." />
            </div>
          ) : filteredInspirations.length === 0 && !searchQuery ? (
            <EmptyState
              icon={<FileText size={32} color="#9CA3AF" />}
              title="还没有灵感"
              description="点击下方按钮，开始记录你的第一个灵感"
            />
          ) : filteredInspirations.length > 0 ? (
            <div className="columns-2 gap-3 [&>*]:[break-inside:avoid]">
              {filteredInspirations.slice(0, 10).map((item: ContentItem) => {
                const isImage = item.type === 'image';
                const isVideo = item.type === 'video';
                const isAudio = item.type === 'audio' || item.type === 'voice';
                const imageCoverUrl = isImage ? (item.media_urls?.[0] || item.thumbnail_url) : null;
                const videoCoverUrl = isVideo ? (item.thumbnail_url || null) : null;
                const showImageCover = !!imageCoverUrl;
                const showVideoCover = isVideo && !!videoCoverUrl;
                const showVideoPlaceholder = isVideo && !videoCoverUrl;
                const isExecuting = executingIds.has(item.id);

                return (
                <GlassCard
                  key={item.id}
                  hover
                  onClick={() => router.push(`/inspiration/detail?id=${item.id}`)}
                  className="!p-0 mb-3 overflow-hidden"
                >
                  {/* 图片封面 */}
                  {showImageCover && (
                    <div className="relative w-full bg-gray-900/50">
                      <img
                        src={imageCoverUrl!}
                        alt={item.title || ''}
                        loading="lazy"
                        className="w-full object-cover"
                        style={{ maxHeight: 200 }}
                      />
                    </div>
                  )}
                  {/* 视频封面（有缩略图） */}
                  {showVideoCover && (
                    <div className="relative w-full bg-gray-900/50">
                      <img
                        src={videoCoverUrl!}
                        alt={item.title || ''}
                        loading="lazy"
                        className="w-full object-cover"
                        style={{ maxHeight: 200 }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                          <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 视频占位（无缩略图） */}
                  {showVideoPlaceholder && (
                    <div className="relative w-full bg-gray-900/50 flex items-center justify-center py-12" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(168,85,247,0.08))' }}>
                      <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                        <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  )}
                  {isAudio ? (
                    <div className="flex items-center justify-center py-8" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.08))' }}>
                      <svg className="w-8 h-8 text-green-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                  ) : null}

                  {/* 文字信息 */}
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-aux">{TYPE_EMOJIS[item.type] || '✨'}</span>
                      <span className="text-xs" style={{ color: '#6B7280' }}>
                        {new Date(item.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                    <p className="text-body text-white font-semibold line-clamp-2" style={{ lineHeight: 1.4 }}>
                      {item.title || item.prompt || item.original_text?.substring(0, 40) || '未命名灵感'}
                    </p>
                    {item.original_text && item.original_text !== (item.title || '') && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: '#9CA3AF', lineHeight: 1.4 }}>
                        {item.original_text}
                      </p>
                    )}
                    {/* → 执行按钮 */}
                    <button
                      onClick={(e) => handleExecute(e, item)}
                      disabled={isExecuting}
                      className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
                      style={{
                        background: 'rgba(59,130,246,0.15)',
                        color: '#93C5FD',
                        border: '1px solid rgba(59,130,246,0.25)',
                      }}
                    >
                      {isExecuting ? (
                        <span className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                      ) : (
                        <Play size={12} />
                      )}
                      {isExecuting ? '添加中...' : '→ 执行'}
                    </button>
                  </div>
                </GlassCard>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Hot Topics */}
        <div style={{ display: searchQuery && filteredHotTopics.length === 0 ? "none" : "block" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-h2 text-white">
              {searchQuery ? "热点搜索结果" : "最新热点"}
            </h3>
            <button onClick={() => handleNavigate("hotspot")} className="flex items-center gap-1 text-aux">
              查看全部 <ChevronRight size={14} />
            </button>
          </div>
          {filteredHotTopics.length > 0 ? (
            <div className="space-y-3">
              {filteredHotTopics.slice(0, 5).map((item) => (
                <GlassCard
                  key={item.id}
                  hover
                  onClick={() => router.push(`/hotspot/detail?id=${item.id}`)}
                  className="!p-4"
                >
                  <div className="flex items-start gap-3">
                    <span style={{ fontSize: 28 }}>🔥</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex gap-1.5">
                          <span className="text-xs font-semibold" style={{ color: "#EF4444" }}>{item.heat}</span>
                          <GlassBadge style={{ background: item.platformColor + "33", color: item.platformColor, border: `1px solid ${item.platformColor}44` }}>
                            {item.platform}
                          </GlassBadge>
                        </div>
                        <button
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs"
                          style={{ background: "rgba(59,130,246,0.2)", color: "#93C5FD", border: "1px solid rgba(59,130,246,0.3)" }}
                          onClick={(e) => { e.stopPropagation(); handleNavigate("inspiration"); }}
                        >
                          <TrendingUp size={12} /> 一键转灵感
                        </button>
                      </div>
                      <p className="text-body text-white font-semibold line-clamp-2">
                        {item.title}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : null}
        </div>

        {/* 无搜索结果提示 */}
        {hasNoResults && (
          <GlassCard className="!p-6 text-center">
            <Search size={32} color="#9CA3AF" className="mx-auto mb-3" />
            <p className="text-body text-white font-semibold mb-1">没有找到相关结果</p>
            <p className="text-sm" style={{ color: "#9CA3AF" }}>试试其他关键词</p>
          </GlassCard>
        )}
      </div>

      {/* 浮动 "+" 快速采集按钮 */}
      <button
        onClick={() => handleNavigate("capture")}
        className="fixed right-4 bottom-24 z-30 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 hover:scale-105"
        style={{
          background: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
          boxShadow: "0 4px 24px rgba(59,130,246,0.45)",
        }}
      >
        <Plus size={28} color="#FFFFFF" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <HomeContent />
    </ProtectedRoute>
  );
}
