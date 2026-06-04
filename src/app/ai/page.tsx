"use client";

import { useState, useEffect } from "react";
import { FileText, Image as ImageIcon, Video as VideoIcon, Music, Mic, ChevronRight, Play, FileAudio, Grid3x3, BarChart3, Send, Sparkles, ArrowRight } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components";
import { Toast } from "@/components/Toast";
import { AccountTypeOnboarding } from "@/components/AccountTypeOnboarding";
import { CreditsWarningBanner } from "@/components/CreditsWarningBanner";
import { useInspirations } from "@/hooks/use-inspiration";
import { useAccountType } from "@/hooks/use-account-type";
import { getRecommendations } from "@/lib/account-presets";
import { useWorkflowSessions, useWorkflowSession } from "@/hooks/use-workflow-session";
import { WorkflowSessionCard } from "@/components/WorkflowSessionCard";
import { TYPE_EMOJIS, TYPE_LABELS } from "@/lib/style-constants";

// ─── AI 创作工具 ──────────────────────────────
const aiCreationTools = [
  { icon: <FileText size={28} />, title: "AI 文案", desc: "小红书/公众号/短视频脚本/多平台改写", color: "#3B82F6", page: "ai-copywriting" as PageKey },
  { icon: <ImageIcon size={28} />, title: "AI 图片", desc: "封面图/配图/海报 · 增强/抠图", color: "#8B5CF6", page: "ai-image" as PageKey },
  { icon: <VideoIcon size={28} />, title: "AI 视频", desc: "短视频自动合成 · 分镜/字幕/BGM", color: "#F43F5E", page: "ai-video" as PageKey },
  { icon: <Mic size={28} />, title: "AI 数字人", desc: "AI写稿 · 一键成片 · 批量口播", color: "#06B6D4", page: "ai-digital-human" as PageKey },
  { icon: <Music size={28} />, title: "AI 配音", desc: "多音色文本转语音 · 男女声可选", color: "#22C55E", page: "ai-tts" as PageKey },
  { icon: <Grid3x3 size={28} />, title: "朋友圈 9 宫格", desc: "产品+卖点 → 9 张封面 + ZIP", color: "#F59E0B", page: "ai-ads" as PageKey, badge: "新" },
];

// ─── 分发 & 数据 ──────────────────────────────
const utilityTools = [
  { icon: <Send size={20} />, title: "多平台分发", desc: "公众号/微博自动发 + 复制引导", color: "#F43F5E", path: "/publish", badge: "新" },
  { icon: <BarChart3 size={20} />, title: "效果数据", desc: "公众号/微博自动抓 + 手动录入", color: "#06B6D4", path: "/insights" },
];

