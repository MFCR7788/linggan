// 页面标题 Hook — 设置 document.title 和 OG meta 标签
'use client';

import { useEffect } from 'react';

export function usePageTitle(title: string, options?: {
  description?: string;
  image?: string;
  url?: string;
}) {
  useEffect(() => {
    if (!title) return;
    const fullTitle = `${title} - 灵集`;
    document.title = fullTitle;

    // 动态更新 OG meta 标签（用于微信等分享预览）
    const setMeta = (property: string, content: string) => {
      if (!content) return;
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    if (options?.description) setMeta('og:description', options.description.substring(0, 200));
    if (options?.image) setMeta('og:image', options.image);
    if (options?.url) setMeta('og:url', options.url);
  }, [title, options?.description, options?.image, options?.url]);
}
