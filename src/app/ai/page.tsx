"use client";


import { useState, useEffect } from "react";
import { Zap, FileText, Image as ImageIcon, Video as VideoIcon, Music, Mic, ChevronRight, Play, FileAudio, Grid3x3, BarChart3, Send, Sparkles, ArrowRight } from "lucide-react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter } from "next/navigation";
import { ProtectedRoute, EmptyState } from "@/components";
import { Toast } from "@/components/Toast";
import { AccountTypeOnboarding } from "@/components/AccountTypeOnboarding";
import { CreditsWarningBanner } from "@/components/CreditsWarningBanner";
import { useInspirations } from "@/hooks/use-inspiration";
import { useAccountType } from "@/hooks/use-account-type";
import { getRecommendations } from "@/lib/account-presets";
import { buildHandoffUrl } from "@/hooks/use-content-handoff";
import { TYPE_EMOJIS, TYPE_LABELS } from "@/lib/style-constants";

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
  { icon: <Grid3x3 size={32} />, title: "朋友圈 9 宫格", desc: "产品+3-5卖点 → 9 张 1:1 封面 + 标题 ZIP", color: "#F59E0B", page: "ai-ads" as PageKey, badge: "新" },
  { icon: <Send size={32} />, title: "多平台分发", desc: "公众号/微博自动发 + 4 平台复制引导", color: "#F43F5E", page: "ai" as PageKey, path: "/publish", badge: "新" },
  { icon: <BarChart3 size={32} />, title: "效果数据", desc: "公众号/微博自动抓 + 其他平台手动录入", color: "#06B6D4", page: "ai" as PageKey, path: "/insights" },
];

