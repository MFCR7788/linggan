import { ArrowLeft, Share2 } from "lucide-react";
import { ReactNode } from "react";

interface TopNavProps {
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  showBack?: boolean;
  showShare?: boolean;
  onShare?: () => void;
}

export function TopNav({ title, left, right, onBack, showBack = false, showShare = false, onShare }: TopNavProps) {
  return (
    <div
      className="sticky top-0 flex items-center justify-between px-4 py-3 z-40"
      style={{
        background: "rgba(10, 22, 41, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div className="flex items-center gap-2 min-w-[40px]">
        {showBack && (
          <button onClick={onBack} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft size={22} color="#E5E7EB" />
          </button>
        )}
        {left}
      </div>
      <div style={{ color: "#FFFFFF", fontSize: 17, fontWeight: 600 }}>{title}</div>
      <div className="flex items-center gap-2 min-w-[40px] justify-end">
        {showShare && (
          <button onClick={onShare} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <Share2 size={20} color="#E5E7EB" />
          </button>
        )}
        {right}
      </div>
    </div>
  );
}
