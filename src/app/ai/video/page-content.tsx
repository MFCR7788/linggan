'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Zap, ChevronDown, ChevronUp, Download, FolderOpen, RefreshCw, Share2, Mic, Grid3x3, Layers,
  ChevronLeft, AlertCircle, Loader2, CheckCircle2, XCircle,
  Settings, Wand2, Sparkles, ImageIcon, Music,
} from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { MediaPicker } from '@/components/MediaPicker';
import { TopNav } from '@/components/TopNav';
import { PageKey } from "@/components/BottomNav";
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProtectedRoute } from '@/components';
import { Toast } from '@/components/Toast';
import { STYLE_PRESETS, LANGUAGE_OPTIONS } from '@/lib/style-constants';
import { QUALITY_TIERS, type QualityTier } from '@/lib/video-models';
import { calcAiVideoCost, CREDIT_COSTS } from '@/lib/credit-costs';
import { useContentHandoff } from '@/hooks/use-content-handoff';
import { useWorkflowSession } from '@/hooks/use-workflow-session';
import { useVideoGeneration } from '@/hooks/ai/use-video-generation';
import { useWorkHistory } from '@/hooks/use-work-history';
import { WorkflowSessionBar } from '@/components/WorkflowSessionBar';
import { apiClient } from '@/lib/api-client';

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
  text: '✨', link: '🔗', image: '🖼️', video: '🎬', voice: '🎵', audio: '🎵', schedule: '📅',
};

const DURATION_OPTIONS = [
  { value: 10, label: '10秒', desc: '1段, 约3分钟' },
  { value: 15, label: '15秒', desc: '2段, 约5分钟' },
  { value: 30, label: '30秒', desc: '3段, 约5分钟' },
  { value: 60, label: '60秒', desc: '6段, 约8分钟' },
];

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

