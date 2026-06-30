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
 * - 红色删除按钮仅左滑时渐显，日常不可见（不会透出半透明卡片）
 * - 直接操作 DOM，不经过 React state，避免重渲染
 */
export function SwipeableCard({ children, onDelete, deleteLabel = '删除' }: SwipeableCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const cardIdRef = useRef<string>(`swipe-${Math.random().toString(36).slice(2, 9)}`);

  const stateRef = useRef({
    startX: 0,
    startY: 0,
    currentX: 0,
    isDragging: false,
    isOpen: false,
    lastX: 0,
    lastTime: 0,
  });

  const DELETE_WIDTH = 80;

  // ── 更新删除按钮可见度 ──────────────────────────────────
  const updateDeleteVisibility = useCallback((offset: number, animate: boolean) => {
    const btn = deleteRef.current;
    if (!btn) return;
    const progress = Math.min(1, Math.abs(offset) / DELETE_WIDTH);
    btn.style.transition = animate
      ? 'opacity 0.25s ease'
      : 'none';
    btn.style.opacity = String(progress);
    btn.style.pointerEvents = progress > 0.05 ? 'auto' : 'none';
  }, [DELETE_WIDTH]);

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
      updateDeleteVisibility(0, true);
    };
    listeners.add(close);
    return () => { listeners.delete(close); };
  }, [updateDeleteVisibility]);

  const closeCard = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)';
    el.style.transform = 'translateX(0px)';
    stateRef.current.isOpen = false;
    stateRef.current.currentX = 0;
    updateDeleteVisibility(0, true);
    setGlobalOpen(null);
  }, [updateDeleteVisibility]);

  const openCard = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    setGlobalOpen(cardIdRef.current);
    el.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1.0)';
    el.style.transform = `translateX(-${DELETE_WIDTH}px)`;
    stateRef.current.isOpen = true;
    stateRef.current.currentX = -DELETE_WIDTH;
    updateDeleteVisibility(DELETE_WIDTH, true);
  }, [DELETE_WIDTH, updateDeleteVisibility]);

  // ── pointer 事件处理 ──────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-delete-btn]')) return;

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
      el.setPointerCapture(e.pointerId);
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    if (!s.isDragging) return;

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    if (Math.abs(dy) > Math.abs(dx) * 1.3 && Math.abs(dx) < 10) {
      s.isDragging = false;
      const el = cardRef.current;
      if (el) el.releasePointerCapture(e.pointerId);
      return;
    }

    const baseOffset = s.isOpen ? -DELETE_WIDTH : 0;
    const clamped = Math.max(-DELETE_WIDTH - 10, Math.min(5, baseOffset + dx));
    s.currentX = clamped;
    s.lastX = e.clientX;
    s.lastTime = Date.now();

    const el = cardRef.current;
    if (el) el.style.transform = `translateX(${clamped}px)`;
    updateDeleteVisibility(Math.abs(clamped), false);
  }, [DELETE_WIDTH, updateDeleteVisibility]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    if (!s.isDragging) return;
    s.isDragging = false;

    const el = cardRef.current;
    if (el) el.releasePointerCapture(e.pointerId);

    const dx = s.currentX - (s.isOpen ? -DELETE_WIDTH : 0);
    const dt = Date.now() - s.lastTime;
    const velocity = dt > 0 ? Math.abs(dx) / dt : 0;

    const shouldOpen = (dx < -(DELETE_WIDTH * 0.35)) || (dx < 0 && velocity > 0.4);

    if (shouldOpen) {
      openCard();
    } else if (s.isOpen && dx > DELETE_WIDTH * 0.3) {
      closeCard();
    } else if (s.isOpen) {
      el && (el.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)');
      el && (el.style.transform = `translateX(-${DELETE_WIDTH}px)`);
      s.currentX = -DELETE_WIDTH;
      updateDeleteVisibility(DELETE_WIDTH, true);
    } else {
      el && (el.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)');
      el && (el.style.transform = 'translateX(0px)');
      s.currentX = 0;
      updateDeleteVisibility(0, true);
    }
  }, [DELETE_WIDTH, openCard, closeCard, updateDeleteVisibility]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    s.isDragging = false;
    const el = cardRef.current;
    if (el) {
      el.releasePointerCapture(e.pointerId);
      el.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)';
      el.style.transform = s.isOpen ? `translateX(-${DELETE_WIDTH}px)` : 'translateX(0px)';
      s.currentX = s.isOpen ? -DELETE_WIDTH : 0;
      updateDeleteVisibility(s.isOpen ? DELETE_WIDTH : 0, true);
    }
  }, [DELETE_WIDTH, updateDeleteVisibility]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (stateRef.current.isOpen) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-delete-btn]') && cardRef.current?.contains(target)) {
        e.preventDefault();
        e.stopPropagation();
        closeCard();
      }
    }
  }, [closeCard]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden select-none"
      style={{ touchAction: 'pan-y' }}
      onClick={handleContainerClick}
    >
      {/* ── 删除按钮（卡片后方，关闭时完全隐藏） ──────────── */}
      <button
        ref={deleteRef}
        data-delete-btn
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDelete();
          closeCard();
        }}
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center gap-1 text-white text-sm font-medium rounded-r-2xl"
        style={{
          width: DELETE_WIDTH,
          background: 'linear-gradient(to right, rgba(239,68,68,0.92), #EF4444)',
          opacity: 0,
          pointerEvents: 'none',
        }}
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
