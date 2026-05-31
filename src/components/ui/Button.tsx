import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  glow?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  className = "",
  variant = "primary",
  size = "md",
  glow = false,
  loading = false,
  fullWidth = false,
  disabled,
  children,
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed";

  const variants: Record<string, string> = {
    primary:
      "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/25",
    secondary:
      "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    outline:
      "border border-border bg-transparent hover:bg-white/10",
    ghost: "bg-transparent hover:bg-white/10",
  };

  const sizes: Record<string, string> = {
    sm: "h-9 px-4 text-sm gap-1.5",
    md: "h-11 px-6 text-base gap-2",
    lg: "h-14 px-8 text-lg gap-2.5",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${
        glow ? "shadow-[0_0_20px_rgba(59,130,246,0.5)]" : ""
      } ${fullWidth ? "w-full" : ""} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {!loading && children}
    </button>
  );
};
