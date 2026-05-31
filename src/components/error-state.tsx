import { AlertCircle, RefreshCw } from "lucide-react";
import { PrimaryButton } from "./PrimaryButton";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ 
  message = "加载失败，请重试", onRetry, className = "" }: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-10 ${className}`}>
      <AlertCircle size={32} color="#EF4444" />
      <p style={{ color: "#E5E7EB", fontSize: 14, textAlign: "center" }}>{message}</p>
      {onRetry && (
        <PrimaryButton size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw size={14} />
          重试
        </PrimaryButton>
      )}
    </div>
  );
}
