"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/use-user";
import { LoadingSpinner } from "@/components";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AlertCircle } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { data: user, isLoading, error } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user && !error) {
      // 用户未登录，跳转到登录页面
      router.push("/login");
    }
  }, [user, isLoading, router, error]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <img src="/brand/logo-mark.png" alt="灵集" className="w-12 h-12 opacity-40" />
        <LoadingSpinner text="加载中..." />
      </div>
    );
  }

  // 如果有用户已登录，渲染子组件
  if (user) {
    return <ErrorBoundary>{children}</ErrorBoundary>;
  }

  // 错误或无用户，显示错误状态
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <img src="/brand/logo-mark.png" alt="灵集" className="w-10 h-10 mb-2 opacity-50" />
        <AlertCircle size={40} color="#EF4444" />
        <p style={{ color: "#FCA5A5", fontSize: 14, textAlign: "center" }}>加载用户信息失败</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg text-sm"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5" }}
        >
          重新加载
        </button>
      </div>
    );
  }

  // 未登录 → 显示加载并等待跳转
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <img src="/brand/logo-mark.png" alt="灵集" className="w-12 h-12 opacity-40" />
      <LoadingSpinner text="验证身份..." />
    </div>
  );
}