const STEPS = ['创作方向', '分镜脚本', '生成成片'];

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
  const { receive, handoff } = useContentHandoff();
  const workflowSessionId = searchParams.get('workflow_session_id') || undefined;
  const { session, isInWorkflow, completeCurrentStep, pauseSession, resumeSession, abandonSession } = useWorkflowSession(workflowSessionId);

  // ─── Step 1: 确定方向 ──────────────────────────────────

  const [inspirations, setInspirations] = useState<InspirationItem[]>([]);
  const [inspirationsLoading, setInspirationsLoading] = useState(true);
  const [selectedInspirations, setSelectedInspirations] = useState<Set<string | number>>(new Set());
  const [topic, setTopic] = useState('');
  const [stylePreset, setStylePreset] = useState('douyin_hot');
  const [duration, setDuration] = useState(10);
  const [qualityTier, setQualityTier] = useState('fast');
  const [language, setLanguage] = useState('zh');
  const { items: historyItems, isLoading: historyLoading } = useWorkHistory('视频', 'ai_video');

  // ─── 首帧图片（关键：图生视频入口） ──────────────────────
  const [firstFrameUrl, setFirstFrameUrl] = useState<string | null>(null);
  // ─── 多首尾帧模式（高级:首帧 + 尾帧 + 中间关键帧）──
  const [multiFrameMode, setMultiFrameMode] = useState(false);
  const [lastFrameUrl, setLastFrameUrl] = useState('');
  const [extraFramesText, setExtraFramesText] = useState(''); // 逗号/换行分隔,parse 时取 http 开头
  const [firstFrameInput, setFirstFrameInput] = useState('');
  const [firstFrameTab, setFirstFrameTab] = useState<'inspiration' | 'url' | 'upload'>('inspiration');

  // ─── Step 2: 分镜预览 & 微调 ─────────────────────────

  const [storyboard, setStoryboard] = useState<StoryboardScene[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAutoSubtitling, setIsAutoSubtitling] = useState(false);
  const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // ─── Step 3: 首帧生成 ─────────────────────────────────
  const [generatingFrameIndices, setGeneratingFrameIndices] = useState<Set<number>>(new Set());

  // ─── HyperFrames 动态图形 ────────────────────────────
  const [hfScript, setHfScript] = useState('');
  const [hfStyle, setHfStyle] = useState<'product' | 'social' | 'slide'>('product');
  const [hfGenerating, setHfGenerating] = useState(false);
  const [hfVideoUrl, setHfVideoUrl] = useState<string | null>(null);
  const [hfError, setHfError] = useState<string | null>(null);

  const handleHyperFramesGenerate = async () => {
    if (!hfScript.trim()) {
      setToast({ message: '请输入脚本内容', type: 'error' });
      return;
    }
    setHfGenerating(true);
    setHfError(null);
    setHfVideoUrl(null);
    try {
      const { videoUrl } = await generateHyperFrames({
        script: hfScript.trim(),
        style: hfStyle,
      });
      setHfVideoUrl(videoUrl);
      setToast({ message: '动态图形视频生成完成', type: 'success' });
    } catch (e: any) {
      setHfError(e.message || '生成失败');
      setToast({ message: e.message || '生成失败', type: 'error' });
    } finally {
      setHfGenerating(false);
    }
  };

  const handleHfDownload = () => {
    if (!hfVideoUrl) return;
    const a = document.createElement('a');
    a.href = hfVideoUrl;
    a.download = `hyperframes_${Date.now()}.mp4`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleHfSave = async () => {
    if (!hfVideoUrl) return;
    try {
      const res = await apiClient.post('/inspiration', {
        type: 'video',
        title: (hfScript || '动态图形').substring(0, 40),
        original_text: hfScript,
        media_urls: [hfVideoUrl],
        source_platform: 'ai_hyperframes',
        tags: ['AI生成', '动态图形'],
      });
      if (res.success) {
        setToast({ message: '已保存到作品', type: 'success' });
      } else {
        setToast({ message: res.error || '保存失败', type: 'error' });
      }
    } catch (e) {
      console.error('[Video] 保存动态图形失败:', e);
      setToast({ message: '保存失败', type: 'error' });
    }
  };

  useEffect(() => {
    if (editingSceneIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingSceneIndex]);

  // BGM / 字幕覆盖（初始值来自风格预设，用户可改）
  const [bgmStyle, setBgmStyle] = useState('tech');
  const [subtitleStyle, setSubtitleStyle] = useState('白色粗体');
  const [subtitlePos, setSubtitlePos] = useState('底部');

  // ─── Step 4: 视频生成 ─────────────────────────────────────

  const [currentStep, setCurrentStep] = useState(1);
  const [segments, setSegments] = useState<SegmentState[]>([]);
  const [genPhase, setGenPhase] = useState<'idle' | 'submitting' | 'generating' | 'done' | 'error'>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { generateStoryboard: genStoryboard, submitSegments: submitSegs, mergeVideo: mergeVid, cancelPolling, phase: hookPhase, segments: hookSegs, storyboard: hookStoryboard, mergedVideoUrl: hookMergedVideoUrl, error: hookError, generateFirstFramesBatch, generatingFirstFrames, firstFramesProgress, sceneFrames, setSceneFrames, generateHyperFrames, hyperframesGenerating, hyperframesVideoUrl } = useVideoGeneration();

  // ─── 合并状态(Step 3 完成后用户点"合并") ───────────
  const [mergePhase, setMergePhase] = useState<'idle' | 'merging' | 'done' | 'error'>('idle');
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // ─── 加载灵感数据 ────────────────────────────────────

  useEffect(() => {
    setInspirationsLoading(true);
    apiClient.get<InspirationItem[]>('/inspiration?limit=50')
      .then((res) => { if (res.success) setInspirations(res.data || []); })
      .catch((e) => { console.error('[Video] 灵感加载失败:', e); })
      .finally(() => setInspirationsLoading(false));
  }, []);

  // 做同款回填：从 URL query 接收 prompt
  useEffect(() => {
    const promptFromUrl = searchParams.get('prompt');
    if (promptFromUrl) {
      setTopic(decodeURIComponent(promptFromUrl).slice(0, 300));
    }
  }, [searchParams]);

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
  // Sync hook-managed state to page state
  useEffect(() => {
    if (hookPhase !== 'idle') setGenPhase(hookPhase);
  }, [hookPhase]);
  useEffect(() => {
    if (hookSegs.length > 0) setSegments(hookSegs);
  }, [hookSegs]);
  useEffect(() => {
    if (hookError) setGenError(hookError);
  }, [hookError]);

  // 工作流：从 session.accumulated_handoff 预填
  useEffect(() => {
    if (!session?.accumulated_handoff) return;
    const h = session.accumulated_handoff as Record<string, string>;
    if (h.firstFrame) {
      setFirstFrameUrl(h.firstFrame);
      setFirstFrameTab('url');
    } else if (h.imageUrl) {
      setFirstFrameUrl(h.imageUrl);
      setFirstFrameTab('url');
    }
    if (h.text) setTopic(h.text.slice(0, 300));
    else if (h.topic) setTopic(h.topic);
    if (h.style && stylePresets.some(([k]) => k === h.style)) {
      setStylePreset(h.style);
    }
  }, [session]);

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
      const { storyboard: sb, styleDefaults } = await genStoryboard({
        inspirations: selectedData,
        stylePreset,
        duration,
        topic: topic.trim() || undefined,
        language,
        firstFrameUrl: firstFrameUrl || undefined,
      });
      setStoryboard(sb);
      if (styleDefaults) {
        setBgmStyle(styleDefaults.bgm);
        setSubtitleStyle(styleDefaults.subtitle);
        setSubtitlePos(styleDefaults.subtitlePos);
      }
      setCurrentStep(2);
    } catch (e) {
      console.error('[Video] 分镜生成失败:', e);
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
    // 解析多帧模式(中间关键帧:逗号/换行分隔,取 http 开头,最多 5 张)
    const extraFrameUrls = multiFrameMode
      ? extraFramesText.split(/[,\n]/).map((s) => s.trim()).filter((s) => s.startsWith('http')).slice(0, 5)
      : undefined;
    const lastFrame = multiFrameMode && lastFrameUrl.trim() ? lastFrameUrl.trim() : undefined;

    try {
      // 转换 sceneFrames 为纯 URL 映射
      const sceneFrameUrls: Record<number, string> = {};
      for (const [k, v] of Object.entries(sceneFrames)) {
        if (v?.imageUrl) sceneFrameUrls[Number(k)] = v.imageUrl;
      }

      // submitSegs handles POST + polling internally via the hook
      await submitSegs({
        storyboard,
        inspirations: selectedData,
        qualityTier,
        firstFrameUrl: firstFrameUrl || undefined,
        sceneFrames: sceneFrameUrls,
        lastFrameUrl: lastFrame,
        extraFrameUrls,
        multiFrameMode,
        bgmStyle,
        subtitleStyle,
        subtitlePosition: subtitlePos,
      });
    } catch (e: any) {
      setGenError(e.message || '提交失败');
      setGenPhase('error');
    }
  }, [storyboard, inspirations, selectedInspirations, bgmStyle, subtitleStyle, subtitlePos, qualityTier, multiFrameMode, extraFramesText, lastFrameUrl, firstFrameUrl, sceneFrames, submitSegs]);

  const handleCancel = () => {
    cancelPolling();
    setGenPhase('idle');
    setSegments([]);
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

  const handleNavigate = (page: PageKey) => {
    const routes: Record<string, string> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(routes[page] || '/home');
  };
  // ─── AI 智能字幕:用 LLM 改写分镜字幕为朗朗上口的短句 ──
  const handleAutoSubtitle = async () => {
    if (isAutoSubtitling || storyboard.length === 0) return;
    setIsAutoSubtitling(true);
    try {
      const res = await apiClient.post<{ storyboard: any[]; fallback?: boolean }>('/ai/auto-subtitle', {
        storyboard: storyboard.map((s) => ({
          index: s.index,
          visualPrompt: s.visualPrompt,
          subtitle: s.subtitle,
          duration: s.duration || s.timeEnd - s.timeStart,
        })),
      });
      if (res.success && res.data?.storyboard) {
        setStoryboard((prev) =>
          prev.map((orig) => {
            const updated = (res.data!.storyboard as any[]).find((u) => u.index === orig.index);
            return updated ? { ...orig, subtitle: updated.subtitle } : orig;
          })
        );
        setToast({ message: res.data!.fallback ? 'LLM 不可用,已保留原字幕' : '✨ 字幕已优化', type: 'success' });
      } else {
        setToast({ message: res.error || '优化失败', type: 'error' });
      }
    } catch (e) {
      console.error('[Video] 自动字幕失败:', e);
      setToast({ message: '网络错误', type: 'error' });
    }
    setIsAutoSubtitling(false);
  };

  // ─── 首帧批量生成包装 ──────────────────────────────

  const handleGenerateFrames = async (indices?: number[]) => {
    const targetIndices = indices || storyboard.map((s) => s.index).filter((i) => !sceneFrames[i]);
    if (targetIndices.length === 0) return;
    setGeneratingFrameIndices(new Set(targetIndices));
    try {
      await generateFirstFramesBatch({ storyboard, sceneIndices: indices });
    } catch (e) {
      console.error('[Video] 首帧生成失败:', e);
    } finally {
      setGeneratingFrameIndices(new Set());
    }
  };

  // ─── Step 4 完成后:合并视频 + BGM + 字幕 ───────────
  const handleMerge = async () => {
    if (mergePhase === 'merging') return;
    const succeededSegments = segments.filter((s) => s.status === 'succeeded' && s.videoUrl);
    if (succeededSegments.length === 0) {
      setToast({ message: '没有可合并的成功视频', type: 'error' });
      return;
    }
    setMergePhase('merging');
    setMergeError(null);
    try {
      const videoUrls = succeededSegments.map((s) => s.videoUrl!);
      const { videoUrl } = await mergeVid({
        videoUrls,
        bgmStyle,
        subtitleStyle,
        subtitlePosition: subtitlePos,
        storyboard: storyboard.map((s) => ({
          index: s.index,
          timeStart: s.timeStart,
          timeEnd: s.timeEnd,
          duration: s.duration,
          subtitle: s.subtitle,
        })),
        stylePreset: stylePreset,
        language: language,
        topic: topic,
      });
      setMergedVideoUrl(videoUrl);
      setMergePhase('done');
      setToast({ message: '合并完成', type: 'success' });
      if (isInWorkflow) {
        completeCurrentStep({
          text: topic,
          topic,
          imageUrl: firstFrameUrl || '',
          firstFrame: firstFrameUrl || '',
          style: stylePreset,
        }, undefined);
      }
    } catch (e: any) {
      setMergeError(e?.message || '网络错误');
      setMergePhase('error');
      setToast({ message: '网络错误,合并失败', type: 'error' });
    }
  };

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

  // ─── 阶段步骤渲染 ─────────────────────────────────────

  const renderStep1 = () => (
    <>
      {/* 主题方向 */}
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
          <span style={{ color: '#06B6D4' }}>主题</span> · 方向
        </p>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="例：产品发布、旅行vlog、知识科普..."
          className="w-full px-3 py-2 rounded-xl bg-transparent text-sm outline-none"
          style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
        />
      </GlassCard>

      {/* 素材选择 */}
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#3B82F6' }}>素材</span> · 选材
        </p>

        {/* 上传 / 灵感库 / URL 视频参考 */}
        <div className="mb-3">
          <MediaPicker
            accept="video"
            onSelect={(url) => { setFirstFrameUrl(url); }}
            compact
            tabs={['upload', 'inspiration', 'url']}
            label=""
          />
        </div>

        {/* 文字灵感多选 */}
        <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 6 }}>
          📚 灵感库（多选文字素材）
        </p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {inspirationsLoading ? (
            <p style={{ color: '#9CA3AF', textAlign: 'center', padding: 16 }}>加载中...</p>
          ) : inspirations.length === 0 ? (
            <p style={{ color: '#9CA3AF', textAlign: 'center', padding: 16 }}>暂无灵感，去灵感库添加吧</p>
          ) : (
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
          )}
        </div>
        <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8 }}>
          已选 {selectedInspirations.size} 个素材（最多5个）
        </p>
      </GlassCard>

      {/* 风格预设 */}
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
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
        <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8 }}>
          风格预设会自动匹配 BGM 和字幕样式
        </p>
      </GlassCard>

      {/* 时长选择 */}
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
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
                      className="flex flex-col items-center gap-1 p-2.5 rounded-xl transition-all relative"
                      style={{
                        background: qualityTier === tier.value ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                        border: qualityTier === tier.value ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{tier.icon}</span>
                      {tier.recommended && (
                        <span style={{
                          background: 'linear-gradient(135deg, #F59E0B 0%, #F97316 100%)',
                          color: '#FFFFFF',
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: 4,
                          position: 'absolute',
                          top: -4,
                          right: -4,
                        }}>推荐</span>
                      )}
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
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleAutoSubtitle}
                disabled={isAutoSubtitling}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs"
                style={{
                  background: 'rgba(34,197,94,0.15)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  color: '#86EFAC',
                  opacity: isAutoSubtitling ? 0.6 : 1,
                }}
                title="AI 改写每段字幕为朗朗上口的短句"
              >
                <Wand2 size={11} /> {isAutoSubtitling ? '优化中...' : 'AI 字幕'}
              </button>
            </div>
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

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <PrimaryButton variant="ghost" size="md" onClick={() => setCurrentStep(1)}>
          <ChevronLeft size={16} /> 上一步
        </PrimaryButton>
        <PrimaryButton fullWidth size="md" onClick={() => setCurrentStep(3)}>
          <Zap size={16} /> 下一步：生成视频
        </PrimaryButton>
      </div>
    </>
  );

  const renderStep3 = () => (
    <GlassCard>
      {genPhase === 'idle' ? (
        (() => {
          // 计算预估灵力消耗
          const qt = QUALITY_TIERS[qualityTier] || QUALITY_TIERS['fast'];
          const segMax = qt.t2v.maxDuration || 10;
          const videoCost = storyboard.reduce((sum, scene) => {
            const d = Math.min(Math.max(scene.duration, 3), segMax);
            return sum + calcAiVideoCost(d, qualityTier as 'fast' | 'standard' | 'premium');
          }, 0);
          const mergeCost = CREDIT_COSTS.ai_video_post.merge;
          const frameCount = Object.keys(sceneFrames).length;
          const framesAlreadyPaid = frameCount * CREDIT_COSTS.ai_image.perImage;
          const upcomingCost = videoCost + mergeCost;
          const totalCost = upcomingCost + framesAlreadyPaid + CREDIT_COSTS.ai_video_post.storyboard;
          return (
        <>
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
              {(framesAlreadyPaid > 0 || true) && (
                <div className="flex justify-between items-center mt-1">
                  <span style={{ color: '#6B7280', fontSize: 10 }}>
                    已扣：分镜 {CREDIT_COSTS.ai_video_post.storyboard}{frameCount > 0 ? ` + 首帧 ${framesAlreadyPaid}` : ''}
                  </span>
                  <span style={{ color: '#6B7280', fontSize: 10 }}>
                    本视频合计 ≈{totalCost} 灵力
                  </span>
                </div>
              )}
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
            <PrimaryButton fullWidth size="lg" onClick={submitGenerate}>
              <Zap size={16} /> 开始生成 · {upcomingCost} 灵力
            </PrimaryButton>
          </div>
        </>
          );
        })()
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
                onClick={handleMerge}
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
                  <button onClick={() => handoff('/publish', { text: topic || '我的视频', topic: topic || '我的视频' })}
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
                  handoff('/ai/digital-human', { firstFrame, topic: nextTopic });
                }}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl"
                style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)' }}
              >
                <Mic size={16} color="#06B6D4" />
                <span style={{ color: '#06B6D4', fontSize: 11, fontWeight: 600 }}>做数字人</span>
              </button>
              <button
                onClick={() => {
                  const firstFrame = segments.find((s) => s.videoUrl)?.videoUrl || '';
                  const nextTopic = storyboard[0]?.subtitle || topic || '我的视频';
                  handoff('/ai/ads', { firstFrame, topic: nextTopic });
                }}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}
              >
                <Grid3x3 size={16} color="#F59E0B" />
                <span style={{ color: '#F59E0B', fontSize: 11, fontWeight: 600 }}>做 9 宫格</span>
              </button>
              <button
                onClick={() => {
                  const nextTopic = storyboard[0]?.subtitle || topic || '我的视频';
                  handoff('/publish', { text: nextTopic, topic: nextTopic });
                }}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl"
                style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)' }}
              >
                <Share2 size={16} color="#F43F5E" />
                <span style={{ color: '#F43F5E', fontSize: 11, fontWeight: 600 }}>多平台分发</span>
              </button>
            </div>
          </div>
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

      {isInWorkflow && session && (
        <WorkflowSessionBar session={session} onPause={pauseSession} onResume={resumeSession} onAbandon={abandonSession} />
      )}

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* 步骤指示器 */}
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
        {(currentStep === 3 || isGenActive || genPhase === 'done') && renderStep3()}
      </div>

      {/* 历史生成 */}
      {!historyLoading && historyItems.length > 0 && (
        <div className="px-4 pb-20">
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>历史生成</p>
          <div className="grid grid-cols-2 gap-2">
            {historyItems.map((item) => (
              <div
                key={item.id}
                className="relative rounded-xl overflow-hidden cursor-pointer transition-all"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  aspectRatio: '16/9',
                }}
                onClick={() => {
                  if (item.videoUrl) window.open(item.videoUrl, '_blank');
                  if (item.prompt) setTopic(item.prompt);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                {item.videoUrl ? (
                  <video src={item.videoUrl} className="w-full h-full object-cover" preload="metadata" />
                ) : item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span style={{ fontSize: 32 }}>🎬</span>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
                  <p style={{ color: '#E5E7EB', fontSize: 11 }} className="truncate">{item.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 动态图形 · HyperFrames Beta（独立功能） */}
      <div className="px-4 mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <p style={{ color: '#9CA3AF', fontSize: 10, marginBottom: 12, textAlign: 'center', letterSpacing: 2 }}>
          ── 独立功能 ──
        </p>
        <div className="p-4 rounded-2xl" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
            <span style={{ color: '#A78BFA' }}>动态图形</span> · 文字动画视频
            <span style={{
              background: 'rgba(168,85,247,0.2)', color: '#C4B5FD', fontSize: 9, fontWeight: 700,
              padding: '2px 6px', borderRadius: 6, marginLeft: 8, verticalAlign: 'middle',
            }}>Beta</span>
          </p>
          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 10, lineHeight: 1.5 }}>
            输入脚本，AI 自动生成 HTML+GSAP 动画并渲染为竖屏视频。适合产品介绍、社交媒体、知识讲解。
          </p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {([
              { key: 'product' as const, label: '产品展示', icon: '✨' },
              { key: 'social' as const, label: '社交媒体', icon: '🔥' },
              { key: 'slide' as const, label: '知识讲解', icon: '📚' },
            ]).map(({ key, label, icon }) => (
              <button key={key} onClick={() => setHfStyle(key)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all"
                style={{ background: hfStyle === key ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)', border: hfStyle === key ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                <span style={{ color: hfStyle === key ? '#C4B5FD' : '#E5E7EB', fontSize: 10, fontWeight: 600 }}>{label}</span>
              </button>
            ))}
          </div>
          <textarea value={hfScript} onChange={(e) => setHfScript(e.target.value)}
            placeholder={'输入脚本内容...\nAI 会自动拆分为分镜并生成动画'}
            rows={3}
            className="w-full px-3 py-2 rounded-xl bg-transparent text-xs outline-none resize-none mb-2"
            style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
          {!hfVideoUrl ? (
            <button onClick={handleHyperFramesGenerate} disabled={hfGenerating || !hfScript.trim()}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ background: hfGenerating ? 'rgba(168,85,247,0.3)' : 'linear-gradient(135deg, #8B5CF6, #A855F7)', color: '#FFFFFF', opacity: (!hfScript.trim() || hfGenerating) ? 0.6 : 1 }}>
              {hfGenerating ? <><Loader2 size={14} className="animate-spin" /> 渲染中...</> : <><Wand2 size={14} /> 生成动态图形 · {CREDIT_COSTS.ai_hyperframes.perVideo} 灵力</>}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <CheckCircle2 size={14} color="#22C55E" /><span style={{ color: '#86EFAC', fontSize: 12 }}>生成完成</span>
              </div>
              <video src={hfVideoUrl} controls playsInline className="w-full rounded-xl" style={{ background: '#000', maxHeight: 240 }} />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleHfDownload} className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs"
                  style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93C5FD' }}>
                  <Download size={12} /> 下载</button>
                <button onClick={handleHfSave} className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#86EFAC' }}>
                  <FolderOpen size={12} /> 保存作品</button>
              </div>
            </div>
          )}
          {hfError && (
            <div className="flex items-center gap-2 mt-2 p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <XCircle size={12} color="#EF4444" /><span style={{ color: '#FCA5A5', fontSize: 11 }}>{hfError}</span>
            </div>
          )}
        </div>
      </div>

      
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