function AICreationContent() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const router = useRouter();
  const { accountType, preset } = useAccountType();
  const recommendations = getRecommendations(accountType);

  // 新用户首次进入:弹账号类型引导(localStorage 记录 'lingji_onboarding_done' 避免重复弹)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (accountType) return; // 已有账号类型不弹
    const done = localStorage.getItem('lingji_onboarding_done');
    if (done) return;
    // 延迟 0.5s 弹,避免和页面首屏加载冲突
    const t = setTimeout(() => setShowOnboarding(true), 500);
    return () => clearTimeout(t);
  }, [accountType]);

  const closeOnboarding = () => {
    setShowOnboarding(false);
    try { localStorage.setItem('lingji_onboarding_done', '1'); } catch {}
  };

  // 拉取最近的 AI 作品（灵感库中 source_platform='ai' 的记录）
  const { data: aiWorks = [], isLoading: loadingWorks } = useInspirations({
    sourcePlatform: 'ai',
    limit: 6,
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  const handleNavigate = (page: PageKey, params?: string) => {
    switch (page) {
      case "home": router.push("/home"); break;
      case "inspiration": router.push("/inspiration"); break;
      case "ai-copywriting": router.push(`/ai/copywriting${params || ""}`); break;
      case "ai-image": router.push("/ai/image"); break;
      case "ai-video": router.push("/ai/video"); break;
      case "ai-tts": router.push("/ai/tts"); break;
      case "ai-digital-human": router.push("/ai/digital-human"); break;
      case "ai-ads": router.push("/ai/ads"); break;
      case "hotspot": router.push("/hotspot"); break;
      case "profile": router.push("/profile"); break;
      default: router.push("/home");
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav title="AI 创作" />

      {/* 余额不足警告横幅(< 20 时显示) */}
      <CreditsWarningBanner />

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

        {/* 推荐组合 — 根据账号类型智能推荐 3-4 套视频组合 + 4 步流水线 */}
        {recommendations.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} color="#F9A8D4" />
                <p style={{ color: "#9CA3AF", fontSize: 12 }}>
                  {preset ? `为「${preset.label}」推荐` : '推荐组合'}
                </p>
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                  style={{
                    background: 'linear-gradient(135deg, #F472B6, #8B5CF6)',
                    color: '#FFFFFF',
                  }}
                >
                  智能
                </span>
              </div>
              <button
                onClick={() => router.push('/profile/settings')}
                className="text-xs flex items-center gap-0.5"
                style={{ color: "#93C5FD" }}
              >
                换账号类型 <ChevronRight size={14} />
              </button>
            </div>

            <div className="space-y-2.5">
              {recommendations.map((combo) => (
                <GlassCard
                  key={combo.id}
                  hover
                  className="!p-3.5"
                  style={{
                    background: 'linear-gradient(135deg, rgba(244,114,182,0.06), rgba(139,92,246,0.06))',
                    border: '1px solid rgba(244,114,182,0.15)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span style={{ fontSize: 26 }}>{combo.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 700 }}>
                        {combo.title}
                      </p>
                      <p style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>
                        {combo.desc}
                      </p>

                      {/* 4 步流水线 */}
                      <div className="flex items-center gap-1 mt-2.5 flex-wrap">
                        {combo.steps.map((step, i) => (
                          <span key={i} className="flex items-center gap-1">
                            <span
                              className="px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                              style={{
                                background: 'rgba(255,255,255,0.08)',
                                color: '#E5E7EB',
                              }}
                            >
                              {i + 1}. {step.label}
                            </span>
                            {i < combo.steps.length - 1 && (
                              <ArrowRight size={10} color="#6B7280" />
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const firstStep = combo.steps[0];
                        const url = buildHandoffUrl(firstStep.entry, combo.prefills || {});
                        router.push(url);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg, #F472B6, #8B5CF6)',
                        color: '#FFFFFF',
                      }}
                    >
                      开始 <ArrowRight size={12} />
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}

        {/* Creation Entry */}
        <div>
          <p style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 10 }}>创作入口</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {creationEntries.map(({ icon, title, desc, color, page, badge, path }) => (
              <GlassCard
                key={title}
                hover
                onClick={() => path ? router.push(path) : handleNavigate(page)}
                className="!p-4 flex flex-col items-center text-center gap-2 relative overflow-hidden"
              >
                {badge && (
                  <span
                    className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{
                      background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
                      color: '#FFFFFF',
                    }}
                  >
                    {badge}
                  </span>
                )}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: color, opacity: 0.5 }} />
                <span style={{ color, filter: `drop-shadow(0 0 12px ${color}66)`, fontSize: 32 }}>{icon}</span>
                <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 700 }}>{title}</p>
                <p style={{ color: "#9CA3AF", fontSize: 10, lineHeight: 1.4 }}>{desc}</p>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* 我的作品：直接展示灵感库中 source_platform='ai' 的最近作品 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p style={{ color: "#9CA3AF", fontSize: 12 }}>我的作品</p>
            {aiWorks.length > 0 && (
              <button
                onClick={() => router.push('/inspiration?filter=AI作品')}
                className="flex items-center gap-0.5 text-xs"
                style={{ color: "#93C5FD" }}
              >
                查看全部 <ChevronRight size={14} />
              </button>
            )}
          </div>

          {loadingWorks ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6 gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="aspect-[3/4] rounded-xl animate-pulse"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                />
              ))}
            </div>
          ) : aiWorks.length === 0 ? (
            <GlassCard
              hover
              onClick={() => handleNavigate('ai-copywriting')}
              style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(139,92,246,0.06))' }}
            >
              <div className="flex items-center gap-3 py-2">
                <span style={{ fontSize: 28 }}>✨</span>
                <div className="flex-1 min-w-0">
                  <p style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 600 }}>还没有 AI 作品</p>
                  <p style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>点击上方任意创作入口开始生成</p>
                </div>
                <ChevronRight size={18} color="#9CA3AF" />
              </div>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6 gap-2">
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
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <div className="relative w-full" style={{ aspectRatio: '3/4' }}>
                      {isImage && thumb ? (
                        <img src={thumb} alt={item.title || ''} loading="lazy" className="w-full h-full object-cover" />
                      ) : isVideo && thumb ? (
                        <>
                          <video src={thumb} muted preload="metadata" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
                              <Play size={12} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 1 }} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2">
                          <span style={{ fontSize: 24 }}>{typeEmoji}</span>
                        </div>
                      )}
                      {/* 类型角标 */}
                      <span
                        className="absolute top-1 left-1 px-1 rounded text-[10px] font-medium"
                        style={{ background: "rgba(0,0,0,0.6)", color: "#FFFFFF" }}
                      >
                        {typeLabel}
                      </span>
                      {/* 音频/语音：左下角图标 */}
                      {item.type === 'voice' && (
                        <div className="absolute bottom-1 left-1">
                          <FileAudio size={12} color="#FFFFFF" />
                        </div>
                      )}
                    </div>
                    <p
                      className="px-1.5 py-1 line-clamp-1"
                      style={{ color: "#FFFFFF", fontSize: 10, fontWeight: 500 }}
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
