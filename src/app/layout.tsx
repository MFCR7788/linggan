import type { Metadata } from "next";
import "./globals.css";
import { StarBackground } from "@/components/StarBackground";
import { ReactQueryProvider } from "@/providers/react-query-provider";
import { ToastProvider } from "@/components/Toast";
import { InsufficientCreditsModal } from "@/components/InsufficientCreditsModal";

export const dynamic = 'force-dynamic';
export const fetchCache = 'default-cache';

const fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const metadata: Metadata = {
  title: "灵集 LingJi",
  description: "AI 灵感创作助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, padding: 0, minHeight: "100vh", position: "relative", overflow: "auto", fontFamily }}>
        {/* 渐变背景 (铺满整个 viewport, 网页端两侧可见) */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "linear-gradient(135deg, #0A1629 0%, #1A365D 100%)",
            zIndex: 0,
          }}
        />
        {/* 星空背景 */}
        <StarBackground />
        {/* 容器: 始终以手机端宽度展示，桌面端居中，两侧露出星空背景 */}
        <main
          className="relative z-10 mx-auto bg-[#0A1629] shadow-[0_0_60px_rgba(0,0,0,0.5)] w-full max-w-[448px] md:max-w-[720px] lg:max-w-[1024px]"
          style={{
            minHeight: "100vh",
            // iOS safe area: 顶部给 status bar 留位置, 底部让 BottomNav 加 padding
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
            paddingLeft: "env(safe-area-inset-left)",
            paddingRight: "env(safe-area-inset-right)",
          }}
        >
          <ReactQueryProvider>
            <ToastProvider>
              {children}
              <InsufficientCreditsModal />
            </ToastProvider>
          </ReactQueryProvider>
        </main>
      </body>
    </html>
  );
}
