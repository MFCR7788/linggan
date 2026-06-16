"use client";

import { useState, useEffect } from "react";
import { FileText, Image as ImageIcon, Video as VideoIcon, Music, Mic, ChevronRight, Play, FileAudio, Grid3x3, BarChart3, Send, TrendingUp, Scissors, Wand2, Layers, PenTool } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components";
import { Toast } from "@/components/Toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { AccountTypeOnboarding } from "@/components/AccountTypeOnboarding";
import { CreditsWarningBanner } from "@/components/CreditsWarningBanner";
import { useInspirations } from "@/hooks/use-inspiration";
import { useAccountType } from "@/hooks/use-account-type";
import { TYPE_EMOJIS, TYPE_LABELS } from "@/lib/style-constants";
import { JargonTooltip } from "@/components/JargonTooltip";
interface AITool {
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
  path: string;
  badge?: string;
  disabled?: boolean;
}

const creationTools: AITool[] = [
  { icon: <FileText size={28} />, title: "AI 文案", desc: "写小红书/公众号/短视频文案", color: "#3B82F6", path: "/ai/copywriting" },
  { icon: <ImageIcon size={28} />, title: "AI 图片", desc: "生成封面图/配图/海报", color: "#8B5CF6", path: "/ai/image" },
  { icon: <VideoIcon size={28} />, title: "AI 视频", desc: "文案自动合成短视频", color: "#F43F5E", path: "/ai/video" },
  { icon: <Music size={28} />, title: "AI 配音", desc: "文字转自然语音多音色", color: "#22C55E", path: "/ai/tts" },
  { icon: <Mic size={28} />, title: "AI 数字人", desc: "虚拟主播替你出镜讲解", color: "#06B6D4", path: "/ai/digital-human", disabled: true, badge: "V1.1" },
  { icon: <Grid3x3 size={28} />, title: "9 宫格", desc: "6 种场景朋友圈配图", color: "#F59E0B", path: "/ai/ads", disabled: true, badge: "V1.1" },
];

const editTools: AITool[] = [
  { icon: <Wand2 size={28} />, title: "智能编辑", desc: "去废话/静音/重复精剪", color: "#A78BFA", path: "/ai/smart-clip", disabled: true, badge: "V2.0" },
  { icon: <Layers size={28} />, title: "AI 混剪", desc: "多素材智能编排+合成", color: "#F97316", path: "/ai/mashup", disabled: true, badge: "V2.0" },
  { icon: <PenTool size={28} />, title: "封面生成", desc: "智能选帧+标题+模板", color: "#EC4899", path: "/ai/cover-generator", disabled: true, badge: "V2.0" },
  { icon: <FileText size={28} />, title: "标题优化", desc: "多平台标题一键生成", color: "#14B8A6", path: "/ai/title-optimizer", disabled: true, badge: "V1.1" },
  { icon: <VideoIcon size={28} />, title: "视频混剪", desc: "图文+BGM+字幕合成", color: "#6366F1", path: "/ai/video-mix", disabled: true, badge: "V2.0" },
  { icon: <Scissors size={28} />, title: "图片编辑", desc: "去背景/变清晰/扩展", color: "#D946EF", path: "/ai/image-editor", disabled: true, badge: "V1.1" },
];

const dataTools: AITool[] = [
  { icon: <TrendingUp size={28} />, title: "热点选题", desc: "发现热门话题找灵感", color: "#EF4444", path: "/hotspot" },
  { icon: <Send size={28} />, title: "多平台分发", desc: "一键发布到多平台", color: "#F43F5E", path: "/publish", disabled: true, badge: "V1.1" },
  { icon: <BarChart3 size={20} />, title: "效果数据", desc: "公众号/微博数据追踪", color: "#06B6D4", path: "/insights", disabled: true, badge: "V1.1" },
];

function AICreationContent() {
  usePageTitle('AI创作');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const router = useRouter();
  const { accountType } = useAccountType();

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

  const sectionLabel: React.CSSProperties = {
    color: '#9CA3AF', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.05em', textTransform: 'uppercase',
  };

  const renderToolGrid = (tools: AITool[]) => (
    <div className="grid grid-cols-3 gap-2.5">
      {tools.map(({ icon, title, desc, color, path, badge, disabled }) => (
        <GlassCard
          key={title}
          hover={!disabled}
          onClick={() => !disabled && router.push(path)}
          className="!p-3 flex flex-col items-center text-center gap-1.5 relative overflow-hidden"
          style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
        >
          {badge && (
            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
              style={disabled ? { background: 'rgba(255,255,255,0.1)', color: '#6B7280' } : { background: '#F59E0B', color: '#000' }}>
              {badge}
            </span>
          )}
          <span style={{ color: disabled ? '#4B5563' : color, fontSize: 28 }}>{icon}</span>
          <p style={{ color: disabled ? '#6B7280' : '#FFFFFF', fontSize: 12, fontWeight: 600 }}>
            {disabled ? title : <JargonTooltip text={title} />}
          </p>
          <p style={{ color: '#6B7280', fontSize: 10, lineHeight: 1.3 }}>{desc}</p>
        </GlassCard>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav title="AI 工具" />
      <CreditsWarningBanner />

      <div className="flex-1 px-4 pt-4 space-y-5">
        {/* ─── AI 创作 ─── */}
        <div>
          <p style={{ ...sectionLabel, marginBottom: 8 }}>AI 创作</p>
          {renderToolGrid(creationTools)}
        </div>

        {/* ─── 智能编辑 ─── */}
        <div>
          <p style={{ ...sectionLabel, marginBottom: 8 }}>智能编辑</p>
          {renderToolGrid(editTools)}
        </div>

        {/* ─── 数据与分发 ─── */}
        <div>
          <p style={{ ...sectionLabel, marginBottom: 8 }}>数据与分发</p>
          {renderToolGrid(dataTools)}
        </div>

        {/* ─── 最近作品 ─── */}
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
                <div key={i} className="aspect-[3/4] rounded-xl animate-pulse"
                  style={{ background: 'rgba(255,255,255,0.06)' }} />
              ))}
            </div>
          ) : aiWorks.length === 0 ? (
            <GlassCard hover onClick={() => router.push('/ai/copywriting')}
              style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(139,92,246,0.04))' }}>
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
                      <span className="absolute top-1 left-1 px-1 rounded text-[10px] font-medium"
                        style={{ background: 'rgba(0,0,0,0.6)', color: '#FFFFFF' }}>
                        {typeLabel}
                      </span>
                      {item.type === 'voice' && (
                        <div className="absolute bottom-1 left-1">
                          <FileAudio size={12} color="#FFFFFF" />
                        </div>
                      )}
                    </div>
                    <p className="px-1.5 py-1 line-clamp-1" style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 500 }}>
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
