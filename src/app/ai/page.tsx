"use client";


import { useState, useEffect, useCallback } from "react";
import { Zap, FileText, Image as ImageIcon, Video as VideoIcon, Music, Mic, RefreshCw, Share2, Loader2, X, Play, ExternalLink, Download, Save, Copy, Trash2, CheckSquare, Square } from "lucide-react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components";
import { syncDevAuthCookie } from "@/lib/dev-auth";
import { Toast } from "@/components/Toast";

const quickActions = [
  { label: "小红书文案", sub: "一键爆款", page: "ai-copywriting" as PageKey, color: "#F43F5E", type: "xiaohongshu" },
  { label: "公众号文章", sub: "深度长文", page: "ai-copywriting" as PageKey, color: "#8B5CF6", type: "wechat" },
  { label: "一键成片", sub: "全自动出片", page: "ai-video" as PageKey, color: "#F59E0B", type: "" },
];

const creationEntries = [
  { icon: <FileText size={32} />, title: "AI 文案", desc: "小红书/公众号/短视频脚本/多平台改写", color: "#3B82F6", page: "ai-copywriting" as PageKey },
  { icon: <ImageIcon size={32} />, title: "AI 图片", desc: "封面图/配图/海报 · 增强/抠图", color: "#8B5CF6", page: "ai-image" as PageKey },
  { icon: <Mic size={32} />, title: "AI 数字人", desc: "AI写稿 · 一键成片 · 批量口播 · 多语言", color: "#06B6D4", page: "ai-digital-human" as PageKey },
  { icon: <Music size={32} />, title: "AI 配音", desc: "多音色文本转语音 · 男女声可选", color: "#22C55E", page: "ai-tts" as PageKey },
  { icon: <VideoIcon size={32} />, title: "AI 视频", desc: "短视频自动合成 · 分镜/字幕/BGM", color: "#F43F5E", page: "ai-video" as PageKey },
];

