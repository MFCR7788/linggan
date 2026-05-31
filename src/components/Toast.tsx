"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "success" | "error";
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = "success", onClose, duration = 2500 }: ToastProps) {
  const [visible, setVisible] = useState(false);

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
        background: type === "success" ? "rgba(34,197,94,0.92)" : "rgba(239,68,68,0.92)",
        color: "#FFFFFF",
        backdropFilter: "blur(8px)",
      }}
    >
      {type === "success" ? <Check size={16} /> : <X size={16} />}
      {message}
    </div>
  );
}
