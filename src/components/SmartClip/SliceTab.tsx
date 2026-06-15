'use client';

import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ModeSelector } from './ModeSelector';
import type { SliceMode } from './ModeSelector';
import { Upload, Link } from 'lucide-react';

interface Props {
  videoUrl: string;
  setVideoUrl: (url: string) => void;
  sliceMode: SliceMode;
  onSliceModeChange: (mode: SliceMode) => void;
  keywords: string[];
  setKeywords: (kw: string[]) => void;
  sliceDuration: { min: number; max: number };
  setSliceDuration: (d: { min: number; max: number }) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
}

export function SliceTab({
  videoUrl,
  setVideoUrl,
  sliceMode,
  onSliceModeChange,
  keywords,
  setKeywords,
  sliceDuration,
  setSliceDuration,
  onAnalyze,
  isAnalyzing,
  uploading,
  onUpload,
}: Props) {
  const addKeyword = () => {
    setKeywords([...keywords, '']);
  };

  const updateKeyword = (index: number, value: string) => {
    const updated = keywords.map((k, i) => (i === index ? value : k));
    setKeywords(updated);
  };

  const removeKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* 上传区域 */}
      <GlassCard className="p-4">
        <h3 className="text-sm font-medium mb-2" style={{ color: '#E5E7EB' }}>上传视频</h3>
        <p className="text-xs mb-3" style={{ color: '#9CA3AF' }}>
          支持 mp4、mov、avi 格式，最大 500MB。长视频切片提取精华片段。
        </p>

        <div className="flex gap-2 mb-3">
          <label className="flex-1">
            <input
              type="file"
              accept="video/mp4,video/mov,video/avi,video/webm,video/mkv,video/flv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
              }}
              className="hidden"
            />
            <div
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg cursor-pointer text-sm transition-colors hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.2)', color: '#9CA3AF' }}
            >
              <Upload size={16} />
              {uploading ? '上传中...' : '选择文件'}
            </div>
          </label>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <span className="text-xs" style={{ color: '#6B7280' }}>或粘贴链接</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="粘贴视频 URL..."
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
          />
          <button
            className="px-3 py-2 rounded-lg text-sm flex items-center gap-1"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#9CA3AF' }}
          >
            <Link size={14} />
          </button>
        </div>
      </GlassCard>

      {/* 模式选择 */}
      <GlassCard className="p-4">
        <ModeSelector
          direction="slice"
          clipMode="auto"
          sliceMode={sliceMode}
          onClipModeChange={() => {}}
          onSliceModeChange={onSliceModeChange}
        />

        {/* 均匀切分参数 */}
        {sliceMode === 'uniform' && (
          <div className="mt-4">
            <label className="text-xs" style={{ color: '#9CA3AF' }}>
              每段时长: {sliceDuration.max}秒
            </label>
            <input
              type="range"
              min={15}
              max={180}
              step={5}
              value={sliceDuration.max}
              onChange={(e) =>
                setSliceDuration({ min: 15, max: parseInt(e.target.value) })
              }
              className="w-full mt-1"
            />
            <div className="flex justify-between text-[10px]" style={{ color: '#6B7280' }}>
              <span>15s</span>
              <span>180s</span>
            </div>
          </div>
        )}

        {/* 关键词 */}
        {(sliceMode === 'custom' || sliceMode === 'product') && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs" style={{ color: '#9CA3AF' }}>
                {sliceMode === 'product' ? '产品关键词（可选）' : '匹配关键词'}
              </label>
              <button
                onClick={addKeyword}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD' }}
              >
                + 添加
              </button>
            </div>
            {keywords.map((kw, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={kw}
                  onChange={(e) => updateKeyword(i, e.target.value)}
                  placeholder="输入关键词..."
                  className="flex-1 px-3 py-1.5 rounded text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                />
                <button
                  onClick={() => removeKeyword(i)}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: '#EF4444' }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* 分析按钮 */}
      <PrimaryButton
        fullWidth
        loading={isAnalyzing}
        disabled={!videoUrl.trim() || isAnalyzing}
        onClick={onAnalyze}
      >
        开始分析
      </PrimaryButton>
    </div>
  );
}
