'use client';

import { useEffect, useState } from 'react';

// Capacitor 键盘处理 — 监听 visualViewport 变化，返回键盘状态和偏移量
// 在 iOS WKWebView 中，键盘弹出时 visualViewport 的 offsetTop 会变化

interface KeyboardState {
  visible: boolean;
  height: number;    // 键盘高度（px）
  offsetTop: number; // viewport 顶部偏移
}

export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({ visible: false, height: 0, offsetTop: 0 });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let initialHeight = window.innerHeight;

    const handler = () => {
      const offsetTop = vv.offsetTop;
      const heightDiff = initialHeight - vv.height - offsetTop;
      const visible = heightDiff > 100; // 超过 100px 视为键盘弹出
      setState({
        visible,
        height: visible ? heightDiff : 0,
        offsetTop,
      });
    };

    // 窗口大小改变时重新校准基准高度
    const resizeHandler = () => {
      initialHeight = window.innerHeight;
      handler();
    };

    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    window.addEventListener('resize', resizeHandler);

    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
      window.removeEventListener('resize', resizeHandler);
    };
  }, []);

  return state;
}
