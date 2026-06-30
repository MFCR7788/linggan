'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Trash2 } from 'lucide-react';

// ─── 全局互斥：同时只有一个卡处于打开状态 ─────────────────
let globalOpenId: string | null = null;
const listeners = new Set<() => void>();

function setGlobalOpen(id: string | null) {
  if (globalOpenId === id) return;
  const prev = globalOpenId;
  globalOpenId = id;
  // 通知之前打开的卡关闭
  if (prev) {
    for (const fn of listeners) fn();
  }
}

interface SwipeableCardProps {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
}

/**
 * 苹果式左滑删除卡片。
 *
 * - 触摸 / 鼠标 / 触控板拖拽左滑，露出红色删除按钮
 * - 速度感知：快速轻扫即使距离不够也触发
 * - 弹性动画：未超过阈值时有回弹效果
 * - 互斥：同时只有一个卡片处于打开状态
 * - 直接操作 DOM，不经过 React state，避免重渲染
 */
export function SwipeableCard({ children, onDelete, deleteLabel = '删除' }: SwipeableCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardIdRef = useRef<string>(`swipe-${Math.random().toString(36).slice(2, 9)}`);

  // 手势状态（用 ref 避免重渲染）
  const stateRef = useRef({
    startX: 0,
    startY: 0,
    currentX: 0,          // 当前 transform 偏移
    isDragging: false,
    isOpen: false,
    lastX: 0,
    lastTime: 0,
  });

  const DELETE_WIDTH = 80;

  // ── 注册全局关闭监听 ──────────────────────────────────
  useEffect(() => {
    const id = cardIdRef.current;
    const close = () => {
      const el = cardRef.current;
      if (!el) return;
      el.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)';
      el.style.transform = 'translateX(0px)';
      stateRef.current.isOpen = false;
      stateRef.current.currentX = 0;
    };
    listeners.add(close);
    return () => { listeners.delete(close); };
  }, []);

  // ── 关闭当前卡（给外部调用）─────────────────────────────
  const closeCard = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)';
    el.style.transform = 'translateX(0px)';
    stateRef.current.isOpen = false;
    stateRef.current.currentX = 0;
    setGlobalOpen(null);
  }, []);

  // ── 打开卡片 ─────────────────────────────────────────
  const openCard = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    setGlobalOpen(cardIdRef.current);
    el.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1.0)';
    el.style.transform = `translateX(-${DELETE_WIDTH}px)`;
    stateRef.current.isOpen = true;
    stateRef.current.currentX = -DELETE_WIDTH;
  }, [DELETE_WIDTH]);

  // ── pointer 事件处理 ──────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 点击删除按钮时不处理
    if ((e.target as HTMLElement).closest('[data-delete-btn]')) return;

    // 如果有其他卡打开，先关掉
    if (globalOpenId && globalOpenId !== cardIdRef.current) {
      for (const fn of listeners) fn();
    }

    const s = stateRef.current;
    s.startX = e.clientX;
    s.startY = e.clientY;
    s.lastX = e.clientX;
    s.lastTime = Date.now();
    s.isDragging = true;

    const el = cardRef.current;
    if (el) {
      el.style.transition = 'none';
      // 设置 pointer capture 以跟踪手指移出元素后的移动
      el.setPointerCapture(e.pointerId);
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    if (!s.isDragging) return;

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    // 垂直滚动优先：如果垂直偏移 > 水平偏移 * 1.3，让给滚动
    if (Math.abs(dy) > Math.abs(dx) * 1.3 && Math.abs(dx) < 10) {
      s.isDragging = false;
      const el = cardRef.current;
      if (el) el.releasePointerCapture(e.pointerId);
      return;
    }

    // 只允许左滑 (dx <= 0)
    const baseOffset = s.isOpen ? -DELETE_WIDTH : 0;
    const clamped = Math.max(-DELETE_WIDTH - 10, Math.min(5, baseOffset + dx));
    s.currentX = clamped;
    s.lastX = e.clientX;
    s.lastTime = Date.now();

    const el = cardRef.current;
    if (el) el.style.transform = `translateX(${clamped}px)`;
  }, [DELETE_WIDTH]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    if (!s.isDragging) return;
    s.isDragging = false;

    const el = cardRef.current;
    if (el) el.releasePointerCapture(e.pointerId);

    const dx = s.currentX - (s.isOpen ? -DELETE_WIDTH : 0);
    const dt = Date.now() - s.lastTime;
    const velocity = dt > 0 ? Math.abs(dx) / dt : 0; // px/ms

    // 打开条件：滑动超过阈值 40% 或 速度 > 0.4 px/ms
    const shouldOpen = (dx < -(DELETE_WIDTH * 0.35)) || (dx < 0 && velocity > 0.4);

    if (shouldOpen) {
      openCard();
    } else if (s.isOpen && dx > DELETE_WIDTH * 0.3) {
      // 右滑关闭
      closeCard();
    } else if (s.isOpen) {
      // 保持打开但回弹到完整位置
      el && (el.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)');
      el && (el.style.transform = `translateX(-${DELETE_WIDTH}px)`);
      s.currentX = -DELETE_WIDTH;
    } else {
      // 恢复到关闭位置
      el && (el.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)');
      el && (el.style.transform = 'translateX(0px)');
      s.currentX = 0;
    }
  }, [DELETE_WIDTH, openCard, closeCard]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    s.isDragging = false;
    const el = cardRef.current;
    if (el) {
      el.releasePointerCapture(e.pointerId);
      el.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)';
      el.style.transform = s.isOpen ? `translateX(-${DELETE_WIDTH}px)` : 'translateX(0px)';
      s.currentX = s.isOpen ? -DELETE_WIDTH : 0;
    }
  }, [DELETE_WIDTH]);

  // ── 阻止卡片打开时的点击穿透 ───────────────────────────
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (stateRef.current.isOpen) {
      // 点击卡片外部区域 → 关闭
      const target = e.target as HTMLElement;
      if (!target.closest('[data-delete-btn]') && cardRef.current?.contains(target)) {
        // 点击的是卡片本身（非删除按钮），且卡片已打开 → 关闭
        e.preventDefault();
        e.stopPropagation();
        closeCard();
      }
    }
  }, [closeCard]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl select-none"
      style={{ touchAction: 'pan-y' }}
      onClick={handleContainerClick}
    >
      {/* ── 删除按钮（卡片后方） ───────────────────────── */}
      <button
        data-delete-btn
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDelete();
          closeCard();
        }}
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center gap-1 text-white text-sm font-medium rounded-r-2xl"
        style={{ width: DELETE_WIDTH, background: 'linear-gradient(to right, rgba(239,68,68,0.92), #EF4444)' }}
      >
        <Trash2 size={18} color="#fff" />
        <span style={{ fontSize: 13 }}>{deleteLabel}</span>
      </button>

      {/* ── 卡片主体（可滑动层） ────────────────────────── */}
      <div
        ref={cardRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{
          transform: 'translateX(0px)',
          transition: 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}