const workFilters = ["全部", "文案", "图片", "视频", "语音"];

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return "";
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins}分钟前`;
    if (hrs < 24) return `${hrs}小时前`;
    if (days < 7) return `${days}天前`;
    return new Date(dateStr).toLocaleDateString("zh-CN");
  } catch {
    return "";
  }
}

interface Work {
  id: string;
  emoji: string;
  title: string;
  type: string;
  time: string;
  session_id: string;
  metadata?: any;
  content?: string;
  content_type?: string;
  imageUrl?: string;
  videoUrl?: string;
  videoThumbnail?: string;
  _source?: string;
}

function AICreationContent() {
  const [workFilter, setWorkFilter] = useState("全部");
  const [works, setWorks] = useState<Work[]>([]);
  const [isLoadingWorks, setIsLoadingWorks] = useState(true);
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const router = useRouter();

  const loadWorks = useCallback(() => {
    setIsLoadingWorks(true);
    syncDevAuthCookie();
    const typeParam = workFilter !== "全部" ? `&type=${workFilter}` : "";
    fetch(`/api/chat/history?works=true${typeParam}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.data)) {
          const list: Work[] = data.data.map((w: any) => ({
            id: w.id || "",
            emoji: w.emoji || "📄",
            title: w.title || "AI 生成内容",
            type: w.type || "文案",
            time: formatRelativeTime(w.time || ""),
            session_id: w.session_id || "",
            metadata: w.metadata,
            content: w.content,
            content_type: w.content_type,
            imageUrl: w.metadata?.generatedImage?.imageUrl || undefined,
            videoUrl: w.metadata?.generatedVideo?.videoUrl || undefined,
            videoThumbnail: w.metadata?.videoThumbnail || undefined,
            _source: w._source || undefined,
          }));
          setWorks(list);
        }
      })
      .catch((e) => { console.warn("获取作品失败:", e); })
      .finally(() => setIsLoadingWorks(false));
  }, [workFilter]);

  useEffect(() => {
    loadWorks();
  }, [loadWorks]);

  const makeKey = (w: Work) => `${w._source || 'unknown'}:${w.id}`;

  const handleWorkClick = (w: Work) => {
    if (isSelecting) {
      toggleSelect(w);
    } else {
      setSelectedWork(w);
    }
  };

  const toggleSelect = (w: Work) => {
    const key = makeKey(w);
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedKeys(next);
  };

  const toggleSelectAll = () => {
    if (selectedKeys.size === works.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(works.map((w) => makeKey(w))));
    }
  };

  const handleDeleteSingle = async (w: Work, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`确定删除「${w.title}」吗？`)) return;
    try {
      await fetch(`/api/ai/works?id=${w.id}&source=${w._source || 'chat'}`, { method: 'DELETE' });
      loadWorks();
    } catch { setToast({ message: '删除失败，请重试', type: 'error' }); }
  };

  const handleBatchDelete = async () => {
    if (selectedKeys.size === 0) return;
    if (!confirm(`确定删除 ${selectedKeys.size} 条作品吗？`)) return;
    const ids = Array.from(selectedKeys).map((key) => {
      const [source, id] = key.split(':');
      return { id, source };
    });
    try {
      await fetch('/api/ai/works', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      setIsSelecting(false);
      setSelectedKeys(new Set());
      loadWorks();
    } catch { setToast({ message: '批量删除失败', type: 'error' }); }
  };

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "");

  const handleDownloadMedia = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch { setToast({ message: '下载失败', type: 'error' }); }
  };

  const handleSaveToInspiration = async (work: Work) => {
    try {
      await fetch("/api/inspiration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: work.type === "视频" ? "video" : work.type === "图片" ? "image" : "text",
          title: work.title?.substring(0, 50),
          original_text: stripHtml(work.content || ""),
          media_urls: work.videoUrl || work.imageUrl ? [work.videoUrl || work.imageUrl] : [],
          tags: ["AI生成"],
        }),
      });
      setToast({ message: '已保存到灵感库', type: 'success' });
    } catch { setToast({ message: '保存失败，请重试', type: 'error' }); }
  };

  const handleNavigate = (page: PageKey, params?: string) => {
    switch (page) {
      case "home": router.push("/home"); break;
      case "inspiration": router.push("/inspiration"); break;
      case "ai-copywriting": router.push(`/ai/copywriting${params || ""}`); break;
      case "ai-image": router.push("/ai/image"); break;
      case "ai-video": router.push("/ai/video"); break;
      case "ai-tts": router.push("/ai/tts"); break;
      case "ai-digital-human": router.push("/ai/digital-human"); break;
      case "hotspot": router.push("/hotspot"); break;
      case "profile": router.push("/profile"); break;
      default: router.push("/home");
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav title="AI 创作" />

      <div className="flex-1 px-4 pt-4 space-y-5">
        {/* Quick Generate */}
        <div>
          <p style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 10 }}>快捷生成</p>
          <div className="grid grid-cols-3 gap-2">
            {quickActions.map(({ label, sub, page, color, type }) => (
              <button
                key={label}
                onClick={() => handleNavigate(page, type ? `?type=${type}` : '')}
                className="flex flex-col items-center gap-2 py-3 px-2 rounded-2xl transition-all hover:opacity-90"
                style={{
                  background: `linear-gradient(135deg, ${color}22, ${color}11)`,
                  border: `1px solid ${color}44`,
                }}
              >
                <Zap size={22} color={color} style={{ filter: `drop-shadow(0 0 6px ${color}88)` }} />
                <span style={{ color: "#FFFFFF", fontSize: 11, fontWeight: 600, textAlign: "center", lineHeight: 1.3 }}>{label}</span>
                <span style={{ color: "#9CA3AF", fontSize: 10 }}>{sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Creation Entry */}
        <div>
          <p style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 10 }}>创作入口</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {creationEntries.map(({ icon, title, desc, color, page }) => (
              <GlassCard
                key={title}
                hover
                onClick={() => handleNavigate(page)}
                className="!p-4 flex flex-col items-center text-center gap-2 relative overflow-hidden"
              >
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: color, opacity: 0.5 }} />
                <span style={{ color, filter: `drop-shadow(0 0 12px ${color}66)`, fontSize: 32 }}>{icon}</span>
                <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 700 }}>{title}</p>
                <p style={{ color: "#9CA3AF", fontSize: 10, lineHeight: 1.4 }}>{desc}</p>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* My Works */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 600 }}>
              {isSelecting ? `已选 ${selectedKeys.size} 项` : "我的作品"}
            </h3>
            {works.length > 0 && (
              isSelecting ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSelectAll}
                    className="px-3 py-1.5 rounded-lg text-xs"
                    style={{ color: "#93C5FD", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}
                  >
                    {selectedKeys.size === works.length ? '取消全选' : '全选'}
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedKeys.size === 0}
                    className="px-3 py-1.5 rounded-lg text-xs"
                    style={{
                      background: selectedKeys.size === 0 ? "rgba(255,255,255,0.05)" : "rgba(239,68,68,0.2)",
                      border: selectedKeys.size === 0 ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(239,68,68,0.4)",
                      color: selectedKeys.size === 0 ? "#6B7280" : "#FCA5A5",
                    }}
                  >
                    <Trash2 size={14} /> 删除{selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ''}
                  </button>
                  <button
                    onClick={() => { setIsSelecting(false); setSelectedKeys(new Set()); }}
                    className="px-3 py-1.5 rounded-lg text-xs"
                    style={{ color: "#9CA3AF", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsSelecting(true)}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ color: "#9CA3AF", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  管理
                </button>
              )
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 mb-3 -mx-4 px-4">
            {workFilters.map((f) => (
              <button
                key={f}
                onClick={() => setWorkFilter(f)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{
                  background: workFilter === f ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.07)",
                  border: workFilter === f ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.12)",
                  color: workFilter === f ? "#93C5FD" : "#9CA3AF",
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {isLoadingWorks ? (
              <div className="col-span-2 flex items-center justify-center py-8">
                <Loader2 size={20} color="#6B7280" className="animate-spin" />
              </div>
            ) : works.length === 0 ? (
              <div className="col-span-2 text-center py-8">
                <p style={{ color: "#6B7280", fontSize: 13 }}>暂无作品，去创作吧</p>
              </div>
            ) : (
              works.map((w) => {
                const key = makeKey(w);
                const checked = selectedKeys.has(key);
                return (
                <GlassCard key={key} hover className="!p-0 cursor-pointer overflow-hidden group relative" onClick={() => handleWorkClick(w)}>
                  {/* 选择模式勾选框 */}
                  {isSelecting && (
                    <div className="absolute top-2 left-2 z-10">
                      {checked ? (
                        <CheckSquare size={22} color="#3B82F6" fill="rgba(59,130,246,0.3)" />
                      ) : (
                        <Square size={22} color="rgba(255,255,255,0.5)" />
                      )}
                    </div>
                  )}

                  {/* 删除按钮（非选择模式，hover 显示） */}
                  {!isSelecting && (
                    <button
                      onClick={(e) => handleDeleteSingle(w, e)}
                      className="absolute top-2 right-2 z-10 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto"
                      style={{ background: "rgba(239,68,68,0.2)" }}
                    >
                      <Trash2 size={14} color="#FCA5A5" />
                    </button>
                  )}

                  {/* 上方预览区 */}
                  <div
                    className="w-full flex items-center justify-center"
                    style={{ aspectRatio: "3/4", background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.1))" }}
                  >
                    {w.videoUrl ? (
                      <div className="relative w-full h-full">
                        {w.videoThumbnail ? (
                          <img src={w.videoThumbnail} alt={w.title} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <video src={w.videoUrl} className="w-full h-full object-cover" muted />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
                          <Play size={36} color="#FFFFFF" fill="#FFFFFF" />
                        </div>
                      </div>
                    ) : w.imageUrl ? (
                      <img src={w.imageUrl} alt={w.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 p-4">
                        <span style={{ fontSize: 40 }}>{w.emoji}</span>
                        <p
                          style={{ color: "#D1D5DB", fontSize: 12, lineHeight: 1.5, textAlign: "center" }}
                          className="line-clamp-4"
                        >
                          {w.content
                            ? w.content.replace(/<[^>]*>/g, "").substring(0, 80)
                            : w.title}
                        </p>
                      </div>
                    )}
                  </div>
                  {/* 下方信息区 */}
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <GlassBadge>{w.type}</GlassBadge>
                      <span style={{ color: "#6B7280", fontSize: 10 }}>{w.time}</span>
                    </div>
                    <p style={{ color: "#FFFFFF", fontSize: 12, fontWeight: 600, lineHeight: 1.4 }} className="line-clamp-2">
                      {w.title}
                    </p>
                  </div>
                </GlassCard>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 作品详情弹窗 */}
      {selectedWork && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setSelectedWork(null)}
        >
          <div
            className="relative w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
            style={{ background: "#1F2937", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部关闭 + 删除按钮 */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSingle(selectedWork, e);
                  setSelectedWork(null);
                }}
                className="p-1.5 rounded-full"
                style={{ background: "rgba(239,68,68,0.2)" }}
              >
                <Trash2 size={16} color="#FCA5A5" />
              </button>
              <button
                onClick={() => setSelectedWork(null)}
                className="p-1.5 rounded-full"
                style={{ background: "rgba(0,0,0,0.5)" }}
              >
                <X size={18} color="#FFFFFF" />
              </button>
            </div>

            {/* 内容区 */}
            {selectedWork.videoUrl && (
              <video
                src={selectedWork.videoUrl}
                className="w-full object-contain"
                style={{ maxHeight: "50vh", background: "#000" }}
                controls
                autoPlay
              />
            )}
            {!selectedWork.videoUrl && selectedWork.imageUrl && (
              <img
                src={selectedWork.imageUrl}
                alt={selectedWork.title}
                className="w-full object-contain"
                style={{ maxHeight: "50vh", background: "#000" }}
              />
            )}

            <div className="p-5">
              {/* 类型标签+时间 */}
              <div className="flex items-center gap-2 mb-3">
                <GlassBadge>{selectedWork.type}</GlassBadge>
                <span style={{ color: "#6B7280", fontSize: 12 }}>{selectedWork.time}</span>
              </div>

              {/* 标题 */}
              <h3 style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
                {selectedWork.title}
              </h3>

              {/* 内容正文 */}
              {selectedWork.content ? (
                <div
                  style={{ color: "#D1D5DB", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}
                  dangerouslySetInnerHTML={{
                    __html: selectedWork.content.replace(/\n/g, "<br/>"),
                  }}
                />
              ) : (
                <p style={{ color: "#6B7280", fontSize: 13 }}>暂无详细内容</p>
              )}

              {/* 操作按钮 */}
              <div className="flex flex-col gap-2 mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                {/* 下载 + 保存到灵感 */}
                <div className="flex gap-2">
                  {(selectedWork.videoUrl || selectedWork.imageUrl) && (
                    <button
                      onClick={() =>
                        handleDownloadMedia(
                          (selectedWork.videoUrl || selectedWork.imageUrl)!,
                          `linggan-${selectedWork.type}-${Date.now()}.${selectedWork.videoUrl ? "mp4" : "png"}`
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#E5E7EB" }}
                    >
                      <Download size={14} /> 下载{selectedWork.videoUrl ? "视频" : "图片"}
                    </button>
                  )}
                  <button
                    onClick={() => handleSaveToInspiration(selectedWork)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
                    style={{ background: "rgba(59,130,246,0.15)", color: "#93C5FD", border: "1px solid rgba(59,130,246,0.25)" }}
                  >
                    <Save size={14} /> 保存到灵感
                  </button>
                </div>
                {/* 复制全文 + 打开对话 */}
                <div className="flex gap-2">
                  {selectedWork.content && (
                    <button
                      onClick={() => navigator.clipboard.writeText(stripHtml(selectedWork.content!))}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#E5E7EB" }}
                    >
                      <Copy size={14} /> 复制全文
                    </button>
                  )}
                  {selectedWork.session_id && (
                    <button
                      onClick={() => {
                        router.push(`/capture?session=${selectedWork.session_id}`);
                        setSelectedWork(null);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs ml-auto"
                      style={{ background: "rgba(59,130,246,0.2)", color: "#93C5FD", border: "1px solid rgba(59,130,246,0.3)" }}
                    >
                      <ExternalLink size={14} /> 打开对话
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function AICreationPage() {
  return (
    <ProtectedRoute>
      <AICreationContent />
    </ProtectedRoute>
  );
}
