"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { Search, Zap, CheckCircle, Upload, Trash2, CheckSquare, Square, X, ChevronDown, Play, MapPin, Clock } from "lucide-react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute, LoadingSpinner, EmptyState } from "@/components";
import { useInspirations, useCreateInspiration, useDeleteInspiration, useBatchDeleteInspiration } from "@/hooks/use-inspiration";
import { useTags } from "@/hooks/use-categories";
import { useSchedules } from "@/hooks/use-schedule";
import { TYPE_EMOJIS, TYPE_LABELS, STATUS_LABELS, PAGE_ROUTES } from "@/lib/style-constants";

// ====== 常量 ======

const typeFilters = ["全部", "灵感", "图片", "视频"];

const typeMap: Record<string, string | undefined> = {
  "全部": undefined,
  "灵感": "text",
  "图片": "image",
  "视频": "video",
};

const TIME_RANGES = [
  { label: "全部", value: "" },
  { label: "今天", value: "today" },
  { label: "本周", value: "week" },
  { label: "本月", value: "month" },
  { label: "近3个月", value: "quarter" },
];

const SORT_OPTIONS = [
  { label: "最新优先", sortBy: "created_at", sortOrder: "desc" },
  { label: "最早优先", sortBy: "created_at", sortOrder: "asc" },
  { label: "标题 A-Z", sortBy: "title", sortOrder: "asc" },
  { label: "标题 Z-A", sortBy: "title", sortOrder: "desc" },
];

function getDateRange(value: string): { startDate?: string; endDate?: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();

  switch (value) {
    case "today":
      return { startDate: startOfDay(now), endDate: endOfDay(now) };
    case "week": {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      return { startDate: startOfDay(weekStart), endDate: endOfDay(now) };
    }
    case "month": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: startOfDay(monthStart), endDate: endOfDay(now) };
    }
    case "quarter": {
      const quarterStart = new Date(now);
      quarterStart.setMonth(now.getMonth() - 3);
      return { startDate: startOfDay(quarterStart), endDate: endOfDay(now) };
    }
    default:
      return {};
  }
}

// ====== 简易日历组件 ======

