'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Zap, ChevronDown, ChevronUp, Download, FolderOpen, RefreshCw, Share2,
  ChevronLeft, ChevronRight, AlertCircle, Loader2, CheckCircle2, XCircle,
  Settings, Wand2, Sparkles, ImageIcon, Upload, X, Link2, Music,
} from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProtectedRoute } from '@/components';
import { Toast } from '@/components/Toast';
import { STYLE_PRESETS, LANGUAGE_OPTIONS } from '@/lib/style-constants';
import { QUALITY_TIERS, type QualityTier } from '@/lib/video-models';
import { useContentHandoff } from '@/hooks/use-content-handoff';

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

const typeEmojis: Record<string, string> = {
  text: '✨', link: '🔗', image: '🖼️', video: '🎬', voice: '🎵', schedule: '📅',
};

const DURATION_OPTIONS = [
  { value: 10, label: '10秒', desc: '1段, 约3分钟' },
  { value: 15, label: '15秒', desc: '2段, 约5分钟' },
  { value: 30, label: '30秒', desc: '3段, 约5分钟' },
  { value: 60, label: '60秒', desc: '6段, 约8分钟' },
];

const bgmOptions = [
  { id: 'tech', label: '科技感', wave: [3, 6, 4, 8, 5, 7, 3, 9, 6, 4] },
  { id: 'chill', label: '轻松舒缓', wave: [3, 4, 3, 5, 4, 3, 4, 5, 3, 4] },
  { id: 'hype', label: '热血激昂', wave: [6, 8, 9, 7, 9, 8, 9, 7, 8, 9] },
];

const subtitleStyles = ['白色粗体', '黄色描边', '黑底白字', '渐变彩色'];
const subtitlePositions = ['底部', '中部', '顶部'];

const STEPS = ['确定方向', '分镜预览', '生成'];

const stylePresets = Object.entries(STYLE_PRESETS);

function getModelDisplayName(model: string): string {
  if (model.includes('wan')) return 'Wan 2.6';
  if (model.includes('happyhorse')) return 'HappyHorse';
  if (model.includes('fast')) return 'Seedance Fast';
  if (model.includes('1-5-pro')) return 'Seedance 1.5 Pro';
  if (model.includes('lite')) return 'Seedance Lite';
  return model.substring(0, 14);
}

function AIVideoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { receive } = useContentHandoff();

  // ─── Step 1: 确定方向 ──────────────────────────────────

  const [inspirations, setInspirations] = useState<InspirationItem[]>([]);
  const [selectedInspirations, setSelectedInspirations] = useState<Set<string | number>>(new Set());
  const [topic, setTopic] = useState('');
  const [stylePreset, setStylePreset] = useState('douyin_hot');
  const [duration, setDuration] = useState(10);
  const [qualityTier, setQualityTier] = useState('standard');
  const [language, setLanguage] = useState('zh');

  // ─── 首帧图片（关键：图生视频入口） ──────────────────────
  const [firstFrameUrl, setFirstFrameUrl] = useState<string | null>(null);
  const [firstFrameInput, setFirstFrameInput] = useState('');
  const [firstFrameTab, setFirstFrameTab] = useState<'inspiration' | 'url' | 'upload'>('inspiration');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Step 2: 分镜预览 & 微调 ─────────────────────────

  const [storyboard, setStoryboard] = useState<StoryboardScene[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingSceneIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingSceneIndex]);

  // BGM / 字幕覆盖（初始值来自风格预设，用户可改）
  const [bgmStyle, setBgmStyle] = useState('tech');
  const [subtitleStyle, setSubtitleStyle] = useState('白色粗体');
  const [subtitlePos, setSubtitlePos] = useState('底部');

  // ─── Step 3: 生成 ─────────────────────────────────────

  const [currentStep, setCurrentStep] = useState(1);
  const [segments, setSegments] = useState<SegmentState[]>([]);
  const [genPhase, setGenPhase] = useState<'idle' | 'submitting' | 'generating' | 'done' | 'error'>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const segmentsRef = useRef<SegmentState[]>([]);
  const [oneClickMode, setOneClickMode] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ─── 加载灵感数据 ────────────────────────────────────

  useEffect(() => {
    fetch('/api/inspiration?limit=20')
      .then((r) => r.json())
      .then((d) => { if (d.success) setInspirations(d.data || []); })
      .catch(() => {});
  }, []);

  // ─── URL 参数接收（从 AI 生图 / AI 文案 带入） ────────
  useEffect(() => {
    const params = receive(['firstFrame', 'prompt', 'text', 'topic', 'style', 'imageUrl']);
    if (params.firstFrame) {
      setFirstFrameUrl(params.firstFrame);
      setFirstFrameTab('url');
    } else if (params.imageUrl) {
      setFirstFrameUrl(params.imageUrl);
      setFirstFrameTab('url');
    }
    if (params.prompt || params.text) {
      setTopic((params.prompt || params.text || '').slice(0, 300));
    } else if (params.topic) {
      setTopic(params.topic);
    }
  }, []);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // ─── 风格预设变化时更新默认 BGM/字幕 ─────────────

  useEffect(() => {
    const preset = STYLE_PRESETS[stylePreset];
    if (preset) {
      setBgmStyle(preset.bgm);
      setSubtitleStyle(preset.subtitle);
      setSubtitlePos(preset.subtitlePos);
      if (duration !== preset.recDuration && currentStep === 1) {
        setDuration(preset.recDuration as 10 | 15 | 30 | 60);
      }
    }
  }, [stylePreset]);

  // ─── 操作函数 ────────────────────────────────────────

  const toggleInspiration = (id: string | number) => {
    const next = new Set(selectedInspirations);
    if (next.has(id)) {
      next.delete(id);
    } else if (next.size < 5) {
      next.add(id);
    }
    setSelectedInspirations(next);
  };

  const handleGenerateStoryboardV2 = async () => {
    if (selectedInspirations.size === 0) {
      setToast({ message: '请先选择素材', type: 'error' });
      return;
    }
    setIsGenerating(true);
    const selectedData = inspirations.filter((i) => selectedInspirations.has(i.id));
    try {
      const res = await fetch('/api/ai/video/storyboard-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspirations: selectedData,
          stylePreset,
          duration,
          topic: topic.trim() || undefined,
          language,
          firstFrameUrl: firstFrameUrl || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.data.storyboard) {
        setStoryboard(data.data.storyboard);
        // 应用服务端返回的 styleDefaults
        if (data.data.styleDefaults) {
          setBgmStyle(data.data.styleDefaults.bgm);
          setSubtitleStyle(data.data.styleDefaults.subtitle);
          setSubtitlePos(data.data.styleDefaults.subtitlePos);
        }
        setCurrentStep(2);
      } else {
        setToast({ message: data.error || '分镜生成失败', type: 'error' });
      }
    } catch {
      setToast({ message: '网络错误，请重试', type: 'error' });
    }
    setIsGenerating(false);
  };

  const updateScene = (index: number, field: 'visualPrompt' | 'subtitle', value: string) => {
    setStoryboard((prev) =>
      prev.map((s) => (s.index === index ? { ...s, [field]: value } : s))
    );
  };

  const submitGenerate = useCallback(async () => {
    if (!storyboard || storyboard.length === 0) {
      setToast({ message: '请先生成分镜', type: 'error' });
      return;
    }

    setGenPhase('submitting');
    setGenError(null);

    const selectedData = inspirations.filter((i) => selectedInspirations.has(i.id));

    try {
      const res = await fetch('/api/ai/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyboard,
          inspirations: selectedData,
          qualityTier,
          firstFrameUrl: firstFrameUrl || undefined,
          bgmStyle,
          subtitleStyle,
          subtitlePosition: subtitlePos,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '提交失败');

      const segs: SegmentState[] = data.data.segments.map((s: any) => ({
        ...s,
        status: s.taskId ? 'queued' : (s.status === 'error' ? 'failed' : 'skipped'),
      }));
      console.log('[Generate] 提交结果:', segs.map(s => ({ idx: s.index, taskId: s.taskId, status: s.status })));
      setSegments(segs);
      segmentsRef.current = segs;

      // 检查：全部 segment 都没有 taskId（提交到 AI 全部失败）
      const validSegs = segs.filter((s) => s.taskId);
      const validTaskIds = validSegs.map((s) => s.taskId).join(',');
      const validProviders = validSegs.map((s) => s.provider || 'dashscope').join(',');
      if (!validTaskIds) {
        const errMsg = segs[0]?.status === 'skipped' ? '所有片段提交 AI 生成失败，请检查 API Key 或稍后重试' : '未获取到生成任务';
        setGenError(errMsg);
        setGenPhase('error');
        return;
      }

      // 开始轮询
      setGenPhase('generating');
      let attempts = 0;
      pollingRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 120) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setGenError('生成超时，请重试');
          setGenPhase('error');
          return;
        }
        try {
          const pollRes = await fetch(`/api/ai/video/generate?taskIds=${validTaskIds}&providers=${validProviders}`);
          const pollData = await pollRes.json();
          if (pollData.success) {
            const { results, progress } = pollData.data;

            // 直接用 ref 拿到最新 segments，避免 setState 异步导致拿不到更新后的值
            const updatedSegs = segmentsRef.current.map((seg) => {
              const r = seg.taskId ? results?.[seg.taskId] : undefined;
              if (r) {
                return {
                  ...seg,
                  status: r.status === 'succeeded' ? 'succeeded' as const
                    : r.status === 'failed' ? 'failed' as const
                    : seg.status === 'queued' ? 'running' as const
                    : seg.status,
                  videoUrl: r.videoUrl || seg.videoUrl,
                };
              }
              return seg;
            });
            segmentsRef.current = updatedSegs;
            setSegments(updatedSegs);

            if (progress?.allDone) {
              if (pollingRef.current) clearInterval(pollingRef.current);
              setGenPhase('done');
            }
          } else {
            console.warn('[Poll] API 返回非成功:', pollData.error || pollData);
          }
        } catch (pollErr) {
          console.warn('[Poll] 轮询请求失败:', pollErr);
        }
      }, 5000);
    } catch (e: any) {
      setGenError(e.message || '提交失败');
      setGenPhase('error');
    }
  }, [storyboard, inspirations, selectedInspirations, bgmStyle, subtitleStyle, subtitlePos, qualityTier]);

  const handleOneClickGenerate = async () => {
    if (selectedInspirations.size === 0) {
      setToast({ message: '请先选择素材', type: 'error' });
      return;
    }
    setOneClickMode(true);
    setCurrentStep(3);
    setGenPhase('submitting');
    setGenError(null);

    const selectedData = inspirations.filter((i) => selectedInspirations.has(i.id));

    try {
      const res = await fetch('/api/ai/video/one-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspirations: selectedData,
          topic: topic.trim() || undefined,
          stylePreset,
          qualityTier,
          language,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '一键成片失败');

      // 设置分镜
      if (data.data.storyboard) {
        setStoryboard(data.data.storyboard);
      }

      const segs: SegmentState[] = data.data.segments.map((s: any) => ({
        ...s,
        status: s.taskId ? 'queued' : 'failed',
      }));
      setSegments(segs);
      segmentsRef.current = segs;

      const validSegs = segs.filter((s) => s.taskId);
      if (validSegs.length === 0) {
        setGenError('所有片段提交失败');
        setGenPhase('error');
        return;
      }

      // 开始轮询
      setGenPhase('generating');
      const validTaskIds = validSegs.map((s) => s.taskId).join(',');
      const validProviders = validSegs.map((s) => s.provider || 'dashscope').join(',');
      let attempts = 0;
      pollingRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 120) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setGenError('生成超时，请重试');
          setGenPhase('error');
          return;
        }
        try {
          const pollRes = await fetch(`/api/ai/video/generate?taskIds=${validTaskIds}&providers=${validProviders}`);
          const pollData = await pollRes.json();
          if (pollData.success) {
            const { results, progress } = pollData.data;
            const updatedSegs = segmentsRef.current.map((seg) => {
              const r = seg.taskId ? results?.[seg.taskId] : undefined;
              if (r) {
                return {
                  ...seg,
                  status: r.status === 'succeeded' ? 'succeeded' as const
                    : r.status === 'failed' ? 'failed' as const
                    : seg.status === 'queued' ? 'running' as const
                    : seg.status,
                  videoUrl: r.videoUrl || seg.videoUrl,
                };
              }
              return seg;
            });
            segmentsRef.current = updatedSegs;
            setSegments(updatedSegs);

            if (progress?.allDone) {
              if (pollingRef.current) clearInterval(pollingRef.current);
              setGenPhase('done');
            }
          }
        } catch (pollErr) {
          console.warn('[OneClick Poll] 轮询失败:', pollErr);
        }
      }, 5000);
    } catch (e: any) {
      console.error('[OneClick] 一键成片失败:', e);
      setGenError(e.message || '一键成片失败');
      setGenPhase('error');
    }
  };

  const handleCancel = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setGenPhase('idle');
    setSegments([]);
  };

  // ─── 保存单个分段到作品 ─────────────────────────────

  const handleSaveSegment = async (seg: SegmentState) => {
    try {
      const sb = storyboard.find((s) => s.index === seg.index);
      const title = sb?.subtitle || `视频片段 ${seg.index + 1}`;
      const res = await fetch('/api/inspiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          title: title.substring(0, 100),
          original_text: sb?.visualPrompt || '',
          media_urls: [seg.videoUrl],
          source_platform: 'ai_video',
          tags: ['AI生成', '视频片段'],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: `"${title}" 已保存到作品`, type: 'success' });
      } else {
        setToast({ message: data.error || '保存失败', type: 'error' });
      }
    } catch {
      setToast({ message: '保存失败，请重试', type: 'error' });
    }
  };

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
    } catch {
      setToast({ message: '下载失败', type: 'error' });
    }
  };

  const handleNavigate = (page: PageKey) => {
    const routes: Record<string, string> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(routes[page] || '/home');
  };

  // ─── 阶段步骤渲染 ─────────────────────────────────────

  const renderStep1 = () => (
    <>
      {/* 首帧图片（关键：图生视频入口） */}
      <GlassCard>
        <div className="flex items-center justify-between mb-2">
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>
            <span style={{ color: '#F59E0B' }}>首帧</span> · 视频起始画面
            <span style={{ color: '#6B7280', fontSize: 11, fontWeight: 400, marginLeft: 4 }}>（可作为图生视频的素材）</span>
          </p>
          {firstFrameUrl && (
            <button
              onClick={() => setFirstFrameUrl(null)}
              className="text-xs flex items-center gap-1 px-2 py-0.5 rounded"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <X size={11} /> 清除
            </button>
          )}
        </div>

        {/* 已选首帧预览 */}
        {firstFrameUrl && (
          <div
            className="mb-3 rounded-xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(139,92,246,0.15))',
              border: '1px solid rgba(245,158,11,0.3)',
              aspectRatio: '16/9',
              maxHeight: 200,
            }}
          >
            <img src={firstFrameUrl} alt="首帧" className="w-full h-full object-cover" />
          </div>
        )}

        {/* 三个 tab */}
        <div className="flex rounded-lg overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {([
            { key: 'inspiration' as const, label: '灵感库', icon: '📚' },
            { key: 'url' as const, label: 'URL', icon: '🔗' },
            { key: 'upload' as const, label: '上传', icon: '📤' },
          ]).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setFirstFrameTab(key)}
              className="flex-1 py-2 text-xs flex items-center justify-center gap-1.5 transition-all"
              style={{
                background: firstFrameTab === key ? 'rgba(245,158,11,0.2)' : 'transparent',
                color: firstFrameTab === key ? '#FCD34D' : '#9CA3AF',
                fontWeight: firstFrameTab === key ? 600 : 400,
              }}
            >
              <span>{icon}</span> {label}
            </button>
          ))}
        </div>

        {firstFrameTab === 'inspiration' && (
          <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
            {inspirations.length === 0 ? (
              <p style={{ color: '#6B7280', fontSize: 11, textAlign: 'center', padding: 8 }}>加载中...</p>
            ) : (
              inspirations
                .filter((i) => i.type === 'image' && i.media_urls && i.media_urls.length > 0)
                .map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setFirstFrameUrl(item.media_urls![0])}
                    className="flex items-center gap-2 p-1.5 rounded-lg cursor-pointer"
                    style={{
                      background: firstFrameUrl === item.media_urls![0] ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                      border: firstFrameUrl === item.media_urls![0] ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <img src={item.media_urls![0]} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                    <span style={{ color: '#E5E7EB', fontSize: 11 }} className="truncate flex-1">
                      {item.title || '未命名'}
                    </span>
                    {firstFrameUrl === item.media_urls![0] && <CheckCircle2 size={12} color="#FCD34D" />}
                  </div>
                ))
            )}
          </div>
        )}

        {firstFrameTab === 'url' && (
          <div>
            <div className="flex gap-1.5">
              <input
                value={firstFrameInput}
                onChange={(e) => setFirstFrameInput(e.target.value)}
                placeholder="https://... 图片 URL"
                className="flex-1 px-2.5 py-2 rounded-lg text-xs bg-transparent outline-none"
                style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <button
                onClick={() => { if (firstFrameInput.trim()) setFirstFrameUrl(firstFrameInput.trim()); }}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(245,158,11,0.2)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.3)' }}
              >
                <Link2 size={11} className="inline mr-0.5" /> 应用
              </button>
            </div>
            {firstFrameUrl && firstFrameTab === 'url' && (
              <p style={{ color: '#FCD34D', fontSize: 10, marginTop: 4 }} className="truncate">
                ✓ 已设置：{firstFrameUrl.slice(0, 60)}...
              </p>
            )}
          </div>
        )}

        {firstFrameTab === 'upload' && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                // 简单方案：用 FileReader 读为 data URL
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const dataUrl = ev.target?.result as string;
                  setFirstFrameUrl(dataUrl);
                  setToast({ message: '已加载本地图片', type: 'success' });
                };
                reader.readAsDataURL(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 rounded-lg text-xs flex items-center justify-center gap-1.5"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', color: '#9CA3AF' }}
            >
              <Upload size={14} /> 点击选择本地图片
            </button>
          </div>
        )}
      </GlassCard>

      {/* 素材选择 */}
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#3B82F6' }}>素材</span> · 灵感库选材
        </p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {inspirations.length > 0 ? (
            inspirations.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer"
                onClick={() => toggleInspiration(item.id)}
                style={{
                  background: selectedInspirations.has(item.id)
                    ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.05)',
                  border: selectedInspirations.has(item.id)
                    ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    background: selectedInspirations.has(item.id) ? '#3B82F6' : 'transparent',
                    border: selectedInspirations.has(item.id) ? 'none' : '1px solid rgba(255,255,255,0.3)',
                    fontSize: 10, color: '#fff',
                  }}>
                  {selectedInspirations.has(item.id) ? '✓' : ''}
                </div>
                <span style={{ fontSize: 18 }}>{typeEmojis[item.type || 'text']}</span>
                <span style={{ color: '#E5E7EB', fontSize: 12 }} className="truncate">
                  {item.title || item.ai_summary || item.original_text?.substring(0, 30) || '未命名'}
                </span>
              </div>
            ))
          ) : (
            <p style={{ color: '#9CA3AF', textAlign: 'center', padding: 16 }}>
              {inspirations.length === 0 ? '加载中...' : '暂无灵感，去灵感库添加吧'}
            </p>
          )}
        </div>
        <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 8 }}>
          已选 {selectedInspirations.size} 个素材（最多5个）
        </p>
      </GlassCard>

      {/* 风格预设 */}
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#8B5CF6' }}>风格</span> · 视频风格预设
        </p>
        <div className="grid grid-cols-3 gap-2">
          {stylePresets.map(([key, preset]) => (
            <button
              key={key}
              onClick={() => setStylePreset(key)}
              className="flex flex-col items-center gap-1 p-3 rounded-xl transition-all"
              style={{
                background: stylePreset === key ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
                border: stylePreset === key ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span style={{ fontSize: 22 }}>{preset.icon}</span>
              <span style={{ color: stylePreset === key ? '#C4B5FD' : '#E5E7EB', fontSize: 12, fontWeight: 600 }}>
                {preset.label}
              </span>
              <span style={{ color: '#9CA3AF', fontSize: 10 }}>推荐{preset.recDuration}s</span>
            </button>
          ))}
        </div>
        <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 8 }}>
          风格预设会自动匹配 BGM 和字幕样式
        </p>
      </GlassCard>

      {/* 时长选择 */}
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#22C55E' }}>时长</span> · 选择视频长度
        </p>
        <div className="grid grid-cols-4 gap-2">
          {DURATION_OPTIONS.map(({ value, label, desc }) => (
            <button key={value}
              onClick={() => setDuration(value as 10 | 15 | 30 | 60)}
              className="flex flex-col items-center py-3 rounded-xl transition-all"
              style={{
                background: duration === value ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
                border: duration === value ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.1)',
              }}>
              <span style={{ color: duration === value ? '#86EFAC' : '#E5E7EB', fontSize: 16, fontWeight: 700 }}>{label}</span>
              <span style={{ color: '#9CA3AF', fontSize: 9 }}>{desc}</span>
            </button>
          ))}
        </div>
      </GlassCard>

      {/* 高级设置折叠 */}
      <div
        className="p-3 rounded-xl cursor-pointer transition-all"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={() => setAdvancedOpen(!advancedOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={14} color="#9CA3AF" />
            <span style={{ color: '#9CA3AF', fontSize: 13 }}>高级设置</span>
            <span style={{ color: '#6B7280', fontSize: 10 }}>
              {qualityTier === 'standard' ? '标准画质' : qualityTier === 'high' ? '高清画质' : '超高清'} · {LANGUAGE_OPTIONS.find(l => l.value === language)?.nativeLabel || '中文'}
            </span>
          </div>
          {advancedOpen ? <ChevronUp size={14} color="#9CA3AF" /> : <ChevronDown size={14} color="#9CA3AF" />}
        </div>
        {advancedOpen && (
          <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {/* 画质档位 */}
            <div>
              <p style={{ color: '#F59E0B', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>画质档位</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.values(QUALITY_TIERS).map((tier: QualityTier) => {
                  const t2vName = getModelDisplayName(tier.t2v.model);
                  const i2vName = getModelDisplayName(tier.i2v.model);
                  return (
                    <button
                      key={tier.value}
                      onClick={(e) => { e.stopPropagation(); setQualityTier(tier.value); }}
                      className="flex flex-col items-center gap-1 p-2.5 rounded-xl transition-all"
                      style={{
                        background: qualityTier === tier.value ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                        border: qualityTier === tier.value ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{tier.icon}</span>
                      <span style={{
                        color: qualityTier === tier.value ? '#FCD34D' : '#E5E7EB',
                        fontSize: 13, fontWeight: 700,
                      }}>
                        {tier.label}
                      </span>
                      <span style={{ color: '#9CA3AF', fontSize: 9 }}>{tier.description}</span>
                      <span style={{
                        color: qualityTier === tier.value ? '#FCD34D' : '#6B7280',
                        fontSize: 9, lineHeight: 1.4, textAlign: 'center',
                      }}>
                        {t2vName}<br />{i2vName}
                      </span>
                      <span style={{
                        color: qualityTier === tier.value ? '#FCD34D' : '#6B7280',
                        fontSize: 9, fontWeight: 600,
                      }}>
                        {tier.t2v.price}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* 语言选择 */}
            <div>
              <p style={{ color: '#3B82F6', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>字幕语言</p>
              <div className="grid grid-cols-4 gap-2">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <button
                    key={lang.value}
                    onClick={(e) => { e.stopPropagation(); setLanguage(lang.value); }}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all"
                    style={{
                      background: language === lang.value ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                      border: language === lang.value ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{lang.icon}</span>
                    <span style={{ color: language === lang.value ? '#93C5FD' : '#9CA3AF', fontSize: 11 }}>
                      {lang.nativeLabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 主题 */}
      <GlassCard>
        <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>主题方向（可选）</p>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="例：产品发布、旅行vlog、知识科普..."
          className="w-full px-3 py-2 rounded-xl bg-transparent text-sm outline-none"
          style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
        />
      </GlassCard>

      {/* 一键成片 */}
      <GlassCard
        hover
        onClick={handleOneClickGenerate}
        className="!p-4 relative overflow-hidden"
        style={{
          border: '1px solid rgba(239,68,68,0.4)',
          background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(245,158,11,0.08))',
        }}
      >
        <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl" style={{ background: 'rgba(239,68,68,0.15)' }} />
        <div className="flex items-center gap-3 relative">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <Wand2 size={20} color="#FCA5A5" />
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ color: '#FCA5A5', fontSize: 14, fontWeight: 700 }}>一键成片</p>
            <p style={{ color: '#9CA3AF', fontSize: 11 }}>
              自动分镜 + 生成 · 选好素材直接出片
            </p>
          </div>
          <ChevronRight size={18} color="#FCA5A5" />
        </div>
      </GlassCard>

      {/* 生成按钮 */}
      <PrimaryButton fullWidth size="lg" onClick={handleGenerateStoryboardV2} disabled={isGenerating || selectedInspirations.size === 0}>
        <Sparkles size={16} /> {isGenerating ? '生成中...' : 'AI 生成分镜'}
      </PrimaryButton>
    </>
  );

  const renderStep2 = () => (
    <>
      {/* 分镜卡片 */}
      {storyboard.length > 0 && (
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <p style={{ color: '#9CA3AF', fontSize: 12 }}>
              {storyboard.length} 段分镜 · 总 {duration} 秒 · 点击画面 Prompt 可编辑
            </p>
            <button
              onClick={handleGenerateStoryboardV2}
              disabled={isGenerating}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs"
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#C4B5FD' }}
            >
              {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              重新生成
            </button>
          </div>
          <div className="space-y-2">
            {storyboard.map((scene) => (
              <div key={scene.index}
                className="p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded text-xs font-bold"
                    style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD' }}>
                    段{scene.index + 1}
                  </span>
                  <span style={{ color: '#3B82F6', fontSize: 11 }}>
                    {scene.timeStart}s - {scene.timeEnd}s ({scene.duration}秒)
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs"
                    style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF' }}>
                    {scene.transition}
                  </span>
                </div>

                <label style={{ color: '#9CA3AF', fontSize: 10 }}>画面 Prompt</label>
                {editingSceneIndex === scene.index ? (
                  <textarea
                    ref={editInputRef}
                    value={scene.visualPrompt}
                    onChange={(e) => updateScene(scene.index, 'visualPrompt', e.target.value)}
                    onBlur={() => setEditingSceneIndex(null)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingSceneIndex(null); }}
                    rows={3}
                    className="w-full bg-transparent text-xs outline-none mb-2 resize-none"
                    style={{ color: '#E5E7EB', border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6, padding: 6 }}
                  />
                ) : (
                  <p onMouseDown={(e) => { e.preventDefault(); setEditingSceneIndex(scene.index); }}
                    className="cursor-pointer text-xs mb-2 leading-relaxed"
                    style={{ color: '#E5E7EB', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {scene.visualPrompt}
                  </p>
                )}

                <label style={{ color: '#9CA3AF', fontSize: 10 }}>字幕</label>
                <input
                  value={scene.subtitle}
                  onChange={(e) => updateScene(scene.index, 'subtitle', e.target.value)}
                  className="w-full bg-transparent text-xs outline-none"
                  style={{ color: '#E5E7EB', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* 后期配置：BGM + 字幕（实做） */}
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#EC4899' }}>后期</span> · BGM 与字幕
          <span style={{ color: '#6B7280', fontSize: 11, fontWeight: 400, marginLeft: 4 }}>（已配置真实音频）</span>
        </p>

        {/* BGM 选择 */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Music size={13} color="#EC4899" />
            <p style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>背景音乐</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {bgmOptions.map((b) => (
              <button
                key={b.id}
                onClick={() => setBgmStyle(b.id)}
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-lg transition-all"
                style={{
                  background: bgmStyle === b.id ? 'rgba(236,72,153,0.2)' : 'rgba(255,255,255,0.05)',
                  border: bgmStyle === b.id ? '1px solid rgba(236,72,153,0.5)' : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div className="flex items-end gap-0.5 h-4">
                  {b.wave.map((v, i) => (
                    <div key={i} className="w-0.5 rounded-full" style={{
                      height: v * 1.5,
                      background: bgmStyle === b.id ? '#F472B6' : '#6B7280',
                    }} />
                  ))}
                </div>
                <span style={{ color: bgmStyle === b.id ? '#FBCFE8' : '#E5E7EB', fontSize: 11, fontWeight: 600 }}>{b.label}</span>
              </button>
            ))}
          </div>
          {/* 试听按钮 */}
          {bgmStyle && (
            <audio
              key={bgmStyle}
              controls
              preload="none"
              src={`/bgm/${bgmStyle}.mp3`}
              className="w-full mt-2"
              style={{ height: 32 }}
            />
          )}
        </div>

        {/* 字幕样式 */}
        <div className="mb-3">
          <p style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>字幕样式</p>
          <div className="grid grid-cols-4 gap-1.5">
            {subtitleStyles.map((s) => (
              <button
                key={s}
                onClick={() => setSubtitleStyle(s)}
                className="py-1.5 rounded text-[11px] transition-all"
                style={{
                  background: subtitleStyle === s ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                  border: subtitleStyle === s ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  color: subtitleStyle === s ? '#93C5FD' : '#9CA3AF',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* 字幕位置 */}
        <div>
          <p style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>字幕位置</p>
          <div className="grid grid-cols-3 gap-1.5">
            {subtitlePositions.map((p) => (
              <button
                key={p}
                onClick={() => setSubtitlePos(p)}
                className="py-1.5 rounded text-[11px] transition-all"
                style={{
                  background: subtitlePos === p ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                  border: subtitlePos === p ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  color: subtitlePos === p ? '#93C5FD' : '#9CA3AF',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <PrimaryButton variant="ghost" size="md" onClick={() => setCurrentStep(1)}>
          <ChevronLeft size={16} /> 上一步
        </PrimaryButton>
        <PrimaryButton fullWidth size="md" onClick={() => { setCurrentStep(3); submitGenerate(); }}>
          <Zap size={16} /> 开始生成视频
        </PrimaryButton>
      </div>
    </>
  );

  const renderStep3 = () => (
    <GlassCard>
      {genPhase === 'idle' ? (
        <>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: '#3B82F6' }}>确认</span> · 生成参数
          </p>
          <div className="space-y-2 mb-4">
            {[
              { label: '素材数', value: `${selectedInspirations.size} 个` },
              { label: '风格', value: STYLE_PRESETS[stylePreset]?.label || '-' },
              { label: '目标时长', value: `${duration} 秒` },
              { label: '分段数', value: `${storyboard.length} 段` },
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
          <PrimaryButton fullWidth size="lg" onClick={submitGenerate}>
            <Zap size={16} /> 开始生成
          </PrimaryButton>
        </>
      ) : genPhase === 'done' ? (
        <>
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

          {/* 重新生成 */}
          <PrimaryButton fullWidth size="lg" onClick={() => { setGenPhase('idle'); setSegments([]); }}>
            <RefreshCw size={16} /> 重新生成
          </PrimaryButton>
        </>
      ) : genPhase === 'error' ? (
        <div className="flex flex-col items-center py-10 gap-4">
          <XCircle size={40} color="#EF4444" />
          <p style={{ color: '#FCA5A5', fontSize: 14 }}>{genError || '生成失败'}</p>
          <PrimaryButton size="sm" onClick={() => { setGenPhase('idle'); setSegments([]); }}>
            <RefreshCw size={14} /> 重试
          </PrimaryButton>
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            <div className="absolute inset-3 rounded-full border-2 border-purple-400 border-b-transparent animate-spin"
              style={{ animationDuration: '0.7s', animationDirection: 'reverse' }} />
          </div>
          <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>
            {oneClickMode && (
              <span style={{ color: '#FCA5A5', fontSize: 11, display: 'block', marginBottom: 4 }}>一键成片 · 自动分镜+生成</span>
            )}
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

          <button onClick={handleCancel}
            className="px-4 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            取消
          </button>
        </div>
      )}
    </GlassCard>
  );

  // ─── 主渲染 ──────────────────────────────────────────

  const isGenActive = genPhase !== 'idle' && genPhase !== 'error' && genPhase !== 'done';

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <TopNav title="AI 视频生成" showBack onBack={() => router.push('/ai')} />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* Step 导航 — 生成期间隐藏 */}
        {!isGenActive && genPhase !== 'done' && (
          <>
            <div className="overflow-x-auto">
              <div className="flex gap-0 min-w-max justify-center">
                {STEPS.map((step, i) => {
                  const stepIndex = i + 1;
                  return (
                    <button key={step} onClick={() => { if (stepIndex <= currentStep && !isGenActive) setCurrentStep(stepIndex); }}
                      className="flex flex-col items-center gap-1 px-3">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{
                          background: stepIndex === currentStep ? '#3B82F6' : stepIndex < currentStep ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)',
                          border: stepIndex === currentStep ? 'none' : stepIndex < currentStep ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.2)',
                          color: stepIndex === currentStep ? '#FFFFFF' : stepIndex < currentStep ? '#86EFAC' : '#9CA3AF',
                          boxShadow: stepIndex === currentStep ? '0 0 12px rgba(59,130,246,0.5)' : 'none',
                        }}>
                        {stepIndex < currentStep ? '✓' : stepIndex}
                      </div>
                      <span style={{
                        color: stepIndex === currentStep ? '#3B82F6' : stepIndex < currentStep ? '#86EFAC' : '#9CA3AF',
                        fontSize: 10, whiteSpace: 'nowrap',
                      }}>{step}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 内容 */}
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && genPhase === 'idle' && renderStep3()}
          </>
        )}

        {/* 生成中 / 生成完成 — 全屏占据 */}
        {(isGenActive || genPhase === 'done') && (
          <>
            {genPhase === 'done' ? (
              <div className="pt-2">
                {renderStep3()}
              </div>
            ) : (
              renderStep3()
            )}
          </>
        )}
      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function AIVideoPage() {
  return (
    <ProtectedRoute>
      <AIVideoContent />
    </ProtectedRoute>
  );
}
