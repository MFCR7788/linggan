'use client';
// 视频混剪页面 — 多段素材拼接 + 转场 + BGM + 字幕

import React, { useState, useCallback, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TopNav } from '@/components/TopNav';
import { BottomNav, type PageKey } from '@/components/BottomNav';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { LoadingSpinner } from '@/components/loading-spinner';
import { PAGE_ROUTES } from '@/lib/style-constants';
import { useRouter } from 'next/navigation';
import type {
  MixSegment,
  MixProject,
  MixTransition,
  TransitionType,
  MixBGMConfig,
  MixSubtitleConfig,
  MixTaskStatus,
} from '@/lib/video-mixer/types';
import { TRANSITIONS, getTransitionsByCategory } from '@/lib/video-mixer/transitions';
import { BGM_STYLES } from '@/lib/video-mixer/types';
import { Plus, Trash2, GripVertical, Play, Pause, ChevronDown, ChevronUp } from 'lucide-react';

// ─── 内置工具组件 ────────────────────────────────────────────

function TransitionPicker({
  value,
  onChange,
}: {
  value: TransitionType;
  onChange: (t: TransitionType) => void;
}) {
  const [open, setOpen] = useState(false);
  const categories = getTransitionsByCategory();
  const catNames: Record<string, string> = { fade: '淡入淡出', slide: '滑动', shape: '形状', wipe: '擦除', effect: '特效' };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
      >
        <span>{TRANSITIONS[value]?.icon || '⬜'}</span>
        <span>{TRANSITIONS[value]?.labelZh || '无转场'}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 w-64 max-h-64 overflow-y-auto rounded-lg p-3"
          style={{ background: '#1A1F2E', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          {Object.entries(categories).map(([cat, transitions]) => (
            <div key={cat}>
              <div className="text-xs px-2 py-1" style={{ color: '#6B7280' }}>{catNames[cat] || cat}</div>
              {transitions.map(t => (
                <button
                  key={t.type}
                  onClick={() => { onChange(t.type); setOpen(false); }}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-sm hover:bg-white/10 transition-colors"
                  style={{ color: value === t.type ? '#3B82F6' : '#E5E7EB' }}
                >
                  <span>{t.icon}</span>
                  <span>{t.labelZh}</span>
                  {value === t.type && <span className="ml-auto text-xs text-blue-400">✓</span>}
                </button>
              ))}
            </div>
          ))}
          <button
            onClick={() => { setOpen(false); }}
            className="w-full mt-2 text-center text-xs py-1.5 rounded"
            style={{ color: '#9CA3AF', background: 'rgba(255,255,255,0.05)' }}
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
}

function SegmentCard({
  segment,
  index,
  onRemove,
  onTrimChange,
}: {
  segment: MixSegment;
  index: number;
  onRemove: (id: string) => void;
  onTrimChange: (id: string, field: 'trimStart' | 'trimEnd', value: number) => void;
}) {
  return (
    <GlassCard className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <GripVertical size={16} style={{ color: '#6B7280' }} />
        <span className="text-xs font-medium" style={{ color: '#9CA3AF' }}>片段 {index + 1}</span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD' }}>
          {segment.source}
        </span>
        <button onClick={() => onRemove(segment.id)} className="ml-auto p-1 rounded hover:bg-red-500/20">
          <Trash2 size={14} style={{ color: '#EF4444' }} />
        </button>
      </div>
      {/* URL 显示 */}
      <div className="text-xs truncate" style={{ color: '#6B7280' }}>
        {segment.videoUrl.split('/').pop() || segment.videoUrl}
      </div>
      {/* 时间裁剪 */}
      <div className="flex items-center gap-3 text-xs">
        <label style={{ color: '#9CA3AF' }}>
          开始:
          <input
            type="number"
            min={0}
            max={segment.originalDuration}
            step={0.1}
            value={segment.trimStart}
            onChange={e => onTrimChange(segment.id, 'trimStart', parseFloat(e.target.value) || 0)}
            className="ml-1 w-16 px-1.5 py-0.5 rounded text-xs"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
          />
          s
        </label>
        <label style={{ color: '#9CA3AF' }}>
          结束:
          <input
            type="number"
            min={0}
            max={segment.originalDuration}
            step={0.1}
            value={segment.trimEnd}
            onChange={e => onTrimChange(segment.id, 'trimEnd', parseFloat(e.target.value) || 0)}
            className="ml-1 w-16 px-1.5 py-0.5 rounded text-xs"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
          />
          s
        </label>
        <span style={{ color: '#6B7280' }}>
          (共 {(segment.trimEnd - segment.trimStart).toFixed(1)}s)
        </span>
      </div>
    </GlassCard>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────

export default function VideoMixPageContent() {
  const router = useRouter();
  const [segments, setSegments] = useState<MixSegment[]>([]);
  const [transitions, setTransitions] = useState<MixTransition[]>([]);
  const [bgmStyle, setBgmStyle] = useState('chill');
  const [bgmVolume, setBgmVolume] = useState(0.2);
  const [bgmDucking, setBgmDucking] = useState(true);
  const [outputRes, setOutputRes] = useState<'720p' | '1080p'>('720p');
  const [outputAspect, setOutputAspect] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [isProcessing, setIsProcessing] = useState(false);
  const [taskStatus, setTaskStatus] = useState<MixTaskStatus | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [importUrl, setImportUrl] = useState('');

  // 片段时间变化时更新转场数组
  useEffect(() => {
    if (transitions.length !== Math.max(0, segments.length - 1)) {
      setTransitions(
        Array.from({ length: Math.max(0, segments.length - 1) }, () => ({
          type: 'fade' as TransitionType,
          duration: 0.5,
        }))
      );
    }
  }, [segments.length]);

  const handleAddSegment = useCallback(() => {
    if (!importUrl.trim()) return;
    const newSeg: MixSegment = {
      id: `seg-${Date.now()}`,
      videoUrl: importUrl.trim(),
      source: 'upload',
      trimStart: 0,
      trimEnd: 5,
      originalDuration: 60,
    };
    setSegments(prev => [...prev, newSeg]);
    setImportUrl('');
  }, [importUrl]);

  const handleRemoveSegment = useCallback((id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleTrimChange = useCallback((id: string, field: 'trimStart' | 'trimEnd', value: number) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }, []);

  const handleTransitionChange = useCallback((index: number, type: TransitionType) => {
    setTransitions(prev => prev.map((t, i) => i === index ? { ...t, type } : t));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (segments.length < 2) return;
    setIsProcessing(true);
    setTaskStatus(null);

    const project: MixProject = {
      segments,
      transitions,
      bgm: { style: bgmStyle, volume: bgmVolume, ducking: bgmDucking },
      outputResolution: outputRes,
      outputAspect: outputAspect,
    };

    try {
      const res = await fetch('/api/ai/video-mix/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ project, title: '混剪作品' }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(`提交失败: ${data.error}`);
        setIsProcessing(false);
        return;
      }

      // 轮询状态
      const taskId = data.data.taskId;
      const poll = setInterval(async () => {
        const statusRes = await fetch(`/api/ai/video-mix/status?taskId=${taskId}`, {
          credentials: 'include',
        });
        const statusData = await statusRes.json();
        if (statusData.success) {
          setTaskStatus(statusData.data);
          if (statusData.data.status === 'completed' || statusData.data.status === 'failed') {
            clearInterval(poll);
            setIsProcessing(false);
          }
        }
      }, 3000);
    } catch (e) {
      alert(`提交失败: ${e}`);
      setIsProcessing(false);
    }
  }, [segments, transitions, bgmStyle, bgmVolume, bgmDucking, outputRes, outputAspect]);

  const handleNavigate = (page: PageKey) => {
    router.push(PAGE_ROUTES[page] || '/home');
  };

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen bg-[#0A1629]">
        <TopNav title="视频混剪" showBack onBack={() => router.push('/ai/video')} />
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
          {/* 导入素材 */}
          <GlassCard className="p-4">
            <h3 className="text-sm font-medium mb-2" style={{ color: '#E5E7EB' }}>导入素材</h3>
            <p className="text-xs mb-3" style={{ color: '#9CA3AF' }}>
              粘贴视频 URL（支持 AI 生成视频、Pexels/Pixabay 素材、本地上传文件链接）
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                placeholder="输入视频 URL..."
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                onKeyDown={e => e.key === 'Enter' && handleAddSegment()}
              />
              <button
                onClick={handleAddSegment}
                className="px-4 py-2 rounded-lg text-sm flex items-center gap-1"
                style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#93C5FD' }}
              >
                <Plus size={16} /> 添加
              </button>
            </div>
          </GlassCard>

          {/* 片段列表 */}
          {segments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium" style={{ color: '#E5E7EB' }}>
                  素材片段 ({segments.length}段)
                </h3>
                <span className="text-xs" style={{ color: '#6B7280' }}>
                  总时长: {segments.reduce((s, seg) => s + (seg.trimEnd - seg.trimStart), 0).toFixed(1)}s
                </span>
              </div>
              {segments.map((seg, i) => (
                <div key={seg.id}>
                  <SegmentCard
                    segment={seg}
                    index={i}
                    onRemove={handleRemoveSegment}
                    onTrimChange={handleTrimChange}
                  />
                  {/* 转场选择（最后一段后不显示） */}
                  {i < segments.length - 1 && (
                    <div className="flex items-center gap-3 my-2 px-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: '#9CA3AF' }}>↘</span>
                        <span className="text-xs" style={{ color: '#6B7280' }}>转场</span>
                      </div>
                      <TransitionPicker
                        value={transitions[i]?.type || 'fade'}
                        onChange={t => handleTransitionChange(i, t)}
                      />
                      {transitions[i]?.type !== 'none' && (
                        <input
                          type="range"
                          min={0.3}
                          max={2.0}
                          step={0.1}
                          value={transitions[i]?.duration || 0.5}
                          onChange={e => setTransitions(prev =>
                            prev.map((t, idx) => idx === i ? { ...t, duration: parseFloat(e.target.value) } : t)
                          )}
                          className="w-20"
                        />
                      )}
                      {transitions[i]?.type !== 'none' && (
                        <span className="text-xs" style={{ color: '#6B7280' }}>{transitions[i]?.duration || 0.5}s</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* BGM 设置 */}
          {segments.length >= 2 && (
            <GlassCard className="p-4">
              <h3 className="text-sm font-medium mb-3" style={{ color: '#E5E7EB' }}>背景音乐</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {BGM_STYLES.map(bgm => (
                  <button
                    key={bgm.id}
                    onClick={() => setBgmStyle(bgm.id)}
                    className="px-3 py-1.5 rounded-lg text-xs transition-all"
                    style={{
                      background: bgmStyle === bgm.id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${bgmStyle === bgm.id ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      color: bgmStyle === bgm.id ? '#93C5FD' : '#9CA3AF',
                    }}
                  >
                    {bgm.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <label className="text-xs" style={{ color: '#9CA3AF' }}>
                  音量: {Math.round(bgmVolume * 100)}%
                  <input
                    type="range"
                    min={0.05}
                    max={1.0}
                    step={0.05}
                    value={bgmVolume}
                    onChange={e => setBgmVolume(parseFloat(e.target.value))}
                    className="ml-2 w-24"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs" style={{ color: '#9CA3AF' }}>
                  <input
                    type="checkbox"
                    checked={bgmDucking}
                    onChange={e => setBgmDucking(e.target.checked)}
                  />
                  人声闪避
                </label>
              </div>
            </GlassCard>
          )}

          {/* 输出设置 + 提交 */}
          {segments.length >= 2 && (
            <GlassCard className="p-4">
              <h3 className="text-sm font-medium mb-3" style={{ color: '#E5E7EB' }}>输出设置</h3>
              <div className="flex gap-3 mb-4">
                <select
                  value={outputRes}
                  onChange={e => setOutputRes(e.target.value as '720p' | '1080p')}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                >
                  <option value="720p">720P</option>
                  <option value="1080p">1080P</option>
                </select>
                <select
                  value={outputAspect}
                  onChange={e => setOutputAspect(e.target.value as '16:9' | '9:16' | '1:1')}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                >
                  <option value="9:16">9:16 (竖屏)</option>
                  <option value="16:9">16:9 (横屏)</option>
                  <option value="1:1">1:1 (方形)</option>
                </select>
              </div>

              {isProcessing ? (
                <div className="flex flex-col items-center py-4 gap-2">
                  <LoadingSpinner text="处理中..." />
                  {taskStatus && (
                    <div className="text-xs" style={{ color: '#9CA3AF' }}>
                      进度: {taskStatus.progress}%
                      {taskStatus.status === 'completed' && (
                        <span className="ml-2" style={{ color: '#34D399' }}>✓ 完成!</span>
                      )}
                      {taskStatus.status === 'failed' && (
                        <span className="ml-2" style={{ color: '#EF4444' }}>✗ 失败: {taskStatus.error}</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <PrimaryButton fullWidth onClick={handleSubmit}>
                  🎬 开始混剪 ({segments.length}段 · {segments.reduce((s, seg) => s + (seg.trimEnd - seg.trimStart), 0).toFixed(0)}s)
                </PrimaryButton>
              )}

              {/* 输出视频预览 */}
              {taskStatus?.outputUrl && (
                <div className="mt-4">
                  <video
                    src={taskStatus.outputUrl}
                    controls
                    className="w-full rounded-lg"
                    style={{ maxHeight: 300 }}
                  />
                </div>
              )}
            </GlassCard>
          )}

          {segments.length < 2 && (
            <div className="text-center py-12" style={{ color: '#6B7280' }}>
              <p className="text-sm">添加至少 2 个视频片段开始混剪</p>
              <p className="text-xs mt-1">支持 AI 生成视频、Pexels/Pixabay 素材、本地视频</p>
            </div>
          )}
        </div>
        <BottomNav activePage="ai" onNavigate={handleNavigate} />
      </div>
    </ProtectedRoute>
  );
}