function SimpleCalendar({ events, onDateClick }: { events: Map<string, any[]>; onDateClick?: (date: string) => void }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

  const isToday = (day: number) =>
    today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;

  const getDateKey = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.07)" }}>
          <ChevronDown size={16} color="#9CA3AF" style={{ transform: "rotate(90deg)" }} />
        </button>
        <span style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 600 }}>
          {viewYear}年{viewMonth + 1}月
        </span>
        <button onClick={nextMonth} className="p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.07)" }}>
          <ChevronDown size={16} color="#9CA3AF" style={{ transform: "rotate(-90deg)" }} />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {weekDays.map((d) => (
          <div key={d} className="text-center py-1" style={{ color: "#6B7280", fontSize: 11 }}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateKey = getDateKey(day);
          const hasEvents = events.has(dateKey);
          const isCurToday = isToday(day);

          return (
            <button
              key={day}
              onClick={() => hasEvents && onDateClick?.(dateKey)}
              className="aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all"
              style={{
                background: isCurToday ? "rgba(59,130,246,0.2)" : hasEvents ? "rgba(139,92,246,0.15)" : "transparent",
                border: isCurToday ? "1px solid rgba(59,130,246,0.4)" : "1px solid transparent",
              }}
            >
              <span style={{
                color: isCurToday ? "#93C5FD" : "#D1D5DB",
                fontSize: 13,
                fontWeight: isCurToday ? 600 : 400,
              }}>
                {day}
              </span>
              {hasEvents && (
                <div className="w-1 h-1 rounded-full mt-0.5" style={{ background: "#8B5CF6" }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ====== 主组件 ======

function InspirationLibraryContent() {
  const [activeFilter, setActiveFilter] = useState("全部");
  const [showSavedTip, setShowSavedTip] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleteTip, setShowDeleteTip] = useState<string | null>(null);

  // 筛选状态
  const [timeRange, setTimeRange] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState(0); // index into SORT_OPTIONS
  const [openDropdown, setOpenDropdown] = useState<"time" | "tag" | "sort" | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // 获取标签列表
  const { data: tags = [] } = useTags();

  // 计算时间范围参数
  const dateParams = getDateRange(timeRange);

  const { data: inspirations, isLoading } = useInspirations({
    type: typeMap[activeFilter] as any,
    limit: 50,
    ...dateParams,
    sortBy: SORT_OPTIONS[sortKey].sortBy,
    sortOrder: SORT_OPTIONS[sortKey].sortOrder,
    tagIds: selectedTagIds.size > 0 ? Array.from(selectedTagIds).join(",") : undefined,
  });

  const createInspiration = useCreateInspiration();
  const deleteInspiration = useDeleteInspiration();
  const batchDelete = useBatchDeleteInspiration();

  const { data: schedules = [] } = useSchedules({ limit: 10 });

  const items = inspirations || [];

  // 按日期分组（用于日历视图）
  const calendarEvents = useMemo(() => {
    const map = new Map<string, any[]>();
    items.forEach((item: any) => {
      const dateKey = item.created_at?.substring(0, 10);
      if (dateKey) {
        if (!map.has(dateKey)) map.set(dateKey, []);
        map.get(dateKey)!.push(item);
      }
    });
    return map;
  }, [items]);

  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string | null>(null);

  const isSelecting = selectionMode;
  const isScheduleType = activeFilter === "日程";

  const handleNavigate = (page: PageKey, id?: string) => {
    if (page === "inspiration-detail") {
      router.push(id ? `/inspiration/detail?id=${id}` : "/inspiration/detail");
      return;
    }
    router.push(PAGE_ROUTES[page] || "/home");
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i: any) => i.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除 ${selectedIds.size} 条灵感吗？`)) return;
    await batchDelete.mutateAsync(Array.from(selectedIds));
    const count = selectedIds.size;
    setSelectedIds(new Set());
    setSelectionMode(false);
    setShowDeleteTip(`成功删除 ${count} 条灵感`);
    router.refresh();
    setTimeout(() => { setShowDeleteTip(null); }, 3000);
  };

  const handleSingleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("确定删除这条灵感吗？")) return;
    await deleteInspiration.mutateAsync(id);
    setShowDeleteTip("成功删除 1 条灵感");
    router.refresh();
    setTimeout(() => { setShowDeleteTip(null); }, 3000);
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', file.type.startsWith('image') ? 'image' : 'video');
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) continue;
        const url = uploadData.data.url;
        const isImage = file.type.startsWith('image');
        const isVideo = file.type.startsWith('video');
        await createInspiration.mutateAsync({
          type: isImage ? 'image' : isVideo ? 'video' : 'text',
          title: file.name.length > 50 ? file.name.substring(0, 50) : file.name,
          original_text: file.name,
          summary: `上传的${isImage ? '图片' : '视频'}: ${file.name}`,
          tags: ['灵感'],
          media_urls: [url],
        });
      }
    } catch (e) {
      console.error('批量上传失败:', e);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (searchParams.get('saved') === 'true') {
      setShowSavedTip(true);
      setTimeout(() => {
        setShowSavedTip(false);
        router.replace('/inspiration');
      }, 3000);
    }
  }, [searchParams, router]);

  // 点击外部关闭下拉
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    if (openDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

  const toggleTag = (tagId: string) => {
    const next = new Set(selectedTagIds);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    setSelectedTagIds(next);
  };

  // ====== 抖音风格卡片（所有类型） ======
  const renderCard = (item: any) => {
    const checked = selectedIds.has(item.id);
    const isVideo = item.type === "video";
    const isImage = item.type === "image";
    const thumbnailUrl = item.media_urls?.[0];
    const hasMedia = isVideo || isImage;
    const typeLabel = TYPE_LABELS[item.type] || item.type;

    return (
      <GlassCard key={item.id} hover onClick={() => isSelecting ? toggleSelect(item.id) : handleNavigate("inspiration-detail", item.id)} className="!p-0 overflow-hidden group relative">
        {/* 选择模式勾选 */}
        {isSelecting && (
          <button onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }} className="absolute top-2 left-2 z-10 p-0.5 rounded" style={{ background: "rgba(0,0,0,0.5)" }}>
            {checked ? <CheckSquare size={20} color="#3B82F6" /> : <Square size={20} color="#9CA3AF" />}
          </button>
        )}
        {!isSelecting && (
          <button onClick={(e) => handleSingleDelete(e, item.id)} className="absolute top-2 right-2 z-10 p-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all" style={{ background: "rgba(0,0,0,0.5)" }} title="删除">
            <Trash2 size={16} color="#EF4444" />
          </button>
        )}

        {/* 上半部分：媒体/内容预览 */}
        <div className="relative" style={{ aspectRatio: "3/4" }}>
          {hasMedia && thumbnailUrl ? (
            isVideo && !item.thumbnail_url ? (
              <video src={thumbnailUrl} className="w-full h-full object-cover" muted preload="metadata" />
            ) : (
              <div className="relative w-full h-full">
                <img
                  src={item.thumbnail_url || thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.25)" }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.6)", border: "2px solid rgba(255,255,255,0.5)" }}>
                      <Play size={16} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 2 }} />
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 36 }}>{TYPE_EMOJIS[item.type] || "📝"}</span>
              <p style={{ color: "#D1D5DB", fontSize: 11, textAlign: "center", marginTop: 8 }} className="line-clamp-4">
                {item.ai_summary || item.original_text?.substring(0, 120) || item.title || "暂无内容"}
              </p>
            </div>
          )}
          {/* 类型角标 */}
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-medium"
            style={{ background: "rgba(0,0,0,0.6)", color: "#FFFFFF" }}>
            {typeLabel}
          </span>
        </div>

        {/* 底部信息 */}
        <div className="p-2.5">
          <p style={{ color: "#FFFFFF", fontSize: 12, fontWeight: 600 }} className="line-clamp-2 mb-1">
            {item.title || "未命名"}
          </p>
          <p style={{ color: "#9CA3AF", fontSize: 10 }} className="line-clamp-2">
            {item.ai_summary || item.original_text?.substring(0, 60) || "暂无描述"}
          </p>
          <div className="flex items-center justify-between mt-1.5">
            <span style={{ color: "#6B7280", fontSize: 10 }}>
              {new Date(item.created_at).toLocaleDateString("zh-CN")}
            </span>
            <GlassBadge>{STATUS_LABELS[item.status] || "待处理"}</GlassBadge>
          </div>
        </div>
      </GlassCard>
    );
  };

  // ====== 日程视图 ======
  const renderScheduleView = () => {
    const dateItems = calendarSelectedDate ? calendarEvents.get(calendarSelectedDate) || [] : [];

    return (
      <div className="space-y-4">
        <SimpleCalendar events={calendarEvents} onDateClick={(date) => setCalendarSelectedDate(date)} />

        {/* 日程明细卡片 */}
        <GlassCard>
          <h4 style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={15} color="#A78BFA" /> 日程明细
          </h4>
          {schedules.length === 0 ? (
            <p style={{ color: "#6B7280", fontSize: 13, textAlign: "center", padding: "12px 0" }}>暂无日程记录</p>
          ) : (
            <div className="space-y-2">
              {schedules.map((schedule: any) => (
                <div key={schedule.id} className="flex items-start gap-3 p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="truncate" style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 500 }}>{schedule.title}</span>
                      <GlassBadge>{schedule.status === 'completed' ? '已完成' : schedule.status === 'cancelled' ? '已取消' : '待办'}</GlassBadge>
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: "#9CA3AF" }}>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(schedule.scheduled_at).toLocaleString("zh-CN", { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {schedule.location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin size={11} />
                          {schedule.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {calendarSelectedDate && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600 }}>{calendarSelectedDate} 的日程</h4>
              <button onClick={() => setCalendarSelectedDate(null)} style={{ color: "#9CA3AF", fontSize: 12 }}>
                清除
              </button>
            </div>
            {dateItems.length === 0 ? (
              <p style={{ color: "#6B7280", fontSize: 13, textAlign: "center", padding: "16px 0" }}>当天无日程</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {dateItems.map((item: any) => renderCard(item))}
              </div>
            )}
          </div>
        )}

        {!calendarSelectedDate && items.length > 0 && (
          <div>
            <h4 style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>日程列表</h4>
            <div className="grid grid-cols-2 gap-3">
              {items.map((item: any) => renderCard(item))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <TopNav
        title={isSelecting ? `已选 ${selectedIds.size} 项` : "灵感库"}
        right={
          isSelecting ? (
            <div className="flex gap-2 items-center">
              <button onClick={toggleSelectAll} className="px-2 py-1 rounded text-xs"
                style={{ color: "#E5E7EB", background: "rgba(255,255,255,0.08)" }}>
                {selectedIds.size === items.length ? '取消全选' : '全选'}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
                className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                style={{
                  background: selectedIds.size === 0 ? "rgba(255,255,255,0.05)" : "rgba(239,68,68,0.2)",
                  border: selectedIds.size === 0 ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(239,68,68,0.4)",
                  color: selectedIds.size === 0 ? "#6B7280" : "#FCA5A5",
                }}
              >
                <Trash2 size={14} /> 删除{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </button>
              <button onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }} className="px-2 py-1 rounded text-xs"
                style={{ color: "#9CA3AF", background: "rgba(255,255,255,0.08)" }}>
                取消
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button className="p-1" onClick={() => fileInputRef.current?.click()} title="批量上传">
                <Upload size={20} color="#E5E7EB" />
              </button>
              <button
                onClick={() => { setSelectionMode(true); setSelectedIds(new Set()); }}
                className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#E5E7EB" }}
              >
                <CheckSquare size={14} /> 管理
              </button>
            </div>
          )
        }
      />

      <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.txt" className="hidden" onChange={handleBatchUpload} />

      {/* 提示条 */}
      {showSavedTip && (
        <div className="mx-4 mt-3 p-3 rounded-lg flex items-center gap-2 text-sm"
          style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#86EFAC" }}>
          <CheckCircle size={18} color="#22C55E" /> 灵感保存成功！
        </div>
      )}
      {isUploading && (
        <div className="mx-4 mt-3 p-3 rounded-lg flex items-center gap-2 text-sm"
          style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#93C5FD" }}>
          <Upload size={18} className="animate-pulse" /> 正在上传处理...
        </div>
      )}
      {showDeleteTip && (
        <div className="mx-4 mt-3 p-3 rounded-lg flex items-center gap-2 text-sm"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5" }}>
          <Trash2 size={18} color="#EF4444" /> {showDeleteTip}
        </div>
      )}

      <div className="flex-1 px-4 pt-4">
        {/* 分类 Tab */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-4 px-4">
          {typeFilters.map((f) => (
            <button key={f} onClick={() => { setActiveFilter(f); setCalendarSelectedDate(null); }}
              className="flex-shrink-0 px-4 py-1.5 rounded-lg text-sm transition-all"
              style={{
                background: activeFilter === f ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.07)",
                border: activeFilter === f ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.12)",
                color: activeFilter === f ? "#93C5FD" : "#9CA3AF",
                fontSize: 13,
              }}>
              {f}
            </button>
          ))}
        </div>

        {/* 筛选栏 — z-50 保证下拉菜单在最上层 */}
        <div ref={dropdownRef} className="relative mb-4 z-50">
          <GlassCard className="!p-2">
            <div className="flex gap-2">
              {/* 时间范围 */}
              <div className="flex-1 relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === "time" ? null : "time")}
                  className="w-full py-1.5 rounded-lg text-xs flex items-center justify-center gap-1"
                  style={{
                    background: timeRange ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.07)",
                    border: timeRange ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.12)",
                    color: timeRange ? "#93C5FD" : "#9CA3AF",
                  }}>
                  {TIME_RANGES.find((t) => t.value === timeRange)?.label || "时间范围"} ▾
                </button>
                {openDropdown === "time" && (
                  <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg overflow-hidden"
                    style={{ background: "rgba(31,41,55,0.98)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
                    {TIME_RANGES.map((t) => (
                      <button key={t.value} onClick={() => { setTimeRange(t.value); setOpenDropdown(null); }}
                        className="w-full px-3 py-2 text-left text-xs transition-all hover:bg-white/10"
                        style={{ color: timeRange === t.value ? "#93C5FD" : "#9CA3AF" }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 标签 */}
              <div className="flex-1 relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === "tag" ? null : "tag")}
                  className="w-full py-1.5 rounded-lg text-xs flex items-center justify-center gap-1"
                  style={{
                    background: selectedTagIds.size > 0 ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.07)",
                    border: selectedTagIds.size > 0 ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.12)",
                    color: selectedTagIds.size > 0 ? "#93C5FD" : "#9CA3AF",
                  }}>
                  标签{selectedTagIds.size > 0 ? ` (${selectedTagIds.size})` : ""} ▾
                </button>
                {openDropdown === "tag" && (
                  <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg overflow-hidden"
                    style={{ background: "rgba(31,41,55,0.98)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", maxHeight: 200, overflowY: "auto" }}>
                    {(tags as any[]).length === 0 ? (
                      <div className="px-3 py-2 text-xs" style={{ color: "#6B7280" }}>暂无标签</div>
                    ) : (
                      (tags as any[]).map((tag: any) => (
                        <button key={tag.id} onClick={() => toggleTag(tag.id)}
                          className="w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-all hover:bg-white/10"
                          style={{ color: selectedTagIds.has(tag.id) ? "#93C5FD" : "#9CA3AF" }}>
                          {tag.name}
                          {selectedTagIds.has(tag.id) && <CheckSquare size={14} color="#3B82F6" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 排序 */}
              <div className="flex-1 relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === "sort" ? null : "sort")}
                  className="w-full py-1.5 rounded-lg text-xs flex items-center justify-center gap-1"
                  style={{
                    background: sortKey > 0 ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.07)",
                    border: sortKey > 0 ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.12)",
                    color: sortKey > 0 ? "#93C5FD" : "#9CA3AF",
                  }}>
                  {SORT_OPTIONS[sortKey].label} ▾
                </button>
                {openDropdown === "sort" && (
                  <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg overflow-hidden"
                    style={{ background: "rgba(31,41,55,0.98)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
                    {SORT_OPTIONS.map((opt, idx) => (
                      <button key={idx} onClick={() => { setSortKey(idx); setOpenDropdown(null); }}
                        className="w-full px-3 py-2 text-left text-xs transition-all hover:bg-white/10"
                        style={{ color: sortKey === idx ? "#93C5FD" : "#9CA3AF" }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* 内容区 */}
        {isLoading && <div className="py-12"><LoadingSpinner /></div>}

        {!isLoading && isScheduleType ? (
          renderScheduleView()
        ) : !isLoading && !isScheduleType && items.length === 0 ? (
          <EmptyState icon="📝" title="还没有灵感"
            description="点击右上角上传按钮导入文件，或到灵感助手中记录灵感" />
        ) : !isLoading && !isScheduleType && items.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {items.map((item: any) => renderCard(item))}
          </div>
        ) : null}
      </div>

      <BottomNav activePage="inspiration" onNavigate={(page) => handleNavigate(page)} />
    </div>
  );
}

export default function InspirationLibraryPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>}>
        <InspirationLibraryContent />
      </Suspense>
    </ProtectedRoute>
  );
}
