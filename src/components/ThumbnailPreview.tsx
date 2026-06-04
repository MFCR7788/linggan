'use client';

import { Play, FileText, Link2, Calendar } from 'lucide-react';
import type { ContentType } from '@/types';

interface ThumbnailPreviewProps {
  type: ContentType | string;
  thumbnailUrl?: string | null;
  mediaUrls?: string[] | null;
  voiceUrl?: string | null;
  sourceUrl?: string | null;
  fallbackText?: string;
  size?: 'sm' | 'md' | 'lg';
  aspectRatio?: string;
  className?: string;
  rounded?: boolean;
}

const SIZE_MAP = {
  sm: { box: 36, icon: 16, emoji: 18, radius: 8 },
  md: { box: 56, icon: 22, emoji: 28, radius: 12 },
  lg: { box: 96, icon: 32, emoji: 48, radius: 16 },
};

/**
 * 统一缩略图组件
 * - image: 显示 media_urls[0] 或 thumbnail_url
 * - video: 显示 thumbnail_url（带播放图标遮罩）
 * - link: 显示 thumbnail_url（链接 OG 图）
 * - text/voice/schedule: 显示文字摘要或类型图标
 */
export function ThumbnailPreview({
  type,
  thumbnailUrl,
  mediaUrls,
  voiceUrl,
  sourceUrl,
  fallbackText,
  size = 'md',
  aspectRatio,
  className = '',
  rounded = true,
}: ThumbnailPreviewProps) {
  const sz = SIZE_MAP[size];
  const radius = rounded ? sz.radius : 0;

  // 选取最佳的预览 URL
  const imageUrl = thumbnailUrl || mediaUrls?.[0] || (type === 'voice' ? voiceUrl : null);

  // ─── 图片类型 ────────────────────────────────────────────
  if (type === 'image' && imageUrl) {
    return (
      <div
        className={`relative overflow-hidden bg-black/20 ${className}`}
        style={{
          width: aspectRatio ? '100%' : sz.box,
          height: aspectRatio ? '100%' : sz.box,
          aspectRatio,
          borderRadius: radius,
        }}
      >
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // ─── 视频类型 ────────────────────────────────────────────
  if (type === 'video' && imageUrl) {
    return (
      <div
        className={`relative overflow-hidden bg-black/30 ${className}`}
        style={{
          width: aspectRatio ? '100%' : sz.box,
          height: aspectRatio ? '100%' : sz.box,
          aspectRatio,
          borderRadius: radius,
        }}
      >
        <video
          src={imageUrl}
          muted
          preload="metadata"
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.25)' }}
        >
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: sz.icon * 1.8,
              height: sz.icon * 1.8,
              background: 'rgba(0,0,0,0.6)',
              border: '1.5px solid rgba(255,255,255,0.7)',
            }}
          >
            <Play size={sz.icon * 0.7} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 1 }} />
          </div>
        </div>
      </div>
    );
  }

  // ─── 链接类型：有缩略图（OG 图）───────────────────────────
  if (type === 'link' && imageUrl) {
    return (
      <div
        className={`relative overflow-hidden bg-black/20 ${className}`}
        style={{
          width: aspectRatio ? '100%' : sz.box,
          height: aspectRatio ? '100%' : sz.box,
          aspectRatio,
          borderRadius: radius,
        }}
      >
        <img src={imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
        <div
          className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px]"
          style={{ background: 'rgba(0,0,0,0.6)', color: '#FFFFFF' }}
        >
          🔗
        </div>
      </div>
    );
  }

  // ─── 降级方案：类型图标 / 文字摘要 ───────────────────────
  const gradientBg = {
    text: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
    voice: 'linear-gradient(135deg, rgba(34,197,94,0.3), rgba(16,185,129,0.3))',
    link: 'linear-gradient(135deg, rgba(245,158,11,0.3), rgba(239,68,68,0.3))',
    image: 'linear-gradient(135deg, rgba(168,85,247,0.3), rgba(236,72,153,0.3))',
    video: 'linear-gradient(135deg, rgba(239,68,68,0.3), rgba(236,72,153,0.3))',
    audio: 'linear-gradient(135deg, rgba(34,197,94,0.3), rgba(6,182,212,0.3))',
    schedule: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(59,130,246,0.3))',
  }[type] || 'linear-gradient(135deg, rgba(107,114,128,0.3), rgba(75,85,99,0.3))';

  const iconMap = {
    text: <FileText size={sz.icon} color="#FFFFFF" />,
    voice: <span style={{ fontSize: sz.emoji }}>🎙️</span>,
    link: <Link2 size={sz.icon} color="#FFFFFF" />,
    image: <span style={{ fontSize: sz.emoji }}>🖼️</span>,
    video: <span style={{ fontSize: sz.emoji }}>🎬</span>,
    audio: <span style={{ fontSize: sz.emoji }}>🎵</span>,
    schedule: <Calendar size={sz.icon} color="#FFFFFF" />,
  };

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{
        width: aspectRatio ? '100%' : sz.box,
        height: aspectRatio ? '100%' : sz.box,
        aspectRatio,
        borderRadius: radius,
        background: gradientBg,
        flexShrink: 0,
      }}
    >
      {fallbackText && aspectRatio ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
          {iconMap[type as keyof typeof iconMap] || iconMap.text}
          <p
            className="line-clamp-3 text-center mt-1.5"
            style={{ color: '#D1D5DB', fontSize: 11 }}
          >
            {fallbackText}
          </p>
        </div>
      ) : (
        iconMap[type as keyof typeof iconMap] || iconMap.text
      )}
    </div>
  );
}
