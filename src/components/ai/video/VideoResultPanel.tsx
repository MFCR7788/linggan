'use client';

import { useState } from 'react';
import {
  CheckCircle2, XCircle, Loader2, Download, FolderOpen, Share2, Layers,
  ChevronLeft, AlertCircle, ImageIcon, Music, Zap, RefreshCw, Mic, Grid3x3,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { apiClient } from '@/lib/api-client';
import { STYLE_PRESETS } from '@/lib/style-constants';
import { QUALITY_TIERS, type QualityTier } from '@/lib/video-models';
import { calcAiVideoCost, CREDIT_COSTS } from '@/lib/credit-costs';

// ─── 类型 ────────────────────────────────────────────────

interface InspirationItem {
  id: string | number;
  title: string;
  type?: string;
  original_text?: string;
  ai_summary?: string;
  media_urls?: string[];
  source_url?: string;
}

interface StoryboardScene {
  index: number;
  timeStart: number;
  timeEnd: number;
  duration: number;
  visualPrompt: string;
  subtitle: string;
  transition: string;
}

interface SegmentState {
  index: number;
  taskId: string | null;
  model: string;
  provider?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'error' | 'skipped';
  duration: number;
  materialType: 'text' | 'image';
  videoUrl?: string;
}

interface SceneFrameData {
  imageUrl?: string;
  taskId?: string;
}

const bgmOptions = [
  { id: 'auto', label: 'AI 自动', wave: [5, 7, 4, 8, 6, 9, 5, 7, 8, 6] },
  { id: 'tech', label: '科技感', wave: [3, 6, 4, 8, 5, 7, 3, 9, 6, 4] },
  { id: 'chill', label: '轻松舒缓', wave: [3, 4, 3, 5, 4, 3, 4, 5, 3, 4] },
  { id: 'hype', label: '热血激昂', wave: [6, 8, 9, 7, 9, 8, 9, 7, 8, 9] },
  { id: 'elegant', label: '优雅高级', wave: [2, 3, 4, 3, 2, 4, 3, 2, 3, 4] },
  { id: 'energetic', label: '活力激情', wave: [7, 9, 6, 8, 9, 7, 8, 9, 7, 8] },
];

const subtitleStyles = ['白色粗体', '黄色描边', '黑底白字', '渐变彩色'];
const subtitlePositions = ['底部', '中部', '顶部'];

function getModelDisplayName(model: string): string {
  if (model.includes('wan')) return 'Wan 2.6';
  if (model.includes('happyhorse')) return 'HappyHorse';
  if (model.includes('fast')) return 'Seedance Fast';
  if (model.includes('1-5-pro')) return 'Seedance 1.5 Pro';
  if (model.includes('lite')) return 'Seedance Lite';
  return model.substring(0, 14);
}

export interface VideoResultPanelProps {
  genPhase: 'idle' | 'submitting' | 'generating' | 'done' | 'error';
  setGenPhase: (v: 'idle' | 'submitting' | 'generating' | 'done' | 'error') => void;
  genError: string | null;
  segments: SegmentState[];
  setSegments: (v: SegmentState[]) => void;
  storyboard: StoryboardScene[];
  mergePhase: 'idle' | 'merging' | 'done' | 'error';
  setMergePhase: (v: 'idle' | 'merging' | 'done' | 'error') => void;
  mergedVideoUrl: string | null;
  setMergedVideoUrl: (v: string | null) => void;
  mergeError: string | null;
  setMergeError: (v: string | null) => void;
  sceneFrames: Record<number, SceneFrameData>;
  qualityTier: string;
  stylePreset: string;
  duration: number;
  topic: string;
  selectedInspirations: Set<string | number>;
  inspirations: InspirationItem[];
  bgmStyle: string;
  setBgmStyle: (v: string) => void;
  subtitleStyle: string;
  setSubtitleStyle: (v: string) => void;
  subtitlePos: string;
  setSubtitlePos: (v: string) => void;
  firstFrameUrl: string | null;
  setFirstFrameUrl: (url: string | null) => void;
  multiFrameMode: boolean;
  lastFrameUrl: string;
  extraFramesText: string;
  generatingFrameIndices: Set<number>;
  generatingFirstFrames: boolean;
  firstFramesProgress: string;
  currentStep: number;
  setCurrentStep: (v: number) => void;
  setToast: (toast: { message: string; type: 'success' | 'error' } | null) => void;
  // Callbacks
  onStartGenerate: () => void;
  onCancel: () => void;
  onMerge: () => void;
  onGenerateFrames: (indices?: number[]) => Promise<void>;
  onHandoff: (route: string, data: Record<string, string>) => void;
}

export function VideoResultPanel({
  genPhase,
  setGenPhase,
  genError,
  segments,
  setSegments,
  storyboard,
  mergePhase,
  setMergePhase,
  mergedVideoUrl,
  setMergedVideoUrl,
  mergeError,
  setMergeError,
  sceneFrames,
  qualityTier,
  stylePreset,
  duration,
  topic,
  selectedInspirations,
  inspirations,
  bgmStyle,
  setBgmStyle,
  subtitleStyle,
  setSubtitleStyle,
  subtitlePos,
  setSubtitlePos,
  firstFrameUrl,
  setFirstFrameUrl,
  multiFrameMode: _multiFrameMode,
  lastFrameUrl,
  extraFramesText: _extraFramesText,
  generatingFrameIndices: _generatingFrameIndices,
  generatingFirstFrames,
  firstFramesProgress: _firstFramesProgress,
  currentStep,
  setCurrentStep,
  setToast,
  onStartGenerate,
  onCancel,
  onMerge,
  onGenerateFrames,
  onHandoff,
}: VideoResultPanelProps) {
  const [firstFrameTab, setFirstFrameTab] = useState<'inspiration' | 'url' | 'upload'>('inspiration');
  const [firstFrameInput, setFirstFrameInput] = useState('');

  // ─── 下载单个分段 ───────────────────────────────────

  const handleDownloadSegment = async (seg: SegmentState) => {
    if (!seg.videoUrl) return;
    try {
      const res = await fetch(seg.videoUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `segment-${seg.index + 1}-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[Video] 下载失败:', e);
      setToast({ message: '下载失败', type: 'error' });
    }
  };

  // ─── 保存单个分段到作品 ─────────────────────────────

  const handleSaveSegment = async (seg: SegmentState) => {
    try {
      const sb = storyboard.find((s) => s.index === seg.index);
      const title = sb?.subtitle || `视频片段 ${seg.index + 1}`;
      const res = await apiClient.post('/inspiration', {
        type: 'video',
        title: title.substring(0, 100),
        original_text: sb?.visualPrompt || '',
        prompt: sb?.visualPrompt || '',
        media_urls: [seg.videoUrl],
        source_platform: 'ai_video',
        tags: ['AI生成', '视频片段'],
      });
      if (res.success) {
        setToast({ message: `"${title}" 已保存到作品`, type: 'success' });
      } else {
        setToast({ message: res.error || '保存失败', type: 'error' });
      }
    } catch (e) {
      console.error('[Video] 保存片段失败:', e);
      setToast({ message: '保存失败，请重试', type: 'error' });
    }
  };

  // ─── 下载合并视频 ───────────────────────────────────

  const handleDownloadMerged = () => {
    if (!mergedVideoUrl) return;
    const a = document.createElement('a');
    a.href = mergedVideoUrl;
    a.download = `merged_${Date.now()}.mp4`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const frameCount = Object.keys(sceneFrames).length;

  // ─── 空闲状态：确认参数 ──────────────────────────

  if (genPhase === 'idle') {
    const qt = QUALITY_TIERS[qualityTier] || QUALITY_TIERS['fast'];
    const segMax = qt.t2v.maxDuration || 10;
    const videoCost = storyboard.reduce((sum, scene) => {
      const d = Math.min(Math.max(scene.duration, 3), segMax);
      return sum + calcAiVideoCost(d, qualityTier as 'fast' | 'standard' | 'premium');
    }, 0);
    const mergeCost = CREDIT_COSTS.ai_video_post.merge;
    const framesAlreadyPaid = frameCount * CREDIT_COSTS.ai_image.perImage;
    const upcomingCost = videoCost + mergeCost;
    const totalCost = upcomingCost + framesAlreadyPaid + CREDIT_COSTS.ai_video_post.storyboard;

    return (
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#3B82F6' }}>确认</span> · 生成参数
        </p>

        {/* 首帧图片（折叠） */}
        <details className="mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <summary className="px-3 py-2.5 cursor-pointer" style={{ color: '#F59E0B', fontSize: 13, fontWeight: 600, listStyle: 'none' }}>
            <span className="flex items-center gap-1.5">
              <ImageIcon size={14} /> 首帧图片（图生视频）{firstFrameUrl ? ' ✓ 已设置' : ''}
              <span style={{ color: '#6B7280', fontSize: 10, fontWeight: 400, marginLeft: 4 }}>可选 · 展开设置</span>
            </span>
          </summary>
          <div className="px-3 pb-3 space-y-2">
            {firstFrameUrl && (
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(245,158,11,0.3)', aspectRatio: '16/9', maxHeight: 160 }}>
                <img src={firstFrameUrl} alt="首帧" className="w-full h-full object-cover" />
                <button onClick={() => setFirstFrameUrl(null)} className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.5)', color: '#FCA5A5', fontSize: 10 }}>✕</button>
              </div>
            )}
            <div className="flex rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              {([
                { key: 'inspiration' as const, label: '灵感库', icon: '📚' },
                { key: 'url' as const, label: 'URL', icon: '🔗' },
              ]).map(({ key, label, icon }) => (
                <button key={key} onClick={() => setFirstFrameTab(key)}
                  className="flex-1 py-1.5 text-xs flex items-center justify-center gap-1"
                  style={{ background: firstFrameTab === key ? 'rgba(245,158,11,0.2)' : 'transparent', color: firstFrameTab === key ? '#FCD34D' : '#9CA3AF' }}>
                  <span>{icon}</span> {label}
                </button>
              ))}
            </div>
            {firstFrameTab === 'inspiration' && (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {inspirations.filter((i) => i.type === 'image' && i.media_urls?.length).length === 0 ? (
                  <p style={{ color: '#6B7280', fontSize: 10, textAlign: 'center', padding: 4 }}>暂无图片灵感</p>
                ) : (
                  inspirations.filter((i) => i.type === 'image' && i.media_urls?.length).slice(0, 6).map((item) => (
                    <div key={item.id} onClick={() => setFirstFrameUrl(item.media_urls![0])}
                      className="flex items-center gap-1.5 p-1 rounded cursor-pointer"
                      style={{ background: firstFrameUrl === item.media_urls![0] ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)' }}>
                      <img src={item.media_urls![0]} alt="" className="w-8 h-8 rounded object-cover" />
                      <span style={{ color: '#E5E7EB', fontSize: 10 }} className="truncate flex-1">{item.title || '未命名'}</span>
                    </div>
                  ))
                )}
              </div>
            )}
            {firstFrameTab === 'url' && (
              <div className="flex gap-1.5">
                <input value={firstFrameInput} onChange={(e) => setFirstFrameInput(e.target.value)} placeholder="https://... 图片 URL"
                  className="flex-1 px-2 py-1.5 rounded text-xs bg-transparent outline-none"
                  style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
                <button onClick={() => { if (firstFrameInput.trim()) setFirstFrameUrl(firstFrameInput.trim()); }}
                  className="px-2.5 py-1 rounded text-xs"
                  style={{ background: 'rgba(245,158,11,0.2)', color: '#FCD34D' }}>应用</button>
              </div>
            )}
          </div>
        </details>

        {/* BGM + 字幕 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            <span style={{ color: '#EC4899' }}>后期</span> · BGM 与字幕
          </p>
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Music size={12} color="#EC4899" />
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600 }}>背景音乐</p>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {bgmOptions.map((b) => (
                <button key={b.id} onClick={() => setBgmStyle(b.id)}
                  className="flex flex-col items-center gap-1 py-2 rounded-lg transition-all"
                  style={{ background: bgmStyle === b.id ? 'rgba(236,72,153,0.2)' : 'rgba(255,255,255,0.05)', border: bgmStyle === b.id ? '1px solid rgba(236,72,153,0.5)' : '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="flex items-end gap-0.5 h-3">
                    {b.wave.map((v, i) => (<div key={i} className="w-0.5 rounded-full" style={{ height: v * 1.2, background: bgmStyle === b.id ? '#F472B6' : '#6B7280' }} />))}
                  </div>
                  <span style={{ color: bgmStyle === b.id ? '#FBCFE8' : '#E5E7EB', fontSize: 10, fontWeight: 600 }}>{b.label}</span>
                </button>
              ))}
            </div>
            {bgmStyle && bgmStyle !== 'auto' && <audio key={bgmStyle} controls preload="none" src={`/bgm/${bgmStyle}.mp3`} className="w-full mt-1.5" style={{ height: 28 }} />}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600, marginBottom: 4 }}>字幕样式</p>
              <div className="grid grid-cols-2 gap-1">
                {subtitleStyles.map((s) => (
                  <button key={s} onClick={() => setSubtitleStyle(s)}
                    className="py-1 rounded text-[10px]"
                    style={{ background: subtitleStyle === s ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)', border: subtitleStyle === s ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)', color: subtitleStyle === s ? '#93C5FD' : '#9CA3AF' }}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600, marginBottom: 4 }}>字幕位置</p>
              <div className="grid grid-cols-1 gap-1">
                {subtitlePositions.map((p) => (
                  <button key={p} onClick={() => setSubtitlePos(p)}
                    className="py-1 rounded text-[10px]"
                    style={{ background: subtitlePos === p ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)', border: subtitlePos === p ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)', color: subtitlePos === p ? '#93C5FD' : '#9CA3AF' }}>{p}</button>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 灵力消耗估算 */}
        <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={12} color="#FCD34D" />
            <span style={{ color: '#FCD34D', fontSize: 12, fontWeight: 600 }}>预估灵力消耗</span>
          </div>
          <div className="space-y-1">
            {[
              { label: '视频生成', detail: `${storyboard.length} 段 × ${qualityTier === 'fast' ? '流畅' : qualityTier === 'standard' ? '标准' : '超高清'}`, cost: videoCost, soon: true },
              { label: '合并后期', detail: '拼接 + BGM + 字幕', cost: mergeCost, soon: true },
            ].map(({ label, detail, cost, soon }) => (
              <div key={label} className="flex justify-between items-center">
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                  {label} <span style={{ color: '#6B7280', fontSize: 10 }}>{detail}</span>
                  {soon && <span style={{ color: '#FBBF24', fontSize: 9, marginLeft: 4 }}>待扣</span>}
                </span>
                <span style={{ color: soon ? '#FCD34D' : '#6B7280', fontSize: 12, fontWeight: 600 }}>{cost}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 4, paddingTop: 4 }}
              className="flex justify-between items-center">
              <span style={{ color: '#E5E7EB', fontSize: 12, fontWeight: 600 }}>本次待扣</span>
              <span style={{ color: '#FCD34D', fontSize: 14, fontWeight: 700 }}>{upcomingCost} 灵力</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span style={{ color: '#6B7280', fontSize: 10 }}>
                已扣：分镜 {CREDIT_COSTS.ai_video_post.storyboard}{frameCount > 0 ? ` + 首帧 ${framesAlreadyPaid}` : ''}
              </span>
              <span style={{ color: '#6B7280', fontSize: 10 }}>
                本视频合计 ≈{totalCost} 灵力
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {[
            { label: '素材数', value: `${selectedInspirations.size} 个` },
            { label: '风格', value: STYLE_PRESETS[stylePreset]?.label || '-' },
            { label: '目标时长', value: `${duration} 秒` },
            { label: '分段数', value: `${storyboard.length} 段` },
            { label: '首帧数', value: `${frameCount}/${storyboard.length} 段` },
            { label: '背景音乐', value: bgmOptions.find((b) => b.id === bgmStyle)?.label },
            { label: '字幕样式', value: `${subtitleStyle} · ${subtitlePos}` },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between py-1.5"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#9CA3AF', fontSize: 13 }}>{label}</span>
              <span style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <PrimaryButton variant="ghost" size="md" onClick={() => setCurrentStep(2)}>
            <ChevronLeft size={16} /> 上一步
          </PrimaryButton>
          <PrimaryButton fullWidth size="lg" onClick={onStartGenerate}>
            <Zap size={16} /> 开始生成 · {upcomingCost} 灵力
          </PrimaryButton>
        </div>
      </GlassCard>
    );
  }

  // ─── 完成状态 ──────────────────────────────────────

  if (genPhase === 'done') {
    return (
      <GlassCard>
        {/* 成功提示 */}
        <div className="flex items-center gap-2 mb-4 p-2 rounded-lg"
          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <CheckCircle2 size={14} color="#22C55E" />
          <span style={{ color: '#86EFAC', fontSize: 12 }}>
            全部分段生成完成 ({segments.filter((s) => s.status === 'succeeded').length}/{segments.length})
          </span>
        </div>

        {/* 分段视频列表 */}
        <div className="space-y-4 mb-4">
          {segments.filter(s => s.status === 'succeeded').map((seg) => {
            const sb = storyboard.find((s) => s.index === seg.index);
            return (
              <div key={seg.index} className="p-3 rounded-xl"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                {/* 分段信息 */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                    style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD' }}>
                    段{seg.index + 1}
                  </span>
                  <span style={{ color: '#9CA3AF', fontSize: 11 }}>{seg.duration}秒</span>
                  <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                    {seg.materialType === 'image' ? '图生视频' : '文生视频'}
                  </span>
                  {seg.model && (
                    <span style={{ color: '#6B7280', fontSize: 10 }}>
                      {getModelDisplayName(seg.model)}
                    </span>
                  )}
                  <CheckCircle2 size={12} color="#22C55E" style={{ marginLeft: 'auto' }} />
                </div>

                {/* 字幕 */}
                {sb?.subtitle && (
                  <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                    {sb.subtitle}
                  </p>
                )}

                {/* 视频播放器 */}
                {seg.videoUrl && (
                  <video src={seg.videoUrl} controls playsInline
                    className="w-full rounded-xl mb-3"
                    style={{ background: '#000', maxHeight: 280 }} />
                )}

                {/* 操作按钮 */}
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => handleDownloadSegment(seg)}
                    className="flex items-center justify-center gap-1 py-2 rounded-lg text-xs"
                    style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93C5FD' }}>
                    <Download size={12} /> 下载
                  </button>
                  <button onClick={() => handleSaveSegment(seg)}
                    className="flex items-center justify-center gap-1 py-2 rounded-lg text-xs"
                    style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#C4B5FD' }}>
                    <FolderOpen size={12} /> 保存灵感
                  </button>
                  <button onClick={() => {
                    if (seg.videoUrl) {
                      navigator.clipboard.writeText(seg.videoUrl).then(() => {
                        setToast({ message: '链接已复制', type: 'success' });
                      }).catch(() => setToast({ message: '复制失败', type: 'error' }));
                    }
                  }}
                    className="flex items-center justify-center gap-1 py-2 rounded-lg text-xs"
                    style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#86EFAC' }}>
                    <Share2 size={12} /> 分享
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 失败分段 */}
        {segments.filter(s => s.status === 'failed' || s.status === 'skipped').length > 0 && (
          <div className="mb-4">
            <p style={{ color: '#FCA5A5', fontSize: 12, marginBottom: 8 }}>以下分段生成失败：</p>
            {segments.filter(s => s.status === 'failed' || s.status === 'skipped').map(seg => (
              <div key={seg.index} className="flex items-center gap-2 py-1 px-2 rounded"
                style={{ background: 'rgba(239,68,68,0.06)' }}>
                <XCircle size={12} color="#EF4444" />
                <span style={{ color: '#FCA5A5', fontSize: 12 }}>段{seg.index + 1}</span>
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                  {seg.status === 'failed' ? '生成失败' : '已跳过'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 合并视频 + BGM + 字幕 */}
        <div
          className="mt-4 p-3 rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(236,72,153,0.1))',
            border: '1px solid rgba(168,85,247,0.3)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #A855F7, #EC4899)' }}
            >
              <Layers size={14} color="#FFFFFF" />
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700 }}>
                合并成片 + BGM + 字幕
              </p>
              <p style={{ color: '#9CA3AF', fontSize: 10, lineHeight: 1.4 }}>
                {bgmOptions.find((b) => b.id === bgmStyle)?.label || bgmStyle} ·
                {' '}{subtitleStyle} · {subtitlePos}
              </p>
            </div>
          </div>

          {mergePhase === 'idle' && (
            <PrimaryButton
              fullWidth size="md"
              onClick={onMerge}
            >
              <Layers size={14} /> 开始合并
            </PrimaryButton>
          )}

          {mergePhase === 'merging' && (
            <div className="flex flex-col items-center py-3 gap-2">
              <Loader2 size={20} className="animate-spin" color="#A855F7" />
              <p style={{ color: '#FFFFFF', fontSize: 12 }}>
                正在合并 {segments.filter((s) => s.status === 'succeeded').length} 个视频片段…
              </p>
              <p style={{ color: '#9CA3AF', fontSize: 10 }}>
                预计 30-60 秒(下载 + 拼接 + BGM + 字幕)
              </p>
            </div>
          )}

          {mergePhase === 'error' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <XCircle size={14} color="#EF4444" />
                <span style={{ color: '#FCA5A5', fontSize: 11 }}>{mergeError || '合并失败'}</span>
              </div>
              <PrimaryButton fullWidth size="sm" onClick={() => { setMergePhase('idle'); setMergeError(null); }}>
                <RefreshCw size={12} /> 重试
              </PrimaryButton>
            </div>
          )}

          {mergePhase === 'done' && mergedVideoUrl && (
            <div className="space-y-2">
              <div
                className="flex items-center gap-2 p-2 rounded-lg"
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}
              >
                <CheckCircle2 size={14} color="#22C55E" />
                <span style={{ color: '#86EFAC', fontSize: 12 }}>合并完成</span>
              </div>
              <video src={mergedVideoUrl} controls playsInline
                className="w-full rounded-xl"
                style={{ background: '#000', maxHeight: 280 }} />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleDownloadMerged}
                  className="flex items-center justify-center gap-1 py-2 rounded-lg text-xs"
                  style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93C5FD' }}>
                  <Download size={12} /> 下载
                </button>
                <button onClick={() => onHandoff('/publish', { text: topic || '我的视频', topic: topic || '我的视频' })}
                  className="flex items-center justify-center gap-1 py-2 rounded-lg text-xs"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#86EFAC' }}>
                  <Share2 size={12} /> 多平台分发
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 重新生成 */}
        <PrimaryButton fullWidth size="lg" onClick={() => { setGenPhase('idle'); setSegments([]); setMergePhase('idle'); setMergedVideoUrl(null); }}>
          <RefreshCw size={16} /> 重新生成
        </PrimaryButton>

        {/* 下一步:反向 handoff 到其他工作流 */}
        <div
          className="mt-4 p-3 rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(244,114,182,0.06), rgba(139,92,246,0.06))',
            border: '1px solid rgba(244,114,182,0.15)',
          }}
        >
          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 8 }}>
            下一步:把视频用到别处
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                const firstFrame = segments.find((s) => s.videoUrl)?.videoUrl || '';
                const nextTopic = storyboard[0]?.subtitle || topic || '我的视频';
                onHandoff('/ai/digital-human', { firstFrame, topic: nextTopic });
              }}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl"
              style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)' }}
            >
              <Mic size={16} color="#06B6D4" />  {/* Using Mic from lucide, but original uses Mic */}
              <span style={{ color: '#06B6D4', fontSize: 11, fontWeight: 600 }}>做数字人</span>
            </button>
            <button
              onClick={() => {
                const firstFrame = segments.find((s) => s.videoUrl)?.videoUrl || '';
                const nextTopic = storyboard[0]?.subtitle || topic || '我的视频';
                onHandoff('/ai/ads', { firstFrame, topic: nextTopic });
              }}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              <Grid3x3 size={16} color="#F59E0B" />  {/* Using Grid3x3 from lucide */}
              <span style={{ color: '#F59E0B', fontSize: 11, fontWeight: 600 }}>做 9 宫格</span>
            </button>
            <button
              onClick={() => {
                const nextTopic = storyboard[0]?.subtitle || topic || '我的视频';
                onHandoff('/publish', { text: nextTopic, topic: nextTopic });
              }}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl"
              style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)' }}
            >
              <Share2 size={16} color="#F43F5E" />
              <span style={{ color: '#F43F5E', fontSize: 11, fontWeight: 600 }}>多平台分发</span>
            </button>
          </div>
        </div>
      </GlassCard>
    );
  }

  // ─── 错误状态 ──────────────────────────────────────

  if (genPhase === 'error') {
    return (
      <GlassCard>
        <div className="flex flex-col items-center py-10 gap-4">
          <XCircle size={40} color="#EF4444" />
          <p style={{ color: '#FCA5A5', fontSize: 14 }}>{genError || '生成失败'}</p>
          <PrimaryButton size="sm" onClick={() => { setGenPhase('idle'); setSegments([]); }}>
            <RefreshCw size={14} /> 重试
          </PrimaryButton>
        </div>
      </GlassCard>
    );
  }

  // ─── 加载/生成中状态 ──────────────────────────────

  return (
    <GlassCard>
      <div className="flex flex-col items-center py-8 gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          <div className="absolute inset-3 rounded-full border-2 border-purple-400 border-b-transparent animate-spin"
            style={{ animationDuration: '0.7s', animationDirection: 'reverse' }} />
        </div>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>
          {genPhase === 'submitting' ? '正在提交任务...' :
           genPhase === 'generating' ? '正在生成视频片段...' : '处理中...'}
        </p>

        {/* 分段进度 */}
        {segments.length > 0 && (
          <div className="w-full space-y-1.5">
            {segments.map((seg) => (
              <div key={seg.index} className="flex items-center gap-2 py-1 px-2 rounded"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                {seg.status === 'succeeded' ? <CheckCircle2 size={14} color="#22C55E" /> :
                 seg.status === 'failed' ? <XCircle size={14} color="#EF4444" /> :
                 seg.status === 'skipped' ? <AlertCircle size={14} color="#9CA3AF" /> :
                 <Loader2 size={14} className="animate-spin" color="#3B82F6" />}
                <span style={{ color: '#E5E7EB', fontSize: 12 }}>
                  段{seg.index + 1} ({seg.materialType === 'image' ? '图生' : '文生'}视频 · {seg.duration}秒)
                </span>
                {seg.model && (
                  <span style={{ color: '#6B7280', fontSize: 9, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getModelDisplayName(seg.model)}
                  </span>
                )}
                <span style={{ color: seg.status === 'succeeded' ? '#22C55E' : seg.status === 'failed' ? '#EF4444' : '#FBBF24', fontSize: 11, marginLeft: 'auto' }}>
                  {seg.status === 'succeeded' ? '完成' :
                   seg.status === 'failed' ? '失败' :
                   seg.status === 'queued' ? '排队' :
                   seg.status === 'running' ? '生成中' : '跳过'}
                </span>
              </div>
            ))}
          </div>
        )}

        <button onClick={onCancel}
          className="px-4 py-1.5 rounded-lg text-xs"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
          取消
        </button>
      </div>
    </GlassCard>
  );
}
