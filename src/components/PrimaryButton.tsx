import { ReactNode, ButtonHTMLAttributes } from "react";

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
  loading?: boolean;
  fontSize?: number;
}

export function PrimaryButton({
  children,
  onClick,
  size = "md",
  variant = "primary",
  className = "",
  fullWidth = false,
  disabled = false,
  loading = false,
  style,
  fontSize = 14,
  ...props
}: PrimaryButtonProps) {
  const heights = { sm: "32px", md: "40px", lg: "48px" };
  const px = { sm: "12px", md: "16px", lg: "24px" };

  const baseStyles = {
    primary: {
      background: (disabled || loading) ? "rgba(59,130,246,0.4)" : "#3B82F6",
      color: "#FFFFFF",
      border: "none",
      boxShadow: (disabled || loading) ? "none" : "0 0 20px rgba(59,130,246,0.5)",
    },
    secondary: {
      background: "transparent",
      color: "#3B82F6",
      border: "1px solid #3B82F6",
      boxShadow: "none",
    },
    ghost: {
      background: "rgba(255,255,255,0.1)",
      color: "#E5E7EB",
      border: "1px solid rgba(255,255,255,0.2)",
      boxShadow: "none",
    },
  };

  return (
    <button
      {...props}
      onClick={(disabled || loading) ? undefined : onClick}
      disabled={disabled || loading}
      className={`flex items-center justify-center gap-1.5 rounded-lg transition-all ${fullWidth ? "w-full" : ""} ${className}`}
      style={{
        height: heights[size],
        paddingLeft: px[size],
        paddingRight: px[size],
        fontSize: fontSize,
        fontWeight: 600,
        cursor: (disabled || loading) ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        ...baseStyles[variant],
        ...style,
      }}
    >
      {loading && (
        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      )}
      {!loading && children}
    </button>
  );
}
