"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Share2, Zap, TrendingUp, FileText, Download, RefreshCw, AlertCircle, ImageIcon, VideoIcon, CalendarPlus, Copy, Check } from "lucide-react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PageKey } from "@/components/BottomNav";
import { useRouter } from "next/navigation";
import { ProtectedRoute, LoadingSpinner } from "@/components";
import FormattedText from "@/components/FormattedText";
import { stripMarkdown } from "@/lib/text-utils";
import { syncDevAuthCookie, getDevUserIdHeader } from "@/lib/dev-auth";
import { useInspiration, useInspirations, useInspirationActions, useUpdateInspiration } from "@/hooks/use-inspiration";
import { useCategories } from "@/hooks/use-categories";

const typeEmojis: Record<string, string> = {
  text: "✨",
  link: "📝",
  image: "🖼️",
  video: "🎬",
  voice: "✍️",
  audio: "🎵",
  schedule: "📅",
};

const typeLabels: Record<string, string> = {
  text: "灵感",
  link: "选题",
  image: "图片",
  video: "视频",
  voice: "文案",
  audio: "音频",
  schedule: "日程",
};

const statusLabels: Record<string, string> = {
  pending: "待处理",
  saved: "已收藏",
  used: "已使用",
  archived: "已归档",
  active: "正常",
};

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function InspirationDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || undefined;
  const { data: inspiration, isLoading, isError } = useInspiration(id);
  const linkedSchedules = (inspiration as any)?.linked_schedules || [];
  const { updateStatus } = useInspirationActions();
  const updateInspiration = useUpdateInspiration();
  const { data: categories } = useCategories();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 编辑弹窗状态
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTags, setEditTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [relatedInspirations, setRelatedInspirations] = useState<any[]>([]);
  const [relatedHotspots, setRelatedHotspots] = useState<any[]>([]);

  // 获取真实相关灵感（同类型）
  const { data: relatedInspData } = useInspirations(
    inspiration?.type && (inspiration as any).type !== 'schedule'
      ? { type: inspiration.type, limit: 6 }
      : { limit: 6 }
  );

  useEffect(() => {
    if (relatedInspData && Array.isArray(relatedInspData) && id) {
      setRelatedInspirations(
        (relatedInspData as any[]).filter((item: any) => item.id !== id).slice(0, 5)
      );
    }
  }, [relatedInspData, id]);

  // 获取真实相关热点（按标题关键词搜索）
  useEffect(() => {
    if (!inspiration?.title) return;
    syncDevAuthCookie();
    const keyword = inspiration.title.substring(0, 20);
    const headers = getDevUserIdHeader();
    fetch(`/api/hotspot?keyword=${encodeURIComponent(keyword)}&limit=5`, { headers })
      .then(res => res.json())
      .then(data => {
        if (data?.success && Array.isArray(data.data)) {
          setRelatedHotspots(data.data);
        }
      })
      .catch(() => {});
  }, [inspiration?.title]);

  // 动态设置页面标题和 meta 标签（用于分享预览等）
  useEffect(() => {
    if (!inspiration) return;
    const title = inspiration.title || '灵感详情';
    document.title = `${title} - 灵集`;
    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    const desc = (inspiration.original_text || inspiration.ai_summary || '').substring(0, 200);
    const image = inspiration.thumbnail_url || inspiration.media_urls?.[0] || '';
    const url = `${window.location.origin}/inspiration/detail?id=${inspiration.id}`;
    setMeta('og:title', title);
    setMeta('og:description', desc);
    setMeta('og:image', image);
    setMeta('og:url', url);
    setMeta('og:type', 'article');
  }, [inspiration]);

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const markAsUsed = async () => {
    if (!inspiration || !id) return;
    const currentStatus = (inspiration as any).status;
    const newStatus = currentStatus === 'used' ? 'active' : 'used';
    try {
      await updateStatus.mutateAsync({ id, status: newStatus });
      showStatus(newStatus === 'used' ? '✅ 已标记为已使用' : '🔄 已恢复为未使用');
    } catch (e) {
      console.error('更新状态失败', e);
    }
  };

  const archiveInspiration = async () => {
    if (!inspiration || !id) return;
    const currentStatus = (inspiration as any).status;
    const newStatus = currentStatus === 'archived' ? 'active' : 'archived';
    try {
      await updateStatus.mutateAsync({ id, status: newStatus });
      showStatus(newStatus === 'archived' ? '📦 已归档' : '🔄 已取消归档');
    } catch (e) {
      console.error('归档失败', e);
    }
  };

  const openEditModal = () => {
    setEditTitle(inspiration?.title || '');
    setEditText(inspiration?.original_text || '');
    setEditSummary('');
    setEditCategoryId(inspiration?.category_id || '');
    const tagNames = (inspiration as any)?.content_tags
      ?.map((ct: any) => ct.tags?.name)
      .filter(Boolean)
      .join(', ') || '';
    setEditTags(tagNames);
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!inspiration || !id) return;
    setSaving(true);
    try {
      await updateInspiration.mutateAsync({
        id,
        data: {
          ...(editTitle ? { title: editTitle } : {}),
          ...(editText ? { original_text: editText } : {}),
          ...(editCategoryId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editCategoryId) ? { category_id: editCategoryId } : {}),
        },
      });
      setShowEditModal(false);
      showStatus('✅ 灵感已更新');
    } catch (e) {
      console.error('保存失败', e);
      showStatus('❌ 保存失败');
    } finally {
      setSaving(false);
    }
  };

  const copyContent = async () => {
    if (!inspiration) return;
    const parts = [
      inspiration.title,
      inspiration.original_text,
      inspiration.ai_summary,
      inspiration.prompt,
    ].filter(Boolean);
    const text = parts.join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showStatus('✅ 内容已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showStatus('❌ 复制失败');
    }
  };

  const shareInspiration = async () => {
    const url = `${window.location.origin}/inspiration/detail?id=${id}`;
    const title = inspiration?.title || '灵感详情';
    const text = inspiration?.original_text || inspiration?.ai_summary || inspiration?.title || '';
    // 取第一张图片作为分享缩略图
    const shareImage = inspiration?.thumbnail_url || inspiration?.media_urls?.[0] || '';

    // 优先使用系统原生分享（支持 files 的浏览器传图片）
    if (navigator.share) {
      try {
        const shareData: ShareData = { title, text: text.substring(0, 256), url };
        // 如果有分享图片且浏览器支持 files，尝试获取图片并附加
        if (shareImage && (navigator as any).canShare?.({ files: [] })) {
          try {
            const res = await fetch(shareImage);
            const blob = await res.blob();
            const file = new File([blob], 'inspiration.jpg', { type: blob.type || 'image/jpeg' });
            (shareData as any).files = [file];
          } catch { /* 获取图片失败，不带图片分享 */ }
        }
        await navigator.share(shareData);
        showStatus('✅ 已分享');
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          showStatus('❌ 分享失败');
        }
      }
      return;
    }

    // 回退：复制链接到剪贴板
    try {
      await navigator.clipboard.writeText(url);
      showStatus('✅ 链接已复制，可粘贴分享');
    } catch {
      // 兜底：显示链接让用户手动复制
      try {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showStatus('✅ 链接已复制到剪贴板');
      } catch {
        showStatus('❌ 复制失败，请手动分享');
      }
    }
  };

  const handleNavigate = (page: PageKey, params?: string) => {
    switch (page) {
      case "home": router.push("/home"); break;
      case "inspiration": router.push("/inspiration"); break;
      case "ai-copywriting": router.push("/ai/copywriting"); break;
      case "ai": router.push("/ai"); break;
      case "hotspot": router.push("/hotspot"); break;
      case "hotspot-detail": router.push(`/hotspot/detail${params || ''}`); break;
      case "profile": router.push("/profile"); break;
      default: router.push("/home");
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-28">
      <TopNav
        title="灵感详情"
        showBack
        onBack={() => router.back()}
        showShare
        onShare={shareInspiration}
      />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* Loading State */}
        {isLoading && (
          <div className="py-12">
            <LoadingSpinner />
          </div>
        )}

        {/* Error State */}
        {!isLoading && isError && (
          <div className="flex flex-col items-center py-16 gap-4">
            <p style={{ color: '#FCA5A5', fontSize: 16 }}>加载失败</p>
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>请检查网络后重试</p>
            <button onClick={() => router.refresh()}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ color: '#93C5FD', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
              重新加载
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && !inspiration && (
          <div className="flex flex-col items-center py-16 gap-4">
            <p style={{ color: '#9CA3AF', fontSize: 16 }}>作品不存在或已删除</p>
            <button onClick={() => router.push('/inspiration')}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ color: '#93C5FD', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
              返回作品库
            </button>
          </div>
        )}

        {/* Content */}
        {!isLoading && inspiration && (
          <>
            <div className="flex items-center gap-2">
              <GlassBadge color="primary">
                {typeEmojis[inspiration.type] || "📝"} {typeLabels[inspiration.type] || "灵感"}
              </GlassBadge>
              <GlassBadge color="default">
                {statusLabels[inspiration.status] || "正常"}
              </GlassBadge>
              <button
                onClick={copyContent}
                className="ml-auto p-1.5 rounded-lg transition-all"
                style={{
                  background: copied ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)",
                  border: copied ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.12)",
                }}
                title="复制内容"
              >
                {copied ? <Check size={15} color="#22C55E" /> : <Copy size={15} color="#9CA3AF" />}
              </button>
            </div>

            <h1 style={{ color: "#FFFFFF", fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>
              {inspiration.title ? stripMarkdown(inspiration.title) : "未命名"}
            </h1>

            <p style={{ color: "#9CA3AF", fontSize: 12, marginTop: 6 }}>
              添加于 {new Date(inspiration.created_at).toLocaleDateString("zh-CN")}
            </p>

            {/* 状态提示 */}
            {statusMsg && (
              <div
                className="p-3 rounded-lg text-sm text-center"
                style={{
                  background: statusMsg.startsWith('❌') ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                  border: `1px solid ${statusMsg.startsWith('❌') ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
                  color: statusMsg.startsWith('❌') ? "#FCA5A5" : "#86EFAC",
                }}
              >
                {statusMsg}
              </div>
            )}

            {/* 文档附件区（仅当 original_file_url 存在时） */}
            {inspiration.original_file_url && (
              <GlassCard className="mb-3">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}
                  >
                    <FileText size={18} color="#93C5FD" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 600 }} className="truncate">
                      {inspiration.original_filename || '原始文件'}
                    </p>
                    <p style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>
                      {formatFileSize(inspiration.original_file_size)}
                    </p>
                    {inspiration.original_mime_type === 'application/pdf' && (
                      <div className="mt-2">
                        <iframe
                          src={inspiration.original_file_url}
                          title={inspiration.original_filename || 'PDF preview'}
                          className="w-full rounded-lg"
                          style={{ height: 400, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <a
                        href={inspiration.original_file_url}
                        download={inspiration.original_filename || true}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs"
                        style={{ background: "rgba(59,130,246,0.2)", color: "#93C5FD", border: "1px solid rgba(59,130,246,0.3)" }}
                      >
                        <Download size={12} /> 下载
                      </a>
                    </div>
                  </div>
                </div>
              </GlassCard>
            )}

            {/* 原素材卡片 — 根据类型展示 */}
            <GlassCard style={{ overflow: 'hidden' }}>
              <p style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 8 }}>
                {typeEmojis[inspiration.type] || "📝"} 原素材
              </p>

              {/* 图片 */}
              {inspiration.type === 'image' && (
                <div>
                  {inspiration.media_urls?.[0] ? (
                    <img
                      src={inspiration.media_urls[0]}
                      alt={inspiration.title || "图片灵感"}
                      loading="lazy"
                      className="w-full rounded-lg mb-2 object-cover max-h-96"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    />
                  ) : inspiration.thumbnail_url ? (
                    <img
                      src={inspiration.thumbnail_url}
                      alt={inspiration.title || "图片灵感"}
                      loading="lazy"
                      className="w-full rounded-lg mb-2 object-cover max-h-96"
                    />
                  ) : null}
                  {inspiration.original_text && (
                    <FormattedText text={inspiration.original_text} color="#E5E7EB" fontSize={13} lineHeight={1.6} />
                  )}
                </div>
              )}

              {/* 视频 */}
              {inspiration.type === 'video' && (
                <div>
                  {inspiration.media_urls?.[0] && (
                    <video
                      src={inspiration.media_urls[0]}
                      controls
                      playsInline
                      poster={inspiration.thumbnail_url || undefined}
                      className="w-full rounded-lg mb-3 max-h-96"
                      style={{ background: "#000" }}
                      preload="metadata"
                    >
                      您的浏览器不支持视频播放
                    </video>
                  )}
                  {inspiration.original_text && (
                    <FormattedText text={inspiration.original_text} color="#E5E7EB" fontSize={13} lineHeight={1.6} />
                  )}
                </div>
              )}

              {/* 链接 */}
              {inspiration.type === 'link' && (
                <div>
                  {inspiration.source_url && (
                    <a
                      href={inspiration.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 rounded-lg mb-2 transition-colors hover:bg-white/5"
                      style={{
                        background: "rgba(59,130,246,0.1)",
                        border: "1px solid rgba(59,130,246,0.25)",
                      }}
                    >
                      <span style={{ fontSize: 20 }}>🔗</span>
                      <div className="flex-1 min-w-0">
                        <p style={{ color: "#93C5FD", fontSize: 13, fontWeight: 600 }} className="truncate">
                          {inspiration.source_platform || "外部链接"}
                        </p>
                        <p style={{ color: "#9CA3AF", fontSize: 12 }} className="truncate">
                          {inspiration.source_url}
                        </p>
                      </div>
                      <span style={{ color: "#3B82F6", fontSize: 12, flexShrink: 0 }}>打开 ↗</span>
                    </a>
                  )}
                  {inspiration.original_text && (
                    <FormattedText text={inspiration.original_text} color="#E5E7EB" fontSize={13} lineHeight={1.6} />
                  )}
                </div>
              )}

              {/* 日程 */}
              {(inspiration as any).type === 'schedule' && (
                <div>
                  {/* 日程概览卡片 */}
                  <div
                    className="p-4 rounded-lg mb-4"
                    style={{
                      background: "rgba(251,191,36,0.08)",
                      border: "1px solid rgba(251,191,36,0.2)",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span style={{ fontSize: 28 }}>📅</span>
                      <div>
                        <p style={{ color: "#FBBF24", fontSize: 16, fontWeight: 700 }}>
                          {inspiration.title || "日程安排"}
                        </p>
                        <p style={{ color: "#9CA3AF", fontSize: 11 }}>
                          AI 分析 · 创建于 {new Date(inspiration.created_at).toLocaleDateString("zh-CN")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 核心内容 */}
                  {inspiration.original_text && (
                    <div className="mb-4 p-4 rounded-lg"
                      style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.25)" }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span style={{ color: "#FBBF24", fontSize: 13, fontWeight: 600 }}>📝 核心内容</span>
                      </div>
                      <FormattedText text={inspiration.original_text || ""} color="#E5E7EB" fontSize={13} lineHeight={1.7} />
                    </div>
                  )}

                  {/* 任务清单 */}
                  {inspiration.ai_key_points && inspiration.ai_key_points.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <span style={{ color: "#22C55E", fontSize: 14 }}>📋</span>
                        <span style={{ color: "#22C55E", fontSize: 13, fontWeight: 600 }}>任务清单</span>
                        <span style={{ color: "#9CA3AF", fontSize: 11 }}>({inspiration.ai_key_points.length} 项)</span>
                      </div>
                      <div className="space-y-2">
                        {inspiration.ai_key_points.map((point: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-lg"
                            style={{ background: "rgba(255,255,255,0.03)" }}
                          >
                            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                              style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}
                            >
                              <span style={{ color: "#22C55E", fontSize: 10, fontWeight: 700 }}>{idx + 1}</span>
                            </div>
                            <span style={{ color: "#D1D5DB", fontSize: 13, lineHeight: 1.5 }}>{point}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 备选方案 */}
                  {inspiration.ai_creation_suggestions && inspiration.ai_creation_suggestions.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <span style={{ fontSize: 14 }}>💡</span>
                        <span style={{ color: "#A78BFA", fontSize: 13, fontWeight: 600 }}>备选方案</span>
                        <span style={{ color: "#9CA3AF", fontSize: 11 }}>({inspiration.ai_creation_suggestions.length} 个)</span>
                      </div>
                      <div className="space-y-2">
                        {inspiration.ai_creation_suggestions.map((suggestion: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-lg"
                            style={{ background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)" }}
                          >
                            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}
                            >
                              <span style={{ color: "#A78BFA", fontSize: 10, fontWeight: 700 }}>{idx + 1}</span>
                            </div>
                            <span style={{ color: "#D1D5DB", fontSize: 13, lineHeight: 1.5 }}>{suggestion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 原始内容 */}
                  {inspiration.original_text && (
                    <div className="mb-4">
                      <p style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 6 }}>📝 原始内容</p>
                      <FormattedText text={inspiration.original_text || ""} color="#E5E7EB" fontSize={13} lineHeight={1.6} />
                    </div>
                  )}
                </div>
              )}

              {/* 音频 */}
              {inspiration.type === 'audio' && (
                <div>
                  {inspiration.media_urls?.[0] ? (
                    <audio
                      src={inspiration.media_urls[0]}
                      controls
                      preload="metadata"
                      className="w-full mb-2"
                      style={{ height: 40 }}
                    >
                      您的浏览器不支持音频播放
                    </audio>
                  ) : (
                    <p style={{ color: "#6B7280", fontSize: 13 }}>暂无音频文件</p>
                  )}
                  {inspiration.original_text && (
                    <FormattedText text={inspiration.original_text} color="#E5E7EB" fontSize={13} lineHeight={1.6} />
                  )}
                </div>
              )}

              {/* 文本 / 语音（默认文本展示） */}
              {(inspiration.type === 'text' || inspiration.type === 'voice' || !inspiration.type) && (
                <FormattedText text={inspiration.original_text || "暂无原始内容"} color="#E5E7EB" fontSize={14} lineHeight={1.7} />
              )}
            </GlassCard>

            {/* 生成提示词 */}
            {inspiration.prompt && (
              <GlassCard style={{ border: "1px solid rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.06)" } as React.CSSProperties}>
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center"
                    style={{ background: "#8B5CF6", fontSize: 10, color: "#fff", fontWeight: 700 }}
                  >AI</div>
                  <span style={{ color: "#C4B5FD", fontSize: 13, fontWeight: 600 }}>生成提示词</span>
                </div>
                <p className="selectable" style={{ color: "#E5E7EB", fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {inspiration.prompt}
                </p>
              </GlassCard>
            )}

            <GlassCard className="!p-3">
              <p style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 10 }}>快捷操作</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "去AI生成文案", icon: <Zap size={14} />, action: () => router.push(`/ai/copywriting?inspirationId=${id}`) },
                  { label: "添加到日程", icon: <CalendarPlus size={14} />, action: () => router.push(`/schedule?inspirationId=${id}&title=${encodeURIComponent(inspiration?.title || '')}`) },
                  { label: "分享", icon: <Share2 size={14} />, action: shareInspiration },
                  ...(inspiration.prompt ? [
                    { label: "做同款图片", icon: <ImageIcon size={14} />, action: () => router.push(`/ai/image?prompt=${encodeURIComponent(inspiration.prompt!)}`) },
                    { label: "做同款视频", icon: <VideoIcon size={14} />, action: () => router.push(`/ai/video?prompt=${encodeURIComponent(inspiration.prompt!)}`) },
                  ] : []),
                ].map(({ label, icon, action }, idx) => (
                  <button
                    key={idx}
                    onClick={action}
                    className="flex items-center gap-2 py-2 px-3 rounded-xl text-xs"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#E5E7EB" }}
                  >
                    <span style={{ color: "#3B82F6" }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </GlassCard>

            {/* 关联日程 */}
            {linkedSchedules.length > 0 && (
              <GlassCard className="!p-3 mb-4" style={{ border: "1px solid rgba(139,92,246,0.3)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <CalendarPlus size={15} color="#A78BFA" />
                  <span style={{ color: "#C4B5FD", fontSize: 13, fontWeight: 600 }}>关联日程</span>
                  <span style={{ color: "#9CA3AF", fontSize: 11 }}>({linkedSchedules.length})</span>
                </div>
                <div className="space-y-2">
                  {linkedSchedules.map((s: any) => {
                    const sTime = new Date(s.scheduled_at).toLocaleString("zh-CN", {
                      month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
                    });
                    const statusColors: Record<string, string> = { pending: "#F59E0B", completed: "#22C55E", cancelled: "#6B7280" };
                    const statusLabels: Record<string, string> = { pending: "待执行", completed: "已完成", cancelled: "已取消" };
                    return (
                      <div
                        key={s.id}
                        onClick={() => router.push(`/schedule/${s.id}`)}
                        className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors"
                        style={{ background: "rgba(255,255,255,0.03)" }}
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColors[s.status] || "#6B7280" }} />
                        <span className="flex-1 truncate" style={{ color: "#E5E7EB", fontSize: 12 }}>{s.title}</span>
                        <span style={{ color: "#6B7280", fontSize: 10 }} className="flex-shrink-0">{sTime}</span>
                        <span style={{ color: statusColors[s.status] || "#6B7280", fontSize: 9 }} className="flex-shrink-0">
                          {statusLabels[s.status] || s.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            )}

            <div>
              <h3 style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 10 }}>相关灵感</h3>
              {relatedInspirations.length === 0 ? (
                <p style={{ color: "#6B7280", fontSize: 13 }}>暂无相关灵感</p>
              ) : (
                <div className="columns-2 gap-3 [&>*]:[break-inside:avoid]">
                  {relatedInspirations.map((item) => {
                    const coverUrl = item.media_urls?.[0] || item.thumbnail_url;
                    const isImg = item.type === 'image';
                    const isVid = item.type === 'video';
                    const showCover = (isImg || isVid) && coverUrl;

                    return (
                    <GlassCard key={item.id} hover onClick={() => router.push(`/inspiration/detail?id=${item.id}`)} className="!p-0 mb-3 overflow-hidden">
                      {showCover ? (
                        <div className="relative w-full bg-gray-900/50">
                          <img src={coverUrl} alt={item.title || ''} loading="lazy" className="w-full object-cover" style={{ maxHeight: 160 }} />
                          {isVid && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                                <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                      <div className="p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span style={{ fontSize: 13 }}>{typeEmojis[item.type] || '✨'}</span>
                          <span style={{ color: '#6B7280', fontSize: 10 }}>
                            {new Date(item.created_at).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                        <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }} className="line-clamp-2">
                          {item.title || '未命名'}
                        </p>
                        {item.original_text && (
                          <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 3, lineHeight: 1.4 }} className="line-clamp-2">
                            {item.original_text}
                          </p>
                        )}
                      </div>
                    </GlassCard>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 10 }}>相关热点</h3>
              <div className="space-y-3">
                {relatedHotspots.length === 0 && (
                  <p style={{ color: "#6B7280", fontSize: 13 }}>暂无相关热点</p>
                )}
                {relatedHotspots.map((item) => (
                  <GlassCard key={item.id} hover onClick={() => router.push(`/hotspot?id=${item.id}`)} className="!p-4">
                    <div className="flex items-start gap-3">
                      <span style={{ fontSize: 28 }}>🔥</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <GlassBadge>{item.platform || '热点'}</GlassBadge>
                          <span style={{ color: '#EF4444', fontSize: 11, fontWeight: 600 }}>
                            相关度 {item.heatScore || item.relevance_score || '-'}
                          </span>
                        </div>
                        <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 4 }} className="truncate">
                          {item.title}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>

            {/* 编辑弹窗 */}
            {showEditModal && (
              <div
                className="fixed inset-0 z-50 flex items-end justify-center"
                style={{ background: 'rgba(0,0,0,0.6)' }}
                onClick={() => !saving && setShowEditModal(false)}
              >
                <div
                  className="w-full rounded-t-2xl p-5 overflow-y-auto"
                  style={{
                    maxWidth: 480,
                    maxHeight: '85vh',
                    background: '#1a2332',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-5">
                    <h3 style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 600 }}>编辑灵感</h3>
                    <button onClick={() => setShowEditModal(false)} className="p-1">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M1 1L17 17M1 17L17 1" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* 标题 */}
                    <div>
                      <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>标题</label>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                        placeholder="灵感标题"
                      />
                    </div>

                    {/* 分类 */}
                    <div>
                      <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>分类</label>
                      <select
                        value={editCategoryId}
                        onChange={(e) => setEditCategoryId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                      >
                        <option value="">无分类</option>
                        {(categories || []).map((cat: any) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.icon || '📁'} {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 原始内容 */}
                    <div>
                      <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>原始内容</label>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB', minHeight: 100 }}
                        placeholder="原始内容"
                      />
                    </div>

                    {/* AI 摘要 */}
                    <div>
                      <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>AI 摘要</label>
                      <textarea
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB', minHeight: 80 }}
                        placeholder="AI 分析摘要"
                      />
                    </div>

                    {/* 标签（只读展示） */}
                    {editTags && (
                      <div>
                        <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>标签</label>
                        <div className="flex flex-wrap gap-1.5">
                          {editTags.split(',').map((tag, i) => (
                            <span key={i}
                              className="px-2 py-0.5 rounded text-xs"
                              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93C5FD' }}
                            >
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => setShowEditModal(false)}
                        className="flex-1 py-2.5 rounded-xl text-sm"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#9CA3AF' }}
                      >
                        取消
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                        style={{
                          background: saving ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.2)',
                          border: '1px solid rgba(59,130,246,0.5)',
                          color: saving ? '#9CA3AF' : '#93C5FD',
                        }}
                      >
                        {saving ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Actions */}
      {!isLoading && inspiration && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-3"
          style={{
            background: "rgba(10,22,41,0.92)",
            backdropFilter: "blur(16px)",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            maxWidth: 480,
            margin: "0 auto",
            zIndex: 40,
          }}
        >
          <PrimaryButton fullWidth size="md" fontSize={14} onClick={() => router.push(`/ai/copywriting?inspirationId=${id}`)}>
            <Zap size={16} /> AI生成文案
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}

export default function InspirationDetailPage() {
  return (
    <ProtectedRoute>
      <InspirationDetailContent />
    </ProtectedRoute>
  );
}
