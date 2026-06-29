'use client';

import { useState, useCallback, useRef } from 'react';
import { Trash2 } from 'lucide-react';

interface SwipeableCardProps {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
}

/**
 * 可左滑露出的卡片容器。
 * - 左滑超过阈值 → 显示删除按钮
 * - 右滑或点击空白 → 恢复
 * - 点击删除按钮 → 触发 onDelete
 */
export function SwipeableCard({ children, onDelete, deleteLabel = '删除' }: SwipeableCardProps) {
  const [swipeState, setSwipeState] = useState<'idle' | 'open'>('idle');
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const translateXRef = useRef(0);

  const DELETE_WIDTH = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startXRef.current;
    const dy = e.touches[0].clientY - startYRef.current;

    // 仅追踪水平滑动（忽略垂直滚动）
    if (Math.abs(dy) > Math.abs(dx) * 1.5) return;

    const currentOffset = swipeState === 'open' ? -DELETE_WIDTH : 0;
    const clamped = Math.max(-DELETE_WIDTH, Math.min(0, currentOffset + dx));
    translateXRef.current = clamped;

    const el = (e.currentTarget as HTMLElement);
    el.style.transition = 'none';
    el.style.transform = `translateX(${clamped}px)`;
  }, [swipeState]);

  const handleTouchEnd = useCallback(() => {
    const el = document.querySelector(`[data-swipeable]`) as HTMLElement | null;
    // 使用 ref 来获取当前偏移
    const offset = translateXRef.current;

    if (offset < -DELETE_WIDTH * 0.4) {
      // 滑开
      setSwipeState('open');
      translateXRef.current = -DELETE_WIDTH;
    } else {
      // 恢复
      setSwipeState('idle');
      translateXRef.current = 0;
    }
  }, []);

  const handleClose = useCallback(() => {
    setSwipeState('idle');
    translateXRef.current = 0;
  }, []);

  const transform = swipeState === 'open' ? `translateX(-${DELETE_WIDTH}px)` : 'translateX(0px)';

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* 卡片后方：删除按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDelete();
          handleClose();
        }}
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center gap-0.5 text-white text-sm font-medium"
        style={{
          width: DELETE_WIDTH,
          background: 'linear-gradient(to right, rgba(239,68,68,0.9), rgba(239,68,68,1))',
        }}
      >
        <Trash2 size={18} color="#fff" />
        <span>{deleteLabel}</span>
      </button>

      {/* 卡片主体（可滑动） */}
      <div
        data-swipeable
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform,
          transition: 'transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1.2)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
