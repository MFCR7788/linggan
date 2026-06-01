"use client";


import { useState } from "react";
import { Zap, FileText, Image as ImageIcon, Video as VideoIcon, Music, Mic } from "lucide-react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components";
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

function AICreationContent() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const router = useRouter();

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

        {/* 我的作品 → 已合并到灵感库 */}
        <GlassCard
          hover
          onClick={() => router.push('/inspiration?filter=AI作品')}
          style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))', border: '1px solid rgba(59,130,246,0.2)' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                我的作品
              </h3>
              <p style={{ color: "#9CA3AF", fontSize: 12 }}>
                AI 生成的作品已合并至灵感库，点击查看全部 →
              </p>
            </div>
            <span style={{ fontSize: 28 }}>📂</span>
          </div>
        </GlassCard>
      </div>

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
