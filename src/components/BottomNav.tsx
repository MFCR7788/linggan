"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, BookOpen, Sparkles, Wand2, User } from "lucide-react";

export type PageKey = "home" | "inspiration" | "ai" | "hotspot" | "profile" | "login" | "inspiration-detail" | "ai-copywriting" | "ai-image" | "ai-video" | "ai-tts" | "ai-digital-human" | "ai-ads" | "hotspot-detail" | "hotspot-library" | "notification" | "capture" | "agent" | "schedule" | "profile-help" | "profile-settings" | "profile-integrations" | "profile-memory" | "profile-skills" | "schedule-detail";

const items = [
  { key: "home" as PageKey, label: "首页", Icon: Home, path: "/home" },
  { key: "inspiration" as PageKey, label: "灵感库", Icon: BookOpen, path: "/inspiration" },
  { key: "agent" as PageKey, label: "AI助手", Icon: Sparkles, isCenter: true, path: "/agent" },
  { key: "ai" as PageKey, label: "AI创作", Icon: Wand2, path: "/ai" },
  { key: "profile" as PageKey, label: "我的", Icon: User, path: "/profile" },
];

const PAGE_ROUTES: Record<string, string> = {
  home: "/home",
  inspiration: "/inspiration",
  agent: "/agent",
  ai: "/ai",
  hotspot: "/hotspot",
  profile: "/profile",
  login: "/login",
};

/** pathname → 底部 tab 映射 */
function getActiveTabFromPath(pathname: string): PageKey {
  if (pathname.startsWith("/inspiration")) return "inspiration";
  if (pathname.startsWith("/agent")) return "agent";
  if (pathname.startsWith("/ai") || pathname.startsWith("/publish") || pathname.startsWith("/insights") || pathname.startsWith("/workflow")) return "ai";
  if (pathname.startsWith("/hotspot")) return "hotspot";
  if (pathname.startsWith("/profile") || pathname.startsWith("/notification") || pathname.startsWith("/privacy") || pathname.startsWith("/terms") || pathname.startsWith("/support")) return "profile";
  if (pathname.startsWith("/schedule") || pathname.startsWith("/capture")) return "home";
  return "home";
}

function getPageUrl(key: PageKey): string {
  return `${window.location.origin}${PAGE_ROUTES[key] || `/${key}`}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const input = document.createElement("input");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      return true;
    } catch {
      return false;
    }
  }
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = getActiveTabFromPath(pathname);

  const [contextMenu, setContextMenu] = useState<{ pageKey: PageKey; x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [contextMenu]);

  const handleNavigate = useCallback((key: PageKey) => {
    router.push(PAGE_ROUTES[key] || `/${key}`);
  }, [router]);

  const handleContextMenu = useCallback((e: React.MouseEvent, key: PageKey) => {
    e.preventDefault();
    setContextMenu({ pageKey: key, x: e.clientX, y: e.clientY });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, key: PageKey) => {
    longPressTimerRef.current = setTimeout(() => {
      const touch = e.touches[0];
      setContextMenu({ pageKey: key, x: touch.clientX, y: touch.clientY });
    }, 600);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleCopyLink = useCallback(async (key: PageKey) => {
    const url = getPageUrl(key);
    await copyToClipboard(url);
    setContextMenu(null);
  }, []);

  const handleShare = useCallback(async (key: PageKey) => {
    const url = getPageUrl(key);
    const item = items.find(i => i.key === key);
    const title = item ? `灵集 - ${item.label}` : "灵集";
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch { /* 用户取消 */ }
    } else {
      await copyToClipboard(url);
    }
    setContextMenu(null);
  }, []);

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0"
        style={{
          zIndex: 50,
          background: "rgba(10, 22, 41, 0.98)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          className="flex items-center justify-around px-2 py-3 max-w-[480px] mx-auto"
          style={{
            background: "rgba(10, 22, 41, 0.98)",
            borderTop: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          {items.map(({ key, label, Icon, isCenter }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => handleNavigate(key)}
                onContextMenu={(e) => handleContextMenu(e, key)}
                onTouchStart={(e) => handleTouchStart(e, key)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onTouchMove={handleTouchEnd}
                className="flex flex-col items-center gap-1 px-2 py-1 rounded-xl transition-all select-none"
                title={`长按复制链接或分享 - ${label}`}
              >
                {isCenter ? (
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
                      boxShadow: "0 0 20px rgba(59,130,246,0.4)",
                    }}
                  >
                    <Icon size={24} color="#FFFFFF" />
                  </div>
                ) : (
                  <Icon
                    size={22}
                    style={{
                      color: isActive ? "#3B82F6" : "#9CA3AF",
                      filter: isActive ? "drop-shadow(0 0 6px rgba(59,130,246,0.7))" : "none",
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: 10,
                    color: isCenter ? "#A5B4FC" : (isActive ? "#3B82F6" : "#9CA3AF"),
                    fontWeight: isCenter ? 600 : 400,
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-[140px] rounded-xl py-1.5 shadow-2xl"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 160),
            top: Math.min(contextMenu.y - 80, window.innerHeight - 120),
            background: "rgba(15, 23, 42, 0.98)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <button
            onClick={() => handleCopyLink(contextMenu.pageKey)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            复制链接
          </button>
          <button
            onClick={() => handleShare(contextMenu.pageKey)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            分享页面
          </button>
          <button
            onClick={() => handleNavigate(contextMenu.pageKey)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            跳转到此页
          </button>
        </div>
      )}
    </>
  );
}
