import type { Metadata, Viewport } from "next";
import nextDynamic from "next/dynamic";
import "./globals.css";
import { ReactQueryProvider } from "@/providers/react-query-provider";

const StarBackground = nextDynamic(() => import("@/components/StarBackground").then(m => ({ default: m.StarBackground })), { ssr: false });
import { ToastProvider } from "@/components/Toast";
import { InsufficientCreditsModal } from "@/components/InsufficientCreditsModal";
import { TopNavProvider } from "@/components/TopNavContext";
import { AppShell } from "@/components/AppShell";

export const dynamic = 'force-dynamic';
export const fetchCache = 'default-cache';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

const fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const metadata: Metadata = {
  title: "灵集 LingJi",
  description: "AI 灵感创作助手",
  manifest: "/manifest.json",
  icons: {
    icon: "/brand/favicon.png",
    apple: "/brand/app-icon.png",
  },
  openGraph: {
    title: "灵集 LingJi - AI 灵感创作助手",
    description: "AI 驱动的灵感收集与内容创作工具",
    images: ["/brand/app-icon.png"],
  },
  twitter: {
    card: "summary",
    title: "灵集 LingJi",
    description: "AI 灵感创作助手",
    images: ["/brand/app-icon.png"],
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
    <html lang="zh-CN" style={{ background: "#0A1629" }}>
      <body style={{ margin: 0, padding: 0, height: "100dvh", overflow: "hidden", fontFamily, background: "#0A1629" }}>
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
        <TopNavProvider>
          <ReactQueryProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
              <InsufficientCreditsModal />
            </ToastProvider>
          </ReactQueryProvider>
        </TopNavProvider>
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
