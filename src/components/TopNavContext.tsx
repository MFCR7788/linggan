"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface TopNavConfig {
  title?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  showShare?: boolean;
  onShare?: () => void;
  right?: ReactNode;
  left?: ReactNode;
}

interface TopNavContextValue {
  config: TopNavConfig | null;
  setConfig: (config: TopNavConfig | null) => void;
}

const TopNavContext = createContext<TopNavContextValue | null>(null);

export function TopNavProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TopNavConfig | null>(null);
  return (
    <TopNavContext.Provider value={{ config, setConfig }}>
      {children}
    </TopNavContext.Provider>
  );
}

export function useTopNavContext() {
  const ctx = useContext(TopNavContext);
  if (!ctx) throw new Error("useTopNavContext must be used within TopNavProvider");
  return ctx;
}

export function useTopNavConfig(config: TopNavConfig | null) {
  const { setConfig } = useTopNavContext();
  useEffect(() => {
    setConfig(config);
    return () => setConfig(null);
    // 只依赖 config 值的序列化，避免对象引用变化导致无限循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config?.title,
    config?.showBack,
    config?.showShare,
    config?.right,
    config?.left,
    // onBack/onShare 函数引用变化也要触发更新
    config?.onBack,
    config?.onShare,
  ]);
}
