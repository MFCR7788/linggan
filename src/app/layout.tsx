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
  viewportFit: 'cover',
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
    <html lang="zh-CN" style={{ background: "#0A1629" }}>
      <body style={{ margin: 0, padding: 0, minHeight: "100%", fontFamily, background: "#0A1629" }}>
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
