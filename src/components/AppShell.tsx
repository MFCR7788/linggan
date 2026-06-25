"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { TopNavBar } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";

const EXCLUDED_PATHS = ["/login", "/agent"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hide = EXCLUDED_PATHS.includes(pathname);

  return (
    <>
      {!hide && <TopNavBar />}
      <main
        className="relative z-10 mx-auto bg-[#0A1629] shadow-[0_0_60px_rgba(0,0,0,0.5)] w-full max-w-[448px] landscape:max-w-full md:max-w-[720px] md:landscape:max-w-full lg:max-w-[1024px] lg:landscape:max-w-full"
        style={{
          height: "100dvh",
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehavior: "none",
          paddingTop: hide ? `env(safe-area-inset-top)` : `calc(52px + env(safe-area-inset-top))`,
          paddingBottom: hide ? `env(safe-area-inset-bottom)` : `calc(80px + env(safe-area-inset-bottom))`,
        }}
      >
        {children}
      </main>
      {!hide && <BottomNav />}
    </>
  );
}
