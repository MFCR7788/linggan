import { Home, BookOpen, Sparkles, User, Plus } from "lucide-react";

export type PageKey = "home" | "inspiration" | "ai" | "hotspot" | "profile" | "login" | "inspiration-detail" | "ai-copywriting" | "ai-image" | "ai-video" | "ai-tts" | "ai-digital-human" | "ai-ads" | "hotspot-detail" | "hotspot-library" | "notification" | "capture" | "agent" | "schedule" | "profile-help" | "profile-settings" | "profile-integrations" | "profile-memory" | "profile-skills" | "schedule-detail";

interface BottomNavProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
}

// V3.0: AI工具tab移除，Agent成为中心按钮
const items = [
  { key: "home" as PageKey, label: "首页", Icon: Home },
  { key: "inspiration" as PageKey, label: "灵感库", Icon: BookOpen },
  { key: "agent" as PageKey, label: "AI助手", Icon: Sparkles, isCenter: true },
  { key: "profile" as PageKey, label: "我的", Icon: User },
];

export function BottomNav({
  activePage,
  onNavigate
}: BottomNavProps) {
  const activeTab = items.find(i => i.key === activePage)?.key ?? "home";

  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full"
      style={{
        zIndex: 50,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Navigation Tabs */}
      <div
        className="flex items-center justify-around px-2 py-3 max-w-[480px] mx-auto"
        style={{
          background: "rgba(10, 22, 41, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        {items.map(({ key, label, Icon, isCenter }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className="flex flex-col items-center gap-1 px-2 py-1 rounded-xl transition-all"
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
  );
}
