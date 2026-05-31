import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  /** Glass 风格背景 */
  glass?: boolean;
}

export const Input: React.FC<InputProps> = ({
  className = "",
  label,
  error,
  icon,
  glass = false,
  ...props
}) => {
  const inputElement = (
    <div className="relative">
      {icon && (
        <span className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }}>
          {icon}
        </span>
      )}
      <input
        className={`w-full h-12 rounded-xl bg-input text-white placeholder:text-gray-400
          focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
          transition-all duration-200
          ${icon ? "pl-12" : "px-4"}
          ${
            glass
              ? "bg-white/5 border border-white/20"
              : "border border-border"
          }
          ${className}`}
        {...props}
      />
    </div>
  );

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium mb-2 text-gray-200">
          {label}
        </label>
      )}
      {inputElement}
      {error && <p className="text-red-400 text-sm mt-1">{error}</p>}
    </div>
  );
};
