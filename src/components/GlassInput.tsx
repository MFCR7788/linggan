import React from "react";

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function GlassInput({ icon, ...props }: GlassInputProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 rounded-lg"
      style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.2)",
        height: 48,
      }}
    >
      {icon && <span style={{ color: "#9CA3AF" }}>{icon}</span>}
      <input
        {...props}
        className="bg-transparent flex-1 outline-none"
        style={{ color: "#FFFFFF", fontSize: 14 }}
      />
    </div>
  );
}
