"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { Search, Zap, CheckCircle, Upload, Download, Trash2, CheckSquare, Square, X, ChevronDown, Play, MapPin, Clock, Pencil, FileText, AlertCircle, Expand } from "lucide-react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute, LoadingSpinner, EmptyState } from "@/components";
import { useInspirations, useCreateInspiration, useDeleteInspiration, useBatchDeleteInspiration, useUpdateInspiration } from "@/hooks/use-inspiration";
import { useUploadQueue } from "@/hooks/use-upload-queue";
import { useTags } from "@/hooks/use-categories";
import { useSchedules } from "@/hooks/use-schedule";
import { TYPE_EMOJIS, TYPE_LABELS, STATUS_LABELS, PAGE_ROUTES } from "@/lib/style-constants";
import { stripMarkdown } from "@/lib/text-utils";
import { useQueryClient } from "@tanstack/react-query";

// ====== 常量 ======

const typeFilters = ["全部", "灵感", "图片", "视频", "音频", "AI作品"];

const typeMap: Record<string, string | undefined> = {
  "全部": undefined,
  "灵感": "text",
  "图片": "image",
  "视频": "video",
  "音频": "audio",
  "AI作品": "ai",
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
  const [showDeleteTip, setShowDeleteTip] = useState<string | null>(null);
  const [showInfoTip, setShowInfoTip] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadToast, setUploadToast] = useState<string | null>(null);
  const [uploadHasSucceeded, setUploadHasSucceeded] = useState(false);

  // 编辑状态
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showEditToast, setShowEditToast] = useState<string | null>(null);

  // 筛选状态
  const [timeRange, setTimeRange] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState(0); // index into SORT_OPTIONS
  const [openDropdown, setOpenDropdown] = useState<"time" | "tag" | "sort" | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ type: 'image' | 'video'; url: string; title: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // 上传队列
  const { items: uploadItems, addFiles, retry: retryUpload, removeItem, clearDone } = useUploadQueue({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspirations"] });
    },
    onAllDone: (summary) => {
      if (summary.total > 0) {
        let msg: string;
        if (summary.failed > 0) {
          msg = `上传完成：${summary.succeeded} 成功，${summary.failed} 失败`;
          if (summary.firstError) msg += `（${summary.firstError}）`;
        } else if (summary.inFlight > 0) {
          msg = `${summary.inFlight} 个文件仍在处理中`;
        } else {
          msg = `成功上传 ${summary.succeeded} 个文件`;
        }
        setUploadToast(msg);
        setUploadHasSucceeded(summary.succeeded > 0);
        setTimeout(() => setUploadToast(null), 6000);
      }
      if (summary.succeeded > 0) {
        queryClient.invalidateQueries({ queryKey: ["inspirations"] });
      }
    },
  });
  const isUploading = uploadItems.some(
    (it) => it.status === 'uploading' || it.status === 'compressing' || it.status === 'creating' || it.status === 'queued'
  );

  // 获取标签列表
  const { data: tags = [] } = useTags();

  // 计算时间范围参数
  const dateParams = getDateRange(timeRange);

  const isAiFilter = activeFilter === "AI作品";
  const { data: inspirations, isLoading } = useInspirations({
    type: isAiFilter ? undefined : (typeMap[activeFilter] as any),
    limit: 50,
    sourcePlatform: isAiFilter ? "ai" : undefined,
    ...dateParams,
    sortBy: SORT_OPTIONS[sortKey].sortBy,
    sortOrder: SORT_OPTIONS[sortKey].sortOrder,
    tagIds: selectedTagIds.size > 0 ? Array.from(selectedTagIds).join(",") : undefined,
  });

  const createInspiration = useCreateInspiration();
  const deleteInspiration = useDeleteInspiration();
  const batchDelete = useBatchDeleteInspiration();
  const updateInspiration = useUpdateInspiration();

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

  // 下载媒体文件
  const downloadFile = async (url: string, filename: string): Promise<boolean> => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      return true;
    } catch {
      window.open(url, '_blank');
      return false;
    }
  };

  const getDownloadFilename = (item: any): string => {
    const urls = item.media_urls || [];
    if (urls.length > 0) {
      const ext = urls[0].split('.').pop()?.split('?')[0] || 'file';
      // 根据类型推断合理的扩展名
      if (item.type === 'video') return `${item.title || '视频'}.mp4`;
      if (item.type === 'image') return `${item.title || '图片'}.${ext}`;
      if (item.type === 'audio') return `${item.title || '音频'}.${ext}`;
      return `${item.title || '文件'}.${ext}`;
    }
    return `${item.title || '灵感'}.txt`;
  };

  // 单条下载（静默，用于批量）
  const downloadItemSilent = async (item: any): Promise<boolean> => {
    const urls = item.media_urls || [];
    if (urls.length > 0) {
      return downloadFile(urls[0], getDownloadFilename(item));
    }
    // 纯文本：下载为 .txt
    const text = item.original_text || item.title || '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${item.title || '灵感'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return true;
  };

  // 单条下载（卡片按钮）
  const handleDownloadItem = async (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    await downloadItemSilent(item);
    setShowInfoTip('已开始下载');
    setTimeout(() => setShowInfoTip(null), 2000);
  };

  // 批量下载
  const handleBatchDownload = async () => {
    const targetItems = selectedIds.size > 0
      ? items.filter((it: any) => selectedIds.has(it.id))
      : items;
    if (targetItems.length === 0) return;

    let done = 0;
    setShowInfoTip(`正在下载 ${targetItems.length} 条...`);
    for (const item of targetItems) {
      await downloadItemSilent(item);
      done++;
      if (done < targetItems.length) {
        await new Promise(r => setTimeout(r, 400)); // 避免浏览器拦截
      }
    }
    setShowInfoTip(`已下载 ${done} 条记录`);
    setTimeout(() => setShowInfoTip(null), 3000);
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      setSelectionMode(false);
    }
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    addFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    addFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragging(false);
  };

  // 打开编辑弹窗
  const handleOpenEdit = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    setEditingItem(item);
    setEditTitle(item.title || "");
    setEditText(item.original_text || "");
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setIsSaving(true);
    try {
      await updateInspiration.mutateAsync({
        id: editingItem.id,
        data: {
          title: editTitle.trim() || undefined,
          original_text: editText.trim() || undefined,
        },
      });
      setShowEditToast("修改保存成功");
      setTimeout(() => setShowEditToast(null), 3000);
      setEditingItem(null);
    } catch (e) {
      console.error("保存编辑失败:", e);
      setShowEditToast("保存失败，请重试");
      setTimeout(() => setShowEditToast(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const openImagePreview = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    setPreviewMedia({ type: 'image', url: item.media_urls[0], title: item.title || '图片预览' });
  };

  const toggleVideoPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = (e.currentTarget as HTMLElement).closest('.video-container');
    const video = container?.querySelector('video') as HTMLVideoElement | null;
    if (video) {
      if (video.paused) video.play();
      else video.pause();
    }
  };

  const openVideoFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = (e.currentTarget as HTMLElement).closest('.video-container');
    const video = container?.querySelector('video') as HTMLVideoElement | null;
    if (video) {
      if (video.requestFullscreen) video.requestFullscreen();
      else if ((video as any).webkitEnterFullscreen) (video as any).webkitEnterFullscreen();
    }
  };

  useEffect(() => {
    if (searchParams.get('saved') === 'true') {
      setShowSavedTip(true);
      const timer = setTimeout(() => {
        setShowSavedTip(false);
        router.replace('/inspiration');
      }, 3000);
      return () => clearTimeout(timer);
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


  // ====== 统一卡片(所有类型) ======
  const renderCard = (item: any) => {
    const checked = selectedIds.has(item.id);
    const isVideo = item.type === "video";
    const isImage = item.type === "image";
    const thumbnailUrl = item.media_urls?.[0];
    const hasMedia = isVideo || isImage;
    const typeLabel = TYPE_LABELS[item.type] || item.type;
    // 类型角标:有 original_file_url 用扩展名(用户上传的原始文件),否则用 typeLabel
    // 这样 image/video 灵感会显示「图片/视频」而不是文件扩展名
    const typeBadge = item.original_file_url
      ? (item.original_filename?.split('.').pop()?.toUpperCase() || 'FILE')
      : typeLabel;
    // 视频时长(秒 → mm:ss)
    const videoDuration = item.metadata?.duration || item.duration;
    const formatVideoDuration = (s: number) => {
      if (!s || !Number.isFinite(s)) return '';
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    return (
      <GlassCard
        hover
        onClick={() => isSelecting ? toggleSelect(item.id) : handleNavigate("inspiration-detail", item.id)}
        className="!p-0 overflow-hidden group relative"
      >
        {/* 顶部操作层:选择模式勾选 / 常态编辑+删除(常驻,移动端也可见) */}
        <div className="absolute top-2 left-2 right-2 z-20 flex items-start justify-between pointer-events-none">
          {isSelecting ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
              className="p-0.5 rounded pointer-events-auto"
              style={{ background: "rgba(0,0,0,0.5)" }}
              aria-label="选择"
            >
              {checked ? <CheckSquare size={20} color="#3B82F6" /> : <Square size={20} color="#E5E7EB" />}
            </button>
          ) : <span />}

          {!isSelecting && (
            <div className="flex gap-1 pointer-events-auto">
              <button
                onClick={(e) => handleDownloadItem(e, item)}
                className="p-1 rounded opacity-70 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.55)" }}
                title="下载"
                aria-label="下载"
              >
                <Download size={13} color="#E5E7EB" />
              </button>
              <button
                onClick={(e) => handleOpenEdit(e, item)}
                className="p-1 rounded opacity-70 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.55)" }}
                title="编辑"
                aria-label="编辑"
              >
                <Pencil size={13} color="#E5E7EB" />
              </button>
              <button
                onClick={(e) => handleSingleDelete(e, item.id)}
                className="p-1 rounded opacity-70 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.55)" }}
                title="删除"
                aria-label="删除"
              >
                <Trash2 size={13} color="#FCA5A5" />
              </button>
            </div>
          )}
        </div>

        {/* 媒体/内容预览 — 各类型自然高度 */}
        {hasMedia && thumbnailUrl ? (
          isVideo ? (
            <div className="relative video-container">
              <video
                src={thumbnailUrl}
                className="w-full block"
                style={{ maxHeight: 400 }}
                muted
                preload="metadata"
                playsInline
              />
              <div
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                style={{ background: "rgba(0,0,0,0.2)" }}
                onClick={toggleVideoPlay}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.6)", border: "2px solid rgba(255,255,255,0.5)" }}>
                  <Play size={16} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 2 }} />
                </div>
              </div>
              {/* 全屏按钮 */}
              <button
                onClick={openVideoFullscreen}
                className="absolute top-10 right-2 z-10 p-1 rounded opacity-70 hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.55)" }}
                title="全屏"
                aria-label="全屏"
              >
                <Expand size={13} color="#E5E7EB" />
              </button>
              {videoDuration && (
                <span
                  className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium z-10"
                  style={{ background: "rgba(0,0,0,0.75)", color: "#FFFFFF" }}
                >
                  {formatVideoDuration(videoDuration)}
                </span>
              )}
              {/* 类型角标 */}
              {!isSelecting && (
                <span
                  className="absolute z-10 pointer-events-none"
                  style={{
                    bottom: 8, left: 8,
                    padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 500,
                    background: "rgba(0,0,0,0.65)", color: "#FFFFFF",
                    maxWidth: "calc(100% - 16px)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                  title={typeBadge}
                >
                  {typeBadge}
                </span>
              )}
            </div>
          ) : (
            <div className="relative cursor-pointer" onClick={(e) => openImagePreview(e, item)}>
              <img
                src={thumbnailUrl}
                alt={item.title || "灵感图片"}
                loading="lazy"
                className="w-full block"
                style={{ maxHeight: 400, objectFit: 'cover' }}
              />
              {/* 全屏预览按钮 */}
              <span
                className="absolute top-2 right-2 z-10 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: "rgba(0,0,0,0.55)" }}
              >
                <Expand size={14} color="#E5E7EB" />
              </span>
              {/* 类型角标 */}
              {!isSelecting && (
                <span
                  className="absolute z-10 pointer-events-none"
                  style={{
                    bottom: 8, left: 8,
                    padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 500,
                    background: "rgba(0,0,0,0.65)", color: "#FFFFFF",
                    maxWidth: "calc(100% - 16px)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                  title={typeBadge}
                >
                  {typeBadge}
                </span>
              )}
            </div>
          )
        ) : item.type === 'audio' && thumbnailUrl ? (
          // 音频播放器
          <div className="relative">
            <div className="px-3 py-4" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontSize: 20 }}>{TYPE_EMOJIS[item.type] || "🎵"}</span>
                <span style={{ color: "#D1D5DB", fontSize: 11 }} className="truncate">
                  {item.original_filename || item.title || '音频'}
                </span>
              </div>
              <audio
                src={thumbnailUrl}
                controls
                preload="metadata"
                className="w-full"
                style={{ height: 32, filter: 'invert(0.85)' }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {/* 类型角标 */}
            {!isSelecting && (
              <span
                className="absolute z-10 pointer-events-none"
                style={{
                  bottom: 8, left: 8,
                  padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 500,
                  background: "rgba(0,0,0,0.65)", color: "#FFFFFF",
                  maxWidth: "calc(100% - 16px)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={typeBadge}
              >
                {typeBadge}
              </span>
            )}
          </div>
        ) : (
          // 纯文本/文档/音频：紧凑预览
          <div className="relative">
            <div
              className="px-3 py-4 flex items-start gap-3"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              <span style={{ fontSize: 28, flexShrink: 0 }}>{TYPE_EMOJIS[item.type] || "📝"}</span>
              <p
                style={{ color: "#D1D5DB", fontSize: 11, lineHeight: 1.5 }}
                className="line-clamp-3 flex-1 break-words"
              >
                {item.original_text ? stripMarkdown(item.original_text?.substring(0, 120)) : (item.title || "暂无内容")}
              </p>
            </div>
            {/* 类型角标 */}
            {!isSelecting && (
              <span
                className="absolute z-10 pointer-events-none"
                style={{
                  bottom: 8, left: 8,
                  padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 500,
                  background: "rgba(0,0,0,0.65)", color: "#FFFFFF",
                  maxWidth: "calc(100% - 16px)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={typeBadge}
              >
                {typeBadge}
              </span>
            )}
          </div>
        )}

        {/* 底部信息 */}
        <div className="p-2.5">
          <p style={{ color: "#FFFFFF", fontSize: 12, fontWeight: 600 }} className="line-clamp-2 mb-1 break-words">
            {item.title ? stripMarkdown(item.title) : "未命名"}
          </p>
          <p style={{ color: "#9CA3AF", fontSize: 10, lineHeight: 1.4 }} className="line-clamp-2 break-words">
            {item.original_text ? stripMarkdown(item.original_text?.substring(0, 80)) : (item.title ? stripMarkdown(item.title) : "")}
          </p>
          <div className="flex items-center justify-between mt-1.5 gap-1.5">
            <span style={{ color: "#6B7280", fontSize: 10 }} className="truncate">
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
                onClick={handleBatchDownload}
                disabled={selectedIds.size === 0}
                className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                style={{
                  background: selectedIds.size === 0 ? "rgba(255,255,255,0.05)" : "rgba(34,197,94,0.15)",
                  border: selectedIds.size === 0 ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(34,197,94,0.3)",
                  color: selectedIds.size === 0 ? "#6B7280" : "#86EFAC",
                }}
              >
                <Download size={14} /> 下载{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
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

      <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.docx,.txt,.md" className="hidden" onChange={handleBatchUpload} />

      {/* 提示条 */}
      {showSavedTip && (
        <div className="mx-4 mt-3 p-3 rounded-lg flex items-center gap-2 text-sm"
          style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#86EFAC" }}>
          <CheckCircle size={18} color="#22C55E" /> 灵感保存成功！
        </div>
      )}
      {isUploading && (
        <div className="mx-4 mt-3 p-3 rounded-lg text-sm"
          style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#93C5FD" }}>
          <div className="flex items-center gap-2 mb-2">
            <Upload size={18} className="animate-pulse" />
            <span className="font-medium">正在上传 {uploadItems.filter((it) => it.status === 'done' || it.status === 'error').length}/{uploadItems.length}</span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {uploadItems.map((it) => {
              const label =
                it.status === 'compressing' ? '压缩中' :
                it.status === 'uploading' ? `上传中 ${it.progress}%` :
                it.status === 'done' ? '完成' :
                it.status === 'error' ? `失败：${it.error}` :
                it.status === 'queued' ? '等待中' : it.status;
              return (
                <div key={it.id} className="flex items-center gap-2 text-xs" style={{ color: it.status === 'error' ? "#FCA5A5" : "#93C5FD" }}>
                  {it.status === 'error' ? (
                    <AlertCircle size={12} color="#EF4444" />
                  ) : it.status === 'done' ? (
                    <CheckCircle size={12} color="#22C55E" />
                  ) : (
                    <Upload size={12} />
                  )}
                  <span className="truncate flex-1">{it.file.name}</span>
                  <span style={{ flexShrink: 0 }}>{label}</span>
                  {it.status === 'error' && (
                    <button onClick={() => retryUpload(it.id)} className="px-1.5 py-0.5 rounded text-xs"
                      style={{ background: "rgba(255,255,255,0.15)" }}>重试</button>
                  )}
                  {(it.status === 'done' || it.status === 'error') && (
                    <button onClick={() => removeItem(it.id)} className="px-1 text-xs" style={{ color: "#9CA3AF" }}>×</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {uploadToast && (
        <div className="mx-4 mt-3 p-3 rounded-lg flex items-center gap-2 text-sm"
          style={{
            background: uploadToast.includes('失败') ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
            border: uploadToast.includes('失败') ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(34,197,94,0.3)",
            color: uploadToast.includes('失败') ? "#FCA5A5" : "#86EFAC",
          }}>
          <CheckCircle size={18} color={uploadToast.includes('失败') ? "#EF4444" : "#22C55E"} />
          <span className="flex-1">{uploadToast}</span>
          {uploadHasSucceeded && activeFilter !== "全部" && (
            <button
              onClick={() => { setActiveFilter("全部"); setUploadToast(null); }}
              className="px-2 py-0.5 rounded text-xs flex-shrink-0"
              style={{ background: "rgba(34,197,94,0.3)", color: "#86EFAC" }}
            >
              查看全部
            </button>
          )}
        </div>
      )}
      {showDeleteTip && (
        <div className="mx-4 mt-3 p-3 rounded-lg flex items-center gap-2 text-sm"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5" }}>
          <Trash2 size={18} color="#EF4444" /> {showDeleteTip}
        </div>
      )}
      {showInfoTip && (
        <div className="mx-4 mt-3 p-3 rounded-lg flex items-center gap-2 text-sm"
          style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#86EFAC" }}>
          <CheckCircle size={18} color="#22C55E" /> {showInfoTip}
        </div>
      )}
      {showEditToast && (
        <div className="mx-4 mt-3 p-3 rounded-lg flex items-center gap-2 text-sm"
          style={{
            background: showEditToast.includes("失败") ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
            border: showEditToast.includes("失败") ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(34,197,94,0.3)",
            color: showEditToast.includes("失败") ? "#FCA5A5" : "#86EFAC",
          }}>
          <CheckCircle size={18} color={showEditToast.includes("失败") ? "#EF4444" : "#22C55E"} /> {showEditToast}
        </div>
      )}

      <div
        className="flex-1 px-4 pt-4 relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
            style={{ background: "rgba(59,130,246,0.08)" }}>
            <div className="px-8 py-6 rounded-2xl text-center"
              style={{ background: "rgba(59,130,246,0.9)", color: "#FFFFFF", boxShadow: "0 8px 32px rgba(59,130,246,0.4)" }}>
              <Upload size={32} className="mx-auto mb-2" />
              <div style={{ fontSize: 16, fontWeight: 600 }}>松开上传文件</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>支持 图片 / 视频 / 音频 / PDF / DOCX / TXT / MD</div>
            </div>
          </div>
        )}
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
          <div className="columns-2 gap-3" style={{ columnGap: '0.75rem' }}>
            {items.map((item: any) => (
              <div key={item.id} className="break-inside-avoid" style={{ marginBottom: '0.75rem' }}>
                {renderCard(item)}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <BottomNav activePage="inspiration" onNavigate={(page) => handleNavigate(page)} />

      {/* 编辑弹窗 */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setEditingItem(null)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
          <div className="relative w-full sm:max-w-md mx-4 mb-4 sm:mb-0 p-5 rounded-2xl"
            style={{ background: "rgba(31,41,55,0.98)", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 600 }}>编辑灵感</h3>
              <button onClick={() => setEditingItem(null)} className="p-1 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>
                <X size={16} color="#9CA3AF" />
              </button>
            </div>

            {/* 标题 */}
            <div className="mb-3">
              <label className="block mb-1.5" style={{ color: "#9CA3AF", fontSize: 12 }}>标题</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="输入标题"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#FFFFFF",
                }}
              />
            </div>

            <div className="mb-4">
              <label className="block mb-1.5" style={{ color: "#9CA3AF", fontSize: 12 }}>原文</label>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="输入原文内容"
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#FFFFFF",
                }}
              />
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button
                onClick={() => setEditingItem(null)}
                className="flex-1 py-2 rounded-lg text-sm"
                style={{ background: "rgba(255,255,255,0.08)", color: "#9CA3AF" }}>
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: "rgba(59,130,246,0.3)",
                  border: "1px solid rgba(59,130,246,0.4)",
                  color: "#93C5FD",
                  opacity: isSaving ? 0.6 : 1,
                }}>
                {isSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 全屏预览弹窗 */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setPreviewMedia(null)}
        >
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)" }} />
          <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            {/* 关闭按钮 */}
            <button
              onClick={() => setPreviewMedia(null)}
              className="absolute -top-10 right-0 p-1.5 rounded-lg z-10"
              style={{ background: "rgba(255,255,255,0.1)" }}
              aria-label="关闭"
            >
              <X size={20} color="#FFFFFF" />
            </button>
            {/* 标题 */}
            <p className="absolute -top-10 left-0 truncate max-w-[70vw]"
              style={{ color: "#D1D5DB", fontSize: 13, lineHeight: "32px" }}>
              {previewMedia.title}
            </p>
            {previewMedia.type === 'image' ? (
              <img
                src={previewMedia.url}
                alt={previewMedia.title}
                className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg"
              />
            ) : (
              <video
                src={previewMedia.url}
                controls
                autoPlay
                className="max-w-[95vw] max-h-[90vh] rounded-lg"
                style={{ outline: 'none' }}
              />
            )}
          </div>
        </div>
      )}
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
