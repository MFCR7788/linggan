'use client';

export function PageLoadingSkeleton({ title }: { title?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <img src="/brand/logo-mark.png" alt="灵集" className="w-14 h-14 mb-6 opacity-30 rounded-2xl" />
      <div className="w-10 h-10 border-3 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
      {title && (
        <p className="mt-4 text-sm text-purple-300/60">{title}加载中...</p>
      )}
    </div>
  );
}
