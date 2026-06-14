import { memo } from 'react';
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState = memo(function EmptyState({
  icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-10 px-6 ${className}`}>
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)" }}>
        {icon || <Inbox size={32} color="#6B7280" />}
      </div>
      <div className="text-center">
        <h3 style={{ color: "#E5E7EB", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{title}</h3>
        {description && (
          <p style={{ color: "#9CA3AF", fontSize: 13 }}>{description}</p>
        )}
      </div>
      {action}
    </div>
  );
});
