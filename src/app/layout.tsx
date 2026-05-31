import type { Metadata } from "next";
import "./globals.css";
import { StarBackground } from "@/components/StarBackground";
import { ReactQueryProvider } from "@/providers/react-query-provider";

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
        {/* 渐变背景 */}
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
        {/* 页面内容 */}
        <div style={{ position: "relative", zIndex: 10 }}>
          <ReactQueryProvider>
            {children}
          </ReactQueryProvider>
        </div>
      </body>
    </html>
  );
}
