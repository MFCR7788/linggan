"use client";

import { useEffect, useState, createContext, useContext, useCallback, type ReactNode, useRef } from "react";
import { Check, X, AlertTriangle, Info } from "lucide-react";

// ====== 独立的 Toast 气泡组件（页面级使用） ======

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  onClose: () => void;
  duration?: number;
}

const typeConfig = {
  success: { bg: "rgba(34,197,94,0.92)", icon: Check },
  error: { bg: "rgba(239,68,68,0.92)", icon: X },
  info: { bg: "rgba(59,130,246,0.92)", icon: Info },
  warning: { bg: "rgba(245,158,11,0.92)", icon: AlertTriangle },
};

export function Toast({ message, type = "success", onClose, duration = 2500 }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const config = typeConfig[type] || typeConfig.success;
  const Icon = config.icon;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className="fixed bottom-24 left-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg transition-all duration-300"
      style={{
        transform: `translateX(-50%) ${visible ? "translateY(0)" : "translateY(20px)"}`,
        opacity: visible ? 1 : 0,
        background: config.bg,
        color: "#FFFFFF",
        backdropFilter: "blur(8px)",
      }}
    >
      <Icon size={16} />
      {message}
    </div>
  );
}

// ====== 全局 Toast 通知系统（context + provider） ======

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const GlobalToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(GlobalToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextId;
    setToasts(prev => [...prev.slice(-4), { id, message, type }]); // 最多 5 条
    const timer = setTimeout(() => {
      removeToast(id);
    }, 3000);
    timersRef.current.set(id, timer);
  }, [removeToast]);

  return (
    <GlobalToastContext.Provider value={{ showToast }}>
      {children}
      {/* 全局 Toast 层 */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => {
          const config = typeConfig[t.type] || typeConfig.success;
          const Icon = config.icon;
          return (
            <div
              key={t.id}
              onClick={() => removeToast(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 12,
                background: config.bg,
                backdropFilter: 'blur(12px)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                pointerEvents: 'auto',
                cursor: 'pointer',
                animation: 'toastIn 0.25s ease-out',
              }}
            >
              <Icon size={16} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
      <style jsx global>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </GlobalToastContext.Provider>
  );
}
