'use client';

import { useState, useEffect } from 'react';
import { Upload, ImageIcon, Link, Loader2, Video, Music, CheckCircle2 } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';

type MediaType = 'image' | 'video' | 'audio';
type PickerTab = 'upload' | 'inspiration' | 'url';

interface InspirationItem {
  id: string | number;
  title: string;
  type?: string;
  media_urls?: string[];
}

interface MediaPickerProps {
  accept: MediaType;
  onSelect: (url: string) => void;
  value?: string;
  compact?: boolean;
  tabs?: PickerTab[];
  label?: string;
}

const TAB_CONFIG: { key: PickerTab; label: string; icon: React.ReactNode }[] = [
  { key: 'upload', label: '上传', icon: <Upload size={12} /> },
  { key: 'inspiration', label: '灵感库', icon: <ImageIcon size={12} /> },
  { key: 'url', label: '粘贴URL', icon: <Link size={12} /> },
];

const TYPE_ICON: Record<MediaType, React.ReactNode> = {
  image: <ImageIcon size={16} color="#6B7280" />,
  video: <Video size={16} color="#6B7280" />,
  audio: <Music size={16} color="#6B7280" />,
};

const ACCEPT_MAP: Record<MediaType, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
};

export function MediaPicker({ accept, onSelect, value, compact = false, tabs, label }: MediaPickerProps) {
  const [tab, setTab] = useState<PickerTab>('upload');
  const [url, setUrl] = useState(value || '');
  const [inspirations, setInspirations] = useState<InspirationItem[]>([]);
  const [selectedInspId, setSelectedInspId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingInsp, setIsLoadingInsp] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{ name: string; url: string } | null>(null);

  const visibleTabs = tabs || ['upload', 'inspiration', 'url'];

  useEffect(() => {
    if (value) {
      setUrl(value);
      if (value.startsWith('http') && !uploadedFile) {
        setUploadedFile({ name: value.split('/').pop() || '已上传', url: value });
      }
    }
  }, [value]);

  useEffect(() => {
    if (!visibleTabs.includes('inspiration')) return;
    setIsLoadingInsp(true);
    fetch(`/api/inspiration?type=${accept}&limit=30`)
      .then(r => r.json())
      .then(d => { if (d.success) setInspirations(d.data || []); })
      .catch(() => {})
      .finally(() => setIsLoadingInsp(false));
  }, [accept]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', accept);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.data.url) {
        setUrl(data.data.url);
        setUploadedFile({ name: data.data.fileName || file.name, url: data.data.url });
        onSelect(data.data.url);
      } else {
        setUploadError(data.error || '上传失败，请重试');
      }
    } catch {
      setUploadError('上传失败，请检查网络后重试');
    }
    setIsUploading(false);
  };

  const handleUrlConfirm = () => {
    if (url.startsWith('http')) {
      onSelect(url);
    }
  };

  const selectInspiration = (item: InspirationItem) => {
    const mediaUrl = item.media_urls?.[0];
    if (mediaUrl) {
      setUrl(mediaUrl);
      setSelectedInspId(String(item.id));
      onSelect(mediaUrl);
    }
  };

  const filteredInspirations = inspirations.filter(i => i.type === accept);

  const id = `media-picker-${accept}`;

  const content = (
    <>
      {!compact && label && (
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          {label}
        </p>
      )}
      {!compact && !label && (
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#06B6D4' }}>Step 1</span> · 选择{accept === 'image' ? '图片' : accept === 'video' ? '视频' : '音频'}
        </p>
      )}

      <div className="flex rounded-lg overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {TAB_CONFIG.filter(t => visibleTabs.includes(t.key)).map(({ key, label: tabLabel, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-all"
            style={{
              background: tab === key ? 'rgba(6,182,212,0.2)' : 'transparent',
              color: tab === key ? '#67E8F9' : '#9CA3AF',
              fontWeight: tab === key ? 600 : 400,
            }}
          >
            {icon} {compact ? '' : tabLabel}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
        <div className="text-center py-3">
          <input
            type="file"
            accept={ACCEPT_MAP[accept]}
            onChange={handleUpload}
            className="hidden"
            id={id}
          />
          <label
            htmlFor={id}
            className="flex flex-col items-center gap-2 py-4 px-4 rounded-xl cursor-pointer"
            style={{ border: `2px dashed ${uploadError ? 'rgba(239,68,68,0.4)' : uploadedFile ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.15)'}`, background: uploadedFile ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.03)' }}
          >
            {isUploading ? (
              <Loader2 size={20} color="#67E8F9" className="animate-spin" />
            ) : uploadedFile ? (
              <CheckCircle2 size={20} color="#34D399" />
            ) : (
              <Upload size={20} color="#67E8F9" />
            )}
            <span style={{ color: uploadedFile ? '#86EFAC' : '#9CA3AF', fontSize: 12 }}>
              {isUploading ? '上传中...' : uploadedFile ? `已上传: ${uploadedFile.name.length > 24 ? uploadedFile.name.slice(0, 24) + '...' : uploadedFile.name}` : `点击上传${accept === 'image' ? '图片' : accept === 'video' ? '视频' : '音频'}`}
            </span>
          </label>
          {uploadError && (
            <p className="text-xs mt-2" style={{ color: '#FCA5A5' }}>{uploadError}</p>
          )}
        </div>
      )}

      {tab === 'inspiration' && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {isLoadingInsp ? (
            <div className="flex justify-center py-4">
              <Loader2 size={16} color="#67E8F9" className="animate-spin" />
            </div>
          ) : filteredInspirations.length === 0 ? (
            <p style={{ color: '#6B7280', fontSize: 12, textAlign: 'center', padding: 16 }}>
              暂无{accept === 'image' ? '图片' : accept === 'video' ? '视频' : '音频'}类灵感
            </p>
          ) : (
            filteredInspirations.slice(0, 12).map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer"
                onClick={() => selectInspiration(item)}
                style={{
                  background: selectedInspId === String(item.id) ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.05)',
                  border: selectedInspId === String(item.id) ? '1px solid rgba(6,182,212,0.4)' : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {item.media_urls?.[0] ? (
                  <img src={item.media_urls[0]} alt="" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    {TYPE_ICON[accept]}
                  </div>
                )}
                <span style={{ color: '#E5E7EB', fontSize: 12 }} className="truncate">{item.title || '未命名'}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'url' && (
        <div className="flex gap-2">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={`粘贴${accept === 'image' ? '图片' : accept === 'video' ? '视频' : '音频'}URL...`}
            className="flex-1 px-3 py-2 rounded-xl bg-transparent text-sm outline-none"
            style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <button
            onClick={handleUrlConfirm}
            className="px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ background: 'rgba(6,182,212,0.2)', color: '#67E8F9', border: '1px solid rgba(6,182,212,0.3)' }}
          >
            确认
          </button>
        </div>
      )}
    </>
  );

  if (compact) return <div>{content}</div>;
  return <GlassCard>{content}</GlassCard>;
}
