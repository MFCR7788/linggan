"use client";

import { Search, Bell, TrendingUp, ChevronRight, FileText, BookOpen, Radio, Sparkles, Flame, Calendar } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { PageKey } from "@/components/BottomNav";
import { LoadingSpinner, EmptyState, ProtectedRoute } from "@/components";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/hooks/use-page-title";
import { useInspirations } from "@/hooks/use-inspiration";
import { useSchedules } from "@/hooks/use-schedule";
import { useNotificationScheduler } from "@/hooks/use-notification-scheduler";
import { TYPE_EMOJIS, PAGE_ROUTES } from "@/lib/style-constants";
import type { ContentItem } from "@/types";

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
        // 未来的排在前（升序），过去的排在后（降序，最近过去优先）
        if (aIsFuture && bIsFuture) return aTime - bTime;
        if (!aIsFuture && !bIsFuture) return bTime - aTime;
        return aIsFuture ? -1 : 1;
      })
      .slice(0, 5);
  }, [schedulesData]);

  // 过滤灵感（使用 useMemo 避免每次渲染重复计算）
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

  // 检查是否有搜索结果
  const hasSearchResults = searchQuery.trim() !== "" && (filteredInspirations.length > 0 || filteredHotTopics.length > 0);
  const hasNoResults = searchQuery.trim() !== "" && filteredInspirations.length === 0 && filteredHotTopics.length === 0;

  const handleNavigate = (page: PageKey) => {
    router.push(PAGE_ROUTES[page] || "/home");
  };

  return (
    <div className="flex flex-col min-h-screen">
      <TopNav
        title={
          <div className="flex items-center gap-2">
            <img src="/brand/logo-mark.png" alt="灵集" className="w-7 h-7" />
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
        {/* 问候语 */}
        <div className="px-1">
          <h2 style={{ color: "#FFFFFF", fontSize: 24, fontWeight: 700 }}>
            你好，创作者
          </h2>
          <p style={{ color: "#9CA3AF", fontSize: 14, marginTop: 4 }}>
            今天有什么灵感？
          </p>
        </div>

        {/* 快捷入口 2x2 网格 */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "inspiration", label: "灵感库", Icon: BookOpen, color: "#3B82F6", desc: "管理你的灵感" },
            { key: "hotspot", label: "热点雷达", Icon: Radio, color: "#EF4444", desc: "追踪热门话题" },
            { key: "ai", label: "AI创作", Icon: Sparkles, color: "#8B5CF6", desc: "AI 辅助创作" },
            { key: "schedule", label: "日程管理", Icon: Calendar, color: "#10B981", desc: "查看日程安排" },
          ].map(({ key, label, Icon, color, desc }) => (
            <button
              key={key}
              onClick={() => handleNavigate(key as PageKey)}
              className="flex flex-col items-start p-4 rounded-xl text-left transition-all active:scale-95"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(8px)",
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{
                  background: `${color}22`,
                  border: `1px solid ${color}44`,
                }}
              >
                <Icon size={22} color={color} />
              </div>
              <span style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 600 }}>{label}</span>
              <span style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>{desc}</span>
            </button>
          ))}
        </div>

        {/* 日程安排 */}
        {!searchQuery && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 600 }}>
                日程安排
              </h3>
              <button
                onClick={() => handleNavigate("schedule")}
                className="flex items-center gap-1"
                style={{ color: "#3B82F6", fontSize: 13 }}
              >
                查看全部 <ChevronRight size={14} />
              </button>
            </div>

            {schedulesLoading ? (
              <GlassCard className="!p-5 text-center">
                <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin mx-auto" />
                <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 8 }}>加载日程...</p>
              </GlassCard>
            ) : schedulesError ? (
              <GlassCard className="!p-5 text-center">
                <span style={{ fontSize: 32 }}>⚠️</span>
                <p style={{ color: "#F87171", fontSize: 14, marginTop: 8, marginBottom: 4 }}>
                  日程加载失败
                </p>
                <p style={{ color: "#6B7280", fontSize: 12, lineHeight: 1.5 }}>
                  请检查数据库连接或稍后重试
                </p>
              </GlassCard>
            ) : sortedSchedules.length > 0 ? (
              <div className="space-y-3">
                {sortedSchedules.map((schedule) => {
                  const scheduleDate = new Date(schedule.scheduled_at);
                  const isToday = scheduleDate.toDateString() === new Date().toDateString();
                  const isTomorrow = new Date(Date.now() + 86400000).toDateString() === scheduleDate.toDateString();
                  const statusColor = "primary";
                  const statusLabel = "待处理";

                  return (
                    <GlassCard
                      key={schedule.id}
                      hover
                      onClick={() => router.push("/schedule")}
                      className="!p-4"
                    >
                      <div className="flex items-center gap-3">
                        {/* 日期徽章 */}
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
                              <p
                                style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600 }}
                                className="truncate"
                              >
                                {schedule.title}
                              </p>
                              {schedule.remind_before && schedule.remind_before > 0 && (
                                <Bell size={12} color="#8B5CF6" className="flex-shrink-0" />
                              )}
                            </div>
                            <GlassBadge color={statusColor as "success" | "error" | "primary"}>
                              {statusLabel}
                            </GlassBadge>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span style={{ color: "#9CA3AF", fontSize: 12 }}>
                              {isToday ? "今天" : isTomorrow ? "明天" : `${scheduleDate.getMonth() + 1}月${scheduleDate.getDate()}日`}
                              {" "}
                              {scheduleDate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {schedule.location && (
                              <>
                                <span style={{ color: "#4B5563" }}>·</span>
                                <span style={{ color: "#9CA3AF", fontSize: 12 }} className="truncate">
                                  {schedule.location}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            ) : (
              <GlassCard className="!p-5 text-center">
                <span style={{ fontSize: 32 }}>📅</span>
                <p style={{ color: "#9CA3AF", fontSize: 14, marginTop: 8, marginBottom: 4 }}>
                  暂无日程安排
                </p>
                <p style={{ color: "#6B7280", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
                  在灵感助手中输入&ldquo;明天下午3点开会&rdquo;，<br />AI 会帮你自动提取并添加日程
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
            className="flex-1 bg-transparent outline-none"
            style={{
              color: "#E5E7EB",
              fontSize: 14,
              border: "none",
              background: "transparent"
            }}
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="p-1 rounded-full hover:bg-white/10"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* 搜索结果提示 */}
        {searchQuery && (
          <div className="px-2">
            <p style={{ color: "#9CA3AF", fontSize: 12 }}>
              搜索 &quot;{searchQuery}&quot; 的结果
            </p>
          </div>
        )}

        {/* Recent Inspirations */}
        <div style={{ display: searchQuery && filteredInspirations.length === 0 ? "none" : "block" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 600 }}>
              {searchQuery ? "灵感搜索结果" : "最近灵感"}
            </h3>
            <button
              onClick={() => handleNavigate("inspiration")}
              className="flex items-center gap-1"
              style={{ color: "#3B82F6", fontSize: 13 }}
            >
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
              {filteredInspirations.slice(0, 5).map((item: ContentItem) => {
                const coverUrl = item.media_urls?.[0] || item.thumbnail_url;
                const isImage = item.type === 'image';
                const isVideo = item.type === 'video';
                const isAudio = item.type === 'audio' || item.type === 'voice';
                const showCover = (isImage || isVideo) && coverUrl;

                return (
                <GlassCard
                  key={item.id}
                  hover
                  onClick={() => router.push(`/inspiration/detail?id=${item.id}`)}
                  className="!p-0 mb-3 overflow-hidden"
                >
                  {/* 图片/视频 — 封面图 */}
                  {showCover ? (
                    <div className="relative w-full bg-gray-900/50">
                      <img
                        src={coverUrl}
                        alt={item.title || ''}
                        loading="lazy"
                        className="w-full object-cover"
                        style={{ maxHeight: 200 }}
                      />
                      {isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : isAudio ? (
                    /* 音频 — 渐变占位 */
                    <div className="flex items-center justify-center py-8" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.08))' }}>
                      <svg className="w-8 h-8 text-green-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                  ) : null}

                  {/* 文字信息 */}
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span style={{ fontSize: 13 }}>{TYPE_EMOJIS[item.type] || '✨'}</span>
                      <span style={{ color: '#6B7280', fontSize: 10 }}>
                        {new Date(item.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                    <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }} className="line-clamp-2">
                      {item.title || item.prompt || item.original_text?.substring(0, 40) || '未命名灵感'}
                    </p>
                    {item.original_text && item.original_text !== (item.title || '') && (
                      <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 4, lineHeight: 1.4 }} className="line-clamp-2">
                        {item.original_text}
                      </p>
                    )}
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
            <h3 style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 600 }}>
              {searchQuery ? "热点搜索结果" : "最新热点"}
            </h3>
            <button
              onClick={() => handleNavigate("hotspot")}
              className="flex items-center gap-1"
              style={{ color: "#3B82F6", fontSize: 13 }}
            >
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
                          <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }}>{item.heat}</span>
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
                      <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600 }} className="line-clamp-2">
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
            <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              没有找到相关结果
            </p>
            <p style={{ color: "#9CA3AF", fontSize: 12 }}>
              试试其他关键词
            </p>
          </GlassCard>
        )}
      </div>

      
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
