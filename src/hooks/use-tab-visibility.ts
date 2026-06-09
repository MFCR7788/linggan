'use client';

import { useEffect, useState, useRef } from 'react';

// 多 Tab 协调 — 检测页面可见性，协调跨 Tab 行为
// 使用 BroadcastChannel 通知其他 Tab，Page Visibility API 控制活动状态

const CHANNEL_NAME = 'lingji-tabs';

export function useTabVisibility() {
  const [isVisible, setIsVisible] = useState(true);
  const [isPrimary, setIsPrimary] = useState(true);
  const tabId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

  useEffect(() => {
    const handleVisibility = () => {
      setIsVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibility);

    // BroadcastChannel 协调多 Tab
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);

      // 广播自己的存在
      channel.postMessage({ type: 'ping', tabId: tabId.current });

      // 短时间后检查是否有更早的 Tab（谁更早谁是 primary）
      const timer = setTimeout(() => {
        channel?.postMessage({ type: 'claim', tabId: tabId.current });
      }, 100);

      channel.onmessage = (event) => {
        const { type, tabId: senderId } = event.data || {};
        if (type === 'claim' && senderId < tabId.current) {
          setIsPrimary(false);
        }
        if (type === 'ping') {
          // 收到其他 tab 的 ping，回应 claim
          channel?.postMessage({ type: 'claim', tabId: tabId.current });
        }
      };

      return () => {
        clearTimeout(timer);
        channel?.close();
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    } catch {
      // BroadcastChannel 不可用时降级（仅用 visibility）
      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }
  }, []);

  return { isVisible, isPrimary };
}
