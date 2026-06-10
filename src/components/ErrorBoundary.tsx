"use client";

import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center px-6"
          style={{
            background: "linear-gradient(135deg, #0A1629 0%, #1A365D 100%)",
            color: "#E5E7EB",
          }}
        >
          <img src="/brand/logo-mark.png" alt="灵集" className="w-12 h-12 mb-6 opacity-60" />
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: "rgba(239,68,68,0.2)",
              border: "1px solid rgba(239,68,68,0.4)",
            }}
          >
            <span style={{ fontSize: 32 }}>⚠️</span>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>出错了</h1>
          <p style={{ color: "#9CA3AF", fontSize: 14, textAlign: "center", marginBottom: 24, maxWidth: 320 }}>
            {this.state.error?.message || "页面发生了意外错误"}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-6 py-3 rounded-xl text-sm font-medium transition-all"
            style={{
              background: "#3B82F6",
              color: "#FFFFFF",
              boxShadow: "0 0 20px rgba(59,130,246,0.5)",
            }}
          >
            重新加载
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
