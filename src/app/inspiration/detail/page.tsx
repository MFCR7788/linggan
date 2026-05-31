"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Share2, Zap, TrendingUp } from "lucide-react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { PrimaryButton } from "@/components/PrimaryButton";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter } from "next/navigation";
import { ProtectedRoute, LoadingSpinner } from "@/components";
import { syncDevAuthCookie, getDevUserIdHeader } from "@/lib/dev-auth";
import { useInspiration, useInspirations, useInspirationActions, useUpdateInspiration } from "@/hooks/use-inspiration";
import { useCategories } from "@/hooks/use-categories";

const typeEmojis: Record<string, string> = {
  text: "✨",
  link: "📝",
  image: "🖼️",
  video: "🎬",
  voice: "✍️",
  schedule: "📅",
};

const typeLabels: Record<string, string> = {
  text: "灵感",
  link: "选题",
  image: "图片",
  video: "视频",
  voice: "文案",
  schedule: "日程",
};

const statusLabels: Record<string, string> = {
  pending: "待处理",
  saved: "已收藏",
  used: "已使用",
  archived: "已归档",
  active: "正常",
};

function InspirationDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || undefined;
  const { data: inspiration, isLoading, isError } = useInspiration(id);
  const { updateStatus } = useInspirationActions();
  const updateInspiration = useUpdateInspiration();
  const { data: categories } = useCategories();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

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
    setEditSummary(inspiration?.ai_summary || '');
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
          ...(editSummary ? { ai_summary: editSummary } : {}),
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

  const shareInspiration = async () => {
    const url = `${window.location.origin}/inspiration/detail?id=${id}`;
    const title = inspiration?.title || '灵感详情';
    const text = inspiration?.ai_summary || inspiration?.title || '';

    // 优先使用系统原生分享
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        showStatus('✅ 已分享');
      } catch (e: any) {
        // 用户取消分享不算错误
        if (e?.name !== 'AbortError') {
          showStatus('❌ 分享失败');
        }
      }
      return;
    }

    // 回退：复制链接到剪贴板
    try {
      await navigator.clipboard.writeText(url);
      showStatus('✅ 链接已复制到剪贴板');
    } catch {
      showStatus('❌ 复制失败');
    }
  };

  const generateContent = (type?: string) => {
    const params = new URLSearchParams();
    if (id) params.set('inspirationId', id);
    if (type) params.set('type', type);
    router.push(`/ai/copywriting?${params.toString()}`);
  };

  const handleNavigate = (page: PageKey) => {
    switch (page) {
      case "home": router.push("/home"); break;
      case "inspiration": router.push("/inspiration"); break;
      case "ai-copywriting": router.push("/ai/copywriting"); break;
      case "ai": router.push("/ai"); break;
      case "hotspot": router.push("/hotspot"); break;
      case "hotspot-detail": router.push("/hotspot/detail"); break;
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
            </div>

            <h1 style={{ color: "#FFFFFF", fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>
              {inspiration.title || "未命名"}
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
                    <p style={{ color: "#E5E7EB", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {inspiration.original_text}
                    </p>
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
                  {inspiration.ai_summary && (
                    <p style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 8 }}>{inspiration.ai_summary}</p>
                  )}
                  {inspiration.original_text && (
                    <p style={{ color: "#E5E7EB", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {inspiration.original_text}
                    </p>
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
                    <p style={{ color: "#E5E7EB", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {inspiration.original_text}
                    </p>
                  )}
                </div>
              )}

              {/* 日程 */}
              {(inspiration as any).type === 'schedule' && (
                <div>
                  <div
                    className="p-4 rounded-lg mb-3"
                    style={{
                      background: "rgba(251,191,36,0.08)",
                      border: "1px solid rgba(251,191,36,0.2)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ fontSize: 24 }}>📅</span>
                      <div>
                        <p style={{ color: "#FBBF24", fontSize: 14, fontWeight: 600 }}>
                          {inspiration.title || "日程安排"}
                        </p>
                        <p style={{ color: "#9CA3AF", fontSize: 12 }}>
                          创建于 {new Date(inspiration.created_at).toLocaleDateString("zh-CN")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {inspiration.ai_summary && (
                    <div className="mb-3">
                      <p style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 4 }}>📋 详情</p>
                      <p style={{ color: "#E5E7EB", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word" }}>
                        {inspiration.ai_summary}
                      </p>
                    </div>
                  )}

                  {inspiration.ai_key_points && inspiration.ai_key_points.length > 0 && (
                    <div className="mb-3">
                      <p style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 4 }}>📌 关键事项</p>
                      <ul className="space-y-1">
                        {inspiration.ai_key_points.map((point: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2 text-sm" style={{ color: "#D1D5DB" }}>
                            <span style={{ color: "#FBBF24" }}>•</span>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {inspiration.ai_creation_suggestions && inspiration.ai_creation_suggestions.length > 0 && (
                    <div>
                      <p style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 4 }}>💡 建议</p>
                      <ul className="space-y-1">
                        {inspiration.ai_creation_suggestions.map((suggestion: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2 text-sm" style={{ color: "#D1D5DB" }}>
                            <span style={{ color: "#3B82F6" }}>•</span>
                            {suggestion}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {inspiration.original_text && !inspiration.ai_summary && (
                    <p style={{ color: "#E5E7EB", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {inspiration.original_text}
                    </p>
                  )}
                </div>
              )}

              {/* 文本 / 语音（默认文本展示） */}
              {(inspiration.type === 'text' || inspiration.type === 'voice' || !inspiration.type) && (
                <p style={{ color: "#E5E7EB", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word" }}>
                  {inspiration.original_text || "暂无原始内容"}
                </p>
              )}
            </GlassCard>

            {inspiration.ai_summary && (
              <GlassCard style={{ border: "1px solid rgba(59,130,246,0.4)", background: "rgba(59,130,246,0.06)" } as React.CSSProperties}>
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center"
                    style={{ background: "#3B82F6", fontSize: 10, color: "#fff", fontWeight: 700 }}
                  >AI</div>
                  <span style={{ color: "#93C5FD", fontSize: 13, fontWeight: 600 }}>AI 分析摘要</span>
                </div>
                <p style={{ color: "#E5E7EB", fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
                  {inspiration.ai_summary}
                </p>
              </GlassCard>
            )}

            <GlassCard className="!p-3">
              <p style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 10 }}>快捷操作</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "生成小红书文案", icon: <Zap size={14} />, action: () => generateContent('xiaohongshu') },
                  { label: "生成公众号文章", icon: <Zap size={14} />, action: () => generateContent('wechat') },
                  { label: "生成分镜脚本", icon: <Zap size={14} />, action: () => generateContent('script') },
                  { label: "分享", icon: <Share2 size={14} />, action: shareInspiration },
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

            <div>
              <h3 style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 600, marginBottom: 10 }}>相关灵感</h3>
              <div className="space-y-3">
                {relatedInspirations.length === 0 && (
                  <p style={{ color: "#6B7280", fontSize: 13 }}>暂无相关灵感</p>
                )}
                {relatedInspirations.map((item) => (
                  <GlassCard key={item.id} hover onClick={() => router.push(`/inspiration/detail?id=${item.id}`)} className="!p-4">
                    <div className="flex items-start gap-3">
                      <span style={{ fontSize: 28 }}>{typeEmojis[item.type] || "✨"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <GlassBadge color="primary">{typeLabels[item.type] || item.type}</GlassBadge>
                        </div>
                        <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 4 }} className="truncate">
                          {item.title}
                        </p>
                        <p style={{ color: "#9CA3AF", fontSize: 12 }} className="line-clamp-2">
                          {item.ai_summary || item.original_text || "暂无描述"}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>

            <div>
              <h3 style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 600, marginBottom: 10 }}>相关热点</h3>
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
          <PrimaryButton fullWidth size="md" fontSize={14} onClick={() => generateContent()}>
            <Zap size={16} /> 一键生成
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
