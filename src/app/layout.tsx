import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StarBackground } from "@/components/StarBackground";
import { ReactQueryProvider } from "@/providers/react-query-provider";
import { ToastProvider } from "@/components/Toast";
import { InsufficientCreditsModal } from "@/components/InsufficientCreditsModal";

export const dynamic = 'force-dynamic';
export const fetchCache = 'default-cache';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const metadata: Metadata = {
  title: "灵集 LingJi",
  description: "AI 灵感创作助手",
  manifest: "/manifest.json",
  icons: {
    icon: "/brand/favicon.svg",
    apple: "/brand/app-icon.svg",
  },
  openGraph: {
    title: "灵集 LingJi - AI 灵感创作助手",
    description: "AI 驱动的灵感收集与内容创作工具",
    images: ["/brand/app-icon.svg"],
  },
  twitter: {
    card: "summary",
    title: "灵集 LingJi",
    description: "AI 灵感创作助手",
    images: ["/brand/app-icon.svg"],
  },
  appleWebApp: {
    title: "灵集",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, padding: 0, height: "100%", position: "relative", overflow: "hidden", fontFamily }}>
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
            height: "100%",
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "none",
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
        {/* PWA Service Worker 注册 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
            `,
          }}
        />
      </body>
    </html>
  );
}
