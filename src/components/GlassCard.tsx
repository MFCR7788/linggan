import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
  active?: boolean;
  style?: React.CSSProperties;
}

export function GlassCard({ children, className = "", onClick, hover = false, active = false, style }: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-4 transition-all duration-200 ${hover ? "cursor-pointer hover:bg-white/20" : ""} ${active ? "ring-1 ring-blue-400" : ""} ${className}`}
      style={{
        background: "rgba(255, 255, 255, 0.12)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        boxShadow: active ? "0 4px 6px rgba(0,0,0,0.1), 0 0 20px rgba(59,130,246,0.3)" : "0 4px 6px rgba(0,0,0,0.1)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface GlassBadgeProps {
  children: ReactNode;
  color?: "default" | "primary" | "success" | "error" | "warning";
  className?: string;
  style?: React.CSSProperties;
}

export function GlassBadge({ children, color = "default", className = "", style }: GlassBadgeProps) {
  const colors = {
    default: "rgba(255,255,255,0.15)",
    primary: "rgba(59,130,246,0.4)",
    success: "rgba(34,197,94,0.3)",
    error: "rgba(239,68,68,0.3)",
    warning: "rgba(234,179,8,0.3)",
  };
  const textColors = {
    default: "#E5E7EB",
    primary: "#93C5FD",
    success: "#86EFAC",
    error: "#FCA5A5",
    warning: "#FDE047",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs ${className}`}
      style={{
        background: colors[color],
        border: "1px solid rgba(255,255,255,0.2)",
        color: textColors[color],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
