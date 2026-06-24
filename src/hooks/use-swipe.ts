"use client";

import { useRef, useCallback } from "react";

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

interface UseSwipeOptions {
  threshold?: number;   // 最小滑动距离 (px)，默认 60
  maxYDelta?: number;   // 最大垂直偏移 (px)，超出则不算水平滑动，默认 40
}

export function useSwipe(handlers: SwipeHandlers, options: UseSwipeOptions = {}) {
  const { threshold = 60, maxYDelta = 40 } = options;
  const startX = useRef(0);
  const startY = useRef(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    if (Math.abs(dy) > maxYDelta) return;
    if (Math.abs(dx) < threshold) return;

    if (dx > 0 && handlers.onSwipeRight) {
      handlers.onSwipeRight();
    } else if (dx < 0 && handlers.onSwipeLeft) {
      handlers.onSwipeLeft();
    }
  }, [handlers, threshold, maxYDelta]);

  // Mouse drag support (desktop)
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dy) > maxYDelta) return;
    if (Math.abs(dx) < threshold) return;

    if (dx > 0 && handlers.onSwipeRight) {
      handlers.onSwipeRight();
    } else if (dx < 0 && handlers.onSwipeLeft) {
      handlers.onSwipeLeft();
    }
  }, [handlers, threshold, maxYDelta]);

  return { onTouchStart, onTouchEnd, onMouseDown, onMouseUp };
}
