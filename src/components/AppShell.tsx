"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { TopNavBar } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";

const HIDE_TOP_PATHS = ["/login", "/agent"];
const HIDE_BOTTOM_PATHS = ["/login", "/agent"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideTop = HIDE_TOP_PATHS.includes(pathname);
  const hideBottom = HIDE_BOTTOM_PATHS.includes(pathname);
  const padTop = hideTop ? `env(safe-area-inset-top)` : `calc(52px + env(safe-area-inset-top))`;
  const padBottom = hideBottom ? `env(safe-area-inset-bottom)` : `calc(80px + env(safe-area-inset-bottom))`;

  return (
    <>
      {!hideTop && <TopNavBar />}
      <main
        className="relative z-10 mx-auto bg-[#0A1629] shadow-[0_0_60px_rgba(0,0,0,0.5)] w-full max-w-[448px] md:max-w-[720px] lg:max-w-[1024px]"
        style={{
          height: "100vh",
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehavior: "none",
          paddingTop: padTop,
          paddingBottom: padBottom,
        }}
      >
        {children}
      </main>
      {!hideBottom && <BottomNav />}
    </>
  );
}