function AICreationContent() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const router = useRouter();
  const { accountType, preset } = useAccountType();
  const recommendations = getRecommendations(accountType);

  // 工作流会话
  const { createSession, isCreating } = useWorkflowSession(null);
  const { data: activeSessions = [] } = useWorkflowSessions({ status: 'active' });
  const { data: pausedSessions = [] } = useWorkflowSessions({ status: 'paused' });
  const inProgressSessions = [...activeSessions, ...pausedSessions];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (accountType) return;
    const done = localStorage.getItem('lingji_onboarding_done');
    if (done) return;
    const t = setTimeout(() => setShowOnboarding(true), 500);
    return () => clearTimeout(t);
  }, [accountType]);

  const closeOnboarding = () => {
    setShowOnboarding(false);
    try { localStorage.setItem('lingji_onboarding_done', '1'); } catch {}
  };

  const { data: aiWorks = [], isLoading: loadingWorks } = useInspirations({
    sourcePlatform: 'ai',
    limit: 6,
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  const handleNavigate = (page: PageKey) => {
    const map: Record<string, string> = {
      home: '/home', inspiration: '/inspiration', 'ai-copywriting': '/ai/copywriting',
      'ai-image': '/ai/image', 'ai-video': '/ai/video', 'ai-tts': '/ai/tts',
      'ai-digital-human': '/ai/digital-human', 'ai-ads': '/ai/ads',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(map[page] || '/home');
  };

  const handleStartCombo = async (combo: (typeof recommendations)[number]) => {
    try {
      await createSession(combo, { accountType });
    } catch (e: any) {
      setToast({ message: e.message || '创建失败', type: 'error' });
    }
  };

  const sectionLabel: React.CSSProperties = {
    color: '#9CA3AF', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.05em', textTransform: 'uppercase',
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav title="AI 创作" />
      <CreditsWarningBanner />

      <div className="flex-1 px-4 pt-4 space-y-5">

        {/* ─── 1. 继续创作 (最高优先级) ─── */}
        {inProgressSessions.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={14} color="#FBBF24" />
              <p style={sectionLabel}>继续创作</p>
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24' }}
              >
                {inProgressSessions.length}
              </span>
            </div>
            <div className="space-y-2">
              {inProgressSessions.slice(0, 3).map((session) => (
                <WorkflowSessionCard
                  key={session.id}
                  session={session}
                  onResume={() => {
                    if (session.status === 'active') return;
                    fetch(`/api/workflow/sessions/${session.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'active' }),
                    }).catch(() => {});
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ─── 2. 推荐方案 (主力入口) ─── */}
        {recommendations.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} color="#F9A8D4" />
                <p style={sectionLabel}>
                  {preset ? `${preset.label} · 推荐方案` : '推荐方案'}
                </p>
              </div>
              <button
                onClick={() => router.push('/profile/settings')}
                className="text-[11px] flex items-center gap-0.5"
                style={{ color: '#93C5FD' }}
              >
                换账号 <ChevronRight size={12} />
              </button>
            </div>

            <div className="space-y-2">
              {recommendations.map((combo) => (
                <GlassCard
                  key={combo.id}
                  hover
                  className="!p-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(244,114,182,0.04), rgba(139,92,246,0.04))',
                    border: '1px solid rgba(244,114,182,0.12)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 24 }}>{combo.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 700 }}>
                        {combo.title}
                      </p>
                      <p style={{ color: '#6B7280', fontSize: 11, marginTop: 1, lineHeight: 1.4 }} className="line-clamp-1">
                        {combo.desc}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartCombo(combo); }}
                      disabled={isCreating}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg, #F472B6, #8B5CF6)',
                        color: '#FFFFFF',
                        opacity: isCreating ? 0.6 : 1,
                      }}
                    >
                      {isCreating ? '...' : '开始'} <ArrowRight size={11} />
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}

        {/* ─── 3. AI 创作工具 ─── */}
        <div>
          <p style={{ ...sectionLabel, marginBottom: 8 }}>AI 创作工具</p>
          <div className="grid grid-cols-3 gap-2.5">
            {aiCreationTools.map(({ icon, title, desc, color, page, badge }) => (
              <GlassCard
                key={title}
                hover
                onClick={() => handleNavigate(page)}
                className="!p-3 flex flex-col items-center text-center gap-1.5 relative overflow-hidden"
              >
                {badge && (
                  <span
                    className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: '#F59E0B', color: '#000' }}
                  >
                    {badge}
                  </span>
                )}
                <span style={{ color, fontSize: 28 }}>{icon}</span>
                <p style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 600 }}>{title}</p>
                <p style={{ color: '#6B7280', fontSize: 10, lineHeight: 1.3 }}>{desc}</p>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* ─── 4. 分发 & 数据 ─── */}
        <div>
          <p style={{ ...sectionLabel, marginBottom: 8 }}>分发 & 数据</p>
          <div className="grid grid-cols-2 gap-2.5">
            {utilityTools.map(({ icon, title, desc, color, path, badge }) => (
              <GlassCard
                key={title}
                hover
                onClick={() => router.push(path)}
                className="!p-3 flex items-center gap-3 relative overflow-hidden"
              >
                {badge && (
                  <span
                    className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: '#F59E0B', color: '#000' }}
                  >
                    {badge}
                  </span>
                )}
                <span style={{ color, fontSize: 20 }}>{icon}</span>
                <div className="flex-1 min-w-0">
                  <p style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 600 }}>{title}</p>
                  <p style={{ color: '#6B7280', fontSize: 10 }}>{desc}</p>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* ─── 5. 最近作品 ─── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p style={sectionLabel}>最近作品</p>
            {aiWorks.length > 0 && (
              <button
                onClick={() => router.push('/inspiration?filter=AI作品')}
                className="flex items-center gap-0.5 text-[11px]"
                style={{ color: '#93C5FD' }}
              >
                全部 <ChevronRight size={12} />
              </button>
            )}
          </div>

          {loadingWorks ? (
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="aspect-[3/4] rounded-xl animate-pulse"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                />
              ))}
            </div>
          ) : aiWorks.length === 0 ? (
            <GlassCard
              hover
              onClick={() => handleNavigate('ai-copywriting')}
              style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(139,92,246,0.04))' }}
            >
              <div className="flex items-center gap-3 py-1.5">
                <span style={{ fontSize: 24 }}>✨</span>
                <div className="flex-1 min-w-0">
                  <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600 }}>还没有 AI 作品</p>
                  <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>点击上方任意创作工具开始生成</p>
                </div>
                <ChevronRight size={16} color="#6B7280" />
              </div>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {aiWorks.map((item: any) => {
                const isVideo = item.type === 'video';
                const isImage = item.type === 'image';
                const thumb = item.thumbnail_url || item.media_urls?.[0];
                const typeEmoji = TYPE_EMOJIS[item.type] || '✨';
                const typeLabel = TYPE_LABELS[item.type] || item.type;
                return (
                  <button
                    key={item.id}
                    onClick={() => router.push(`/inspiration/detail?id=${item.id}`)}
                    className="relative rounded-xl overflow-hidden text-left transition-transform active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <div className="relative w-full" style={{ aspectRatio: '3/4' }}>
                      {isImage && thumb ? (
                        <img src={thumb} alt={item.title || ''} loading="lazy" className="w-full h-full object-cover" />
                      ) : isVideo && thumb ? (
                        <>
                          <video src={thumb} muted preload="metadata" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.25)' }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                              <Play size={12} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 1 }} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span style={{ fontSize: 28 }}>{typeEmoji}</span>
                        </div>
                      )}
                      <span
                        className="absolute top-1 left-1 px-1 rounded text-[10px] font-medium"
                        style={{ background: 'rgba(0,0,0,0.6)', color: '#FFFFFF' }}
                      >
                        {typeLabel}
                      </span>
                      {item.type === 'voice' && (
                        <div className="absolute bottom-1 left-1">
                          <FileAudio size={12} color="#FFFFFF" />
                        </div>
                      )}
                    </div>
                    <p
                      className="px-1.5 py-1 line-clamp-1"
                      style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 500 }}
                    >
                      {item.title || '未命名'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <AccountTypeOnboarding open={showOnboarding} onClose={closeOnboarding} />
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
