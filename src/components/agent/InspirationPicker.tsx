'use client';

// 灵感库素材选择器 — 弹窗浏览用户灵感库中的图片/视频，选择后返回 media_url
// 用于 Agent 对话中需要图片/视频素材时，让用户从灵感库选取

import { useState, useCallback } from 'react';
import { X, Image, Loader2, Search, Film } from 'lucide-react';
import { useInspirations } from '@/hooks/use-inspiration';
import type { ContentItem } from '@/types';

type MediaType = 'image' | 'video';

interface InspirationPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: { id: string; url: string; title?: string; type: string }) => void;
  mediaType: MediaType;
}

export function InspirationPicker({ open, onClose, onSelect, mediaType }: InspirationPickerProps) {
  const [search, setSearch] = useState('');

  const { data: items, isLoading } = useInspirations({
    type: mediaType,
    limit: 50,
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  const filtered = (items || []).filter((item: ContentItem) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.original_text && item.original_text.toLowerCase().includes(q))
    );
  });

  const handleSelect = useCallback((item: ContentItem) => {
    const url = item.media_urls?.[0] || item.thumbnail_url;
    if (!url) return;
    onSelect({
      id: item.id,
      url,
      title: item.title || item.original_filename || undefined,
      type: item.type,
    });
    onClose();
  }, [onSelect, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/70" />

      {/* 面板 */}
      <div
        className="relative w-full sm:w-[420px] max-h-[80vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            {mediaType === 'image' ? <Image size={16} color="#F59E0B" /> : <Film size={16} color="#8B5CF6" />}
            <span style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600 }}>
              从灵感库选择{mediaType === 'image' ? '图片' : '视频'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X size={16} color="#9CA3AF" />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="px-4 py-2 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Search size={12} color="#6B7280" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索素材..."
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: '#E5E7EB' }}
            />
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin" color="#6B7280" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p style={{ color: '#6B7280', fontSize: 13 }}>
                {mediaType === 'image' ? '暂无图片素材' : '暂无视频素材'}
              </p>
              <p style={{ color: '#4B5563', fontSize: 11, marginTop: 4 }}>
                去灵感库上传或采集后即可在此选用
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {filtered.map((item: ContentItem) => {
                const thumbUrl = item.thumbnail_url || item.media_urls?.[0];
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="relative aspect-square rounded-lg overflow-hidden group transition-all active:scale-95"
                    style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={item.title || '素材'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {mediaType === 'image' ? <Image size={20} color="#4B5563" /> : <Film size={20} color="#4B5563" />}
                      </div>
                    )}
                    {/* hover 遮罩 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end p-1">
                      {item.title && (
                        <span className="text-[10px] text-white/80 truncate w-full opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                          {item.title}
                        </span>
                      )}
                    </div>
                    {/* 视频时长标记 */}
                    {item.type === 'video' && (
                      <span className="absolute top-1 right-1 px-1 py-0.5 rounded text-[9px]" style={{ background: 'rgba(0,0,0,0.6)', color: '#E5E7EB' }}>
                        <Film size={10} className="inline mr-0.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-4 py-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ color: '#6B7280', fontSize: 10, textAlign: 'center' }}>
            点击素材即可选用 · 共 {filtered.length} 个
          </p>
        </div>
      </div>
    </div>
  );
}
