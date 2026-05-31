"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/use-user";
import { LoadingSpinner } from "@/components";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner text="加载中..." />
      </div>
    );
  }

  // 如果有用户已登录，渲染子组件
  if (user) {
    return <ErrorBoundary>{children}</ErrorBoundary>;
  }

  // 其他情况（未登录或错误），不渲染任何内容或可以显示错误状态
  return null;
}
