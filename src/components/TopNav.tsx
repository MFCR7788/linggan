"use client";

import { ArrowLeft, Share2 } from "lucide-react";
import { ReactNode } from "react";
import { useTopNavConfig, useTopNavContext, type TopNavConfig } from "@/components/TopNavContext";

interface TopNavProps {
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  showBack?: boolean;
  showShare?: boolean;
  onShare?: () => void;
}

/** 页面中调用：设置 TopNav 配置，不渲染任何 UI */
export function TopNav(props: TopNavProps) {
  const config: TopNavConfig = {
    title: props.title,
    left: props.left,
    right: props.right,
    showBack: props.showBack,
    onBack: props.onBack,
    showShare: props.showShare,
    onShare: props.onShare,
  };
  useTopNavConfig(config);
  return null;
}

/** AppShell 中渲染：fixed 顶部导航栏，从 Context 读取配置 */
export function TopNavBar() {
  const { config } = useTopNavContext();
  if (!config) return null;

  const { title, left, right, showBack, onBack, showShare, onShare } = config;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-40"
      style={{
        background: "rgba(10, 22, 41, 0.97)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 max-w-[448px] md:max-w-[720px] lg:max-w-[1024px] mx-auto"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
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
    </div>
  );
}
