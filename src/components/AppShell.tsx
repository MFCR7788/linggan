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
        className="relative z-10 mx-auto bg-[#0A1629] shadow-[0_0_60px_rgba(0,0,0,0.5)] w-full max-w-[448px] md:max-w-[720px] lg:max-w-[1024px]"
        style={{
          minHeight: "100vh",
          paddingTop: hide ? 0 : 52,
          paddingBottom: hide ? 0 : 80,
        }}
      >
        {children}
      </main>
      {!hide && <BottomNav />}
    </>
  );
}
