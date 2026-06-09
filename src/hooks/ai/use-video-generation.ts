'use client';

import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────

export interface StoryboardScene {
  index: number;
  timeStart: number;
  timeEnd: number;
  duration: number;
  visualPrompt: string;
  subtitle: string;
  transition: string;
}

export interface SegmentState {
  index: number;
  taskId: string | null;
  model: string;
  provider?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'error' | 'skipped';
  duration: number;
  materialType: 'text' | 'image';
  videoUrl?: string;
}

export interface StoryboardParams {
  inspirations: { id: string | number; title: string; type?: string; original_text?: string; ai_summary?: string; media_urls?: string[] }[];
  stylePreset: string;
  duration: number;
  topic?: string;
  language?: string;
  firstFrameUrl?: string;
}

export interface SubmitSegmentsParams {
  storyboard: StoryboardScene[];
  inspirations: { id: string | number; title: string; type?: string; original_text?: string; ai_summary?: string }[];
  qualityTier: string;
  firstFrameUrl?: string;
  sceneFrames?: Record<number, string>;
  lastFrameUrl?: string;
  extraFrameUrls?: string[];
  multiFrameMode?: boolean;
  bgmStyle?: string;
  subtitleStyle?: string;
  subtitlePosition?: string;
}

export interface OneClickParams {
  inspirations: { id: string | number; title: string; type?: string; original_text?: string; ai_summary?: string; media_urls?: string[] }[];
  topic?: string;
  stylePreset?: string;
  qualityTier?: string;
  language?: string;
}

export interface MergeParams {
  videoUrls: string[];
  bgmStyle: string;
  subtitleStyle: string;
  subtitlePosition: string;
  storyboard: { index: number; timeStart: number; timeEnd: number; duration: number; subtitle: string }[];
  stylePreset: string;
  language: string;
  topic: string;
}

export interface SimpleGenerateParams {
  prompt: string;
  imageUrl?: string;
  style?: string;
  duration?: number;
  voiceStyle?: string;
  bgmStyle?: string;
}

export interface LongGenerateParams {
  script: string;
  topic?: string;
  voiceStyle?: string;
  bgmStyle?: string;
  duration?: number;
}

export interface SimpleGenerateResult {
  videoUrl: string;
}

export function useVideoGeneration() {
  // ─── Simple generate state ─────────────────────────
  const [simpleGenerating, setSimpleGenerating] = useState(false);
  const [simpleProgress, setSimpleProgress] = useState('');
  const [simpleVideoUrl, setSimpleVideoUrl] = useState<string | null>(null);

  // ─── Pipeline state ────────────────────────────────
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [generatingSegments, setGeneratingSegments] = useState(false);
  const [merging, setMerging] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'generating' | 'done' | 'error'>('idle');
  const [storyboard, setStoryboard] = useState<StoryboardScene[]>([]);
  const [segments, setSegments] = useState<SegmentState[]>([]);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── First-frame batch generation ──────────────────
  const [generatingFirstFrames, setGeneratingFirstFrames] = useState(false);
  const [firstFramesProgress, setFirstFramesProgress] = useState('');
  const [sceneFrames, setSceneFrames] = useState<Record<number, { imageUrl: string; prompt: string; size?: string }>>({});

  // ─── HyperFrames generation ─────────────────────────
  const [hyperframesGenerating, setHyperframesGenerating] = useState(false);
  const [hyperframesVideoUrl, setHyperframesVideoUrl] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const segmentsRef = useRef<SegmentState[]>([]);

  const cancelPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // ─── Simple generate (Widget use case) ─────────────
  const simpleGenerate = useCallback(async (params: SimpleGenerateParams): Promise<SimpleGenerateResult> => {
    setSimpleGenerating(true);
    setSimpleVideoUrl(null);
    setSimpleProgress('');
    setError(null);

    try {
      const res = await apiClient.post<{ taskId: string }>('/ai/video', {
        prompt: params.prompt,
        imageUrl: params.imageUrl || '',
        style: params.style || '',
        duration: params.duration || 5,
        voiceStyle: params.voiceStyle || 'professional',
        bgmStyle: params.bgmStyle || 'tech',
      });
      if (!res.success) throw new Error(res.error || '提交失败');

      const taskId = res.data!.taskId;
      let attempts = 0;
      while (attempts < 90) {
        await new Promise((r) => setTimeout(r, 4000));
        const pollRes = await apiClient.get<{ status: string; videoUrl?: string }>(`/ai/video?taskId=${taskId}`);
        if (pollRes.success && pollRes.data) {
          if (pollRes.data.status === 'succeeded' && pollRes.data.videoUrl) {
            setSimpleVideoUrl(pollRes.data.videoUrl);
            return { videoUrl: pollRes.data.videoUrl };
          }
          if (pollRes.data.status === 'failed') throw new Error('视频合成失败');
        }
        attempts++;
        setSimpleProgress(`生成中... ${Math.round((attempts / 90) * 100)}%`);
      }
      throw new Error('生成超时，请稍后重试');
    } catch (e: any) {
      setError(e.message || '生成失败');
      throw e;
    } finally {
      setSimpleGenerating(false);
      setSimpleProgress('');
    }
  }, []);

  // ─── Long video generate (Workflow use case) ─────────
  const generateLongVideo = useCallback(async (params: LongGenerateParams): Promise<SimpleGenerateResult> => {
    setSimpleGenerating(true);
    setSimpleVideoUrl(null);
    setSimpleProgress('正在分析脚本生成分镜...');
    setError(null);

    try {
      // Calculate duration from script length: Chinese ~3 chars/sec, clamped 10-120s
      const cleanText = params.script.replace(/<[^>]*>/g, '').replace(/\s/g, '');
      const textDuration = Math.max(10, Math.min(120, Math.ceil(cleanText.length / 3)));
      const duration = params.duration || textDuration;

      // 1. Call one-click API to generate storyboard + submit segments
      const ocRes = await apiClient.post<{
        storyboard: any[];
        segments: any[];
        taskIds: string;
        providers: string;
      }>('/ai/video/one-click', {
        inspirations: [{
          id: Date.now(),
          title: (params.topic || '产品介绍').substring(0, 40),
          original_text: params.script,
          ai_summary: params.script.substring(0, 200),
        }],
        topic: params.topic || '产品介绍',
        stylePreset: 'product_show',
        qualityTier: 'premium',
        duration,
      });

      if (!ocRes.success) throw new Error(ocRes.error || '分镜生成失败');

      const { storyboard, taskIds, providers } = ocRes.data!;

      // 2. Poll until all segments complete
      let allDone = false;
      let segResults: Record<string, { status: string; videoUrl?: string }> = {};
      let attempts = 0;

      while (!allDone && attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        attempts++;
        setSimpleProgress(`视频片段生成中... ${attempts * 5}s`);

        const pollRes = await apiClient.get<{
          results?: Record<string, { status: string; videoUrl?: string }>;
          progress?: { allDone: boolean };
        }>(`/ai/video/generate?taskIds=${taskIds}&providers=${providers}`);

        if (pollRes.success && pollRes.data) {
          if (pollRes.data.results) segResults = pollRes.data.results;
          if (pollRes.data.progress?.allDone) {
            allDone = true;
          }
        }
      }

      if (!allDone) throw new Error('视频生成超时，请稍后重试');

      // 3. Collect video URLs and merge
      const videoUrls = Object.values(segResults)
        .filter((s: any) => s.status === 'succeeded' && s.videoUrl)
        .map((s: any) => s.videoUrl);

      if (videoUrls.length === 0) throw new Error('没有成功生成的视频片段');

      setSimpleProgress('正在合并视频片段...');

      const mergeRes = await apiClient.post<{ videoUrl: string }>('/ai/video/merge', {
        videoUrls,
        bgmStyle: params.bgmStyle || 'tech',
        subtitleStyle: 'modern',
        subtitlePosition: 'bottom',
        storyboard: (storyboard as any[]).map((s: any) => ({
          index: s.index,
          timeStart: s.timeStart,
          timeEnd: s.timeEnd,
          duration: s.duration,
          subtitle: s.subtitle || '',
        })),
        stylePreset: 'product_show',
        language: 'zh',
        topic: params.topic || '产品介绍',
      });

      if (!mergeRes.success) throw new Error(mergeRes.error || '合并失败');

      setSimpleVideoUrl(mergeRes.data!.videoUrl);
      return { videoUrl: mergeRes.data!.videoUrl };
    } catch (e: any) {
      setError(e.message || '生成失败');
      throw e;
    } finally {
      setSimpleGenerating(false);
      setSimpleProgress('');
    }
  }, []);

  // ─── Storyboard generation ─────────────────────────
  const generateStoryboard = useCallback(async (params: StoryboardParams): Promise<{ storyboard: StoryboardScene[]; styleDefaults?: { bgm: string; subtitle: string; subtitlePos: string } }> => {
    setGeneratingStoryboard(true);
    setError(null);
    try {
      const res = await apiClient.post<{ storyboard: any[]; styleDefaults?: { bgm: string; subtitle: string; subtitlePos: string } }>('/ai/video/storyboard-v2', {
        inspirations: params.inspirations,
        stylePreset: params.stylePreset,
        duration: params.duration,
        topic: params.topic || undefined,
        language: params.language || 'zh',
        firstFrameUrl: params.firstFrameUrl || undefined,
      });
      if (!res.success) throw new Error(res.error || '分镜生成失败');

      const sb: StoryboardScene[] = (res.data!.storyboard as any[]).map((s, i) => ({
        ...s,
        subtitle: s.subtitle?.trim() || s.visualPrompt?.split(/[，。,.\n]/)[0]?.trim()?.slice(0, 30) || `第${i + 1}段`,
      }));
      setStoryboard(sb);
      return { storyboard: sb, styleDefaults: res.data!.styleDefaults };
    } catch (e: any) {
      setError(e.message || '分镜生成失败');
      throw e;
    } finally {
      setGeneratingStoryboard(false);
    }
  }, []);

  // ─── Submit segments for generation ────────────────
  const submitSegments = useCallback(async (params: SubmitSegmentsParams): Promise<void> => {
    setGeneratingSegments(true);
    setPhase('submitting');
    setError(null);
    cancelPolling();

    try {
      const res = await apiClient.post<{ segments: any[] }>('/ai/video/generate', {
        storyboard: params.storyboard,
        inspirations: params.inspirations,
        qualityTier: params.qualityTier,
        firstFrameUrl: params.firstFrameUrl || undefined,
        sceneFrames: params.sceneFrames || undefined,
        lastFrameUrl: params.lastFrameUrl || undefined,
        extraFrameUrls: params.extraFrameUrls || undefined,
        mode: params.multiFrameMode ? 'multi' : 'i2v',
        bgmStyle: params.bgmStyle || '',
        subtitleStyle: params.subtitleStyle || '',
        subtitlePosition: params.subtitlePosition || '',
      });
      if (!res.success) throw new Error(res.error || '提交失败');

      const segs: SegmentState[] = res.data!.segments.map((s: any) => ({
        ...s,
        status: s.taskId ? 'queued' : (s.status === 'error' ? 'failed' : 'skipped'),
      }));
      setSegments(segs);
      segmentsRef.current = segs;

      const validSegs = segs.filter((s) => s.taskId);
      if (validSegs.length === 0) {
        throw new Error(segs[0]?.status === 'skipped' ? '所有片段提交 AI 生成失败，请检查 API Key 或稍后重试' : '未获取到生成任务');
      }

      // Start polling
      setPhase('generating');
      setGeneratingSegments(false);

      const validTaskIds = validSegs.map((s) => s.taskId).join(',');
      const validProviders = validSegs.map((s) => s.provider || 'dashscope').join(',');
      let attempts = 0;

      pollingRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 120) {
          cancelPolling();
          setError('生成超时，请重试');
          setPhase('error');
          return;
        }
        try {
          const pollRes = await apiClient.get<{ results?: Record<string, { status: string; videoUrl?: string }>; progress?: { allDone: boolean } }>(
            `/ai/video/generate?taskIds=${validTaskIds}&providers=${validProviders}`
          );
          if (pollRes.success && pollRes.data) {
            const { results, progress } = pollRes.data;
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
              cancelPolling();
              setPhase('done');
            }
          }
        } catch { /* polling errors are non-fatal */ }
      }, 5000);
    } catch (e: any) {
      setError(e.message || '提交失败');
      setPhase('error');
      setGeneratingSegments(false);
    }
  }, [cancelPolling]);

  // ─── One-click generation ──────────────────────────
  const oneClick = useCallback(async (params: OneClickParams): Promise<{ storyboard: StoryboardScene[]; segments: SegmentState[] }> => {
    setPhase('submitting');
    setError(null);
    cancelPolling();

    try {
      const res = await apiClient.post<{ storyboard: any[]; segments: any[]; taskIds: string; providers: string }>('/ai/video/one-click', {
        inspirations: params.inspirations,
        topic: params.topic || undefined,
        stylePreset: params.stylePreset || 'douyin_hot',
        qualityTier: params.qualityTier || 'fast',
        language: params.language || 'zh',
      });
      if (!res.success) throw new Error(res.error || '一键成片失败');

      const sb: StoryboardScene[] = (res.data!.storyboard as any[]).map((s, i) => ({
        ...s,
        subtitle: s.subtitle?.trim() || s.visualPrompt?.split(/[，。,.\n]/)[0]?.trim()?.slice(0, 30) || `第${i + 1}段`,
      }));
      setStoryboard(sb);

      const segs: SegmentState[] = res.data!.segments.map((s: any) => ({
        ...s,
        status: s.taskId ? 'queued' : 'failed',
      }));
      setSegments(segs);
      segmentsRef.current = segs;

      const validSegs = segs.filter((s) => s.taskId);
      if (validSegs.length === 0) {
        throw new Error('所有片段提交失败');
      }

      setPhase('generating');

      const validTaskIds = validSegs.map((s) => s.taskId).join(',');
      const validProviders = validSegs.map((s) => s.provider || 'dashscope').join(',');
      let attempts = 0;

      pollingRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 120) {
          cancelPolling();
          setError('生成超时，请重试');
          setPhase('error');
          return;
        }
        try {
          const pollRes = await apiClient.get<{ results?: Record<string, { status: string; videoUrl?: string }>; progress?: { allDone: boolean } }>(
            `/ai/video/generate?taskIds=${validTaskIds}&providers=${validProviders}`
          );
          if (pollRes.success && pollRes.data) {
            const { results, progress } = pollRes.data;
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
              cancelPolling();
              setPhase('done');
            }
          }
        } catch { /* polling errors are non-fatal */ }
      }, 5000);

      return { storyboard: sb, segments: segs };
    } catch (e: any) {
      setError(e.message || '一键成片失败');
      setPhase('error');
      throw e;
    }
  }, [cancelPolling]);

  // ─── HyperFrames generation ─────────────────────────
  const generateHyperFrames = useCallback(async (params: {
    script: string;
    topic?: string;
    style?: 'product' | 'social' | 'slide';
    duration?: number;
  }): Promise<{ videoUrl: string }> => {
    setHyperframesGenerating(true);
    setHyperframesVideoUrl(null);
    setError(null);

    try {
      const res = await apiClient.post<{
        videoUrl: string;
        duration: number;
        creditsUsed: number;
      }>('/ai/video/hyperframes', {
        script: params.script,
        topic: params.topic,
        style: params.style || 'product',
        duration: params.duration,
      });

      if (!res.success) throw new Error(res.error || '动态图形生成失败');

      const videoUrl = res.data!.videoUrl;
      setHyperframesVideoUrl(videoUrl);
      return { videoUrl };
    } catch (e: any) {
      setError(e.message || '生成失败');
      throw e;
    } finally {
      setHyperframesGenerating(false);
    }
  }, []);

  // ─── First-frame batch generation ──────────────────
  const generateFirstFramesBatch = useCallback(async (params: {
    storyboard: StoryboardScene[];
    ratio?: string;
    sceneIndices?: number[];
  }): Promise<{
    sceneFrames: Record<number, { imageUrl: string; prompt: string; size?: string }>;
    failed: number[];
  }> => {
    setGeneratingFirstFrames(true);
    setFirstFramesProgress('');
    setError(null);

    try {
      const targetLabel = params.sceneIndices?.length
        ? `${params.sceneIndices.length} 张`
        : `${params.storyboard.length} 张`;
      setFirstFramesProgress(`正在生成首帧 ${targetLabel}...`);

      const res = await apiClient.post<{
        sceneFrames: Record<number, { imageUrl: string; prompt: string; size?: string }>;
        failed: number[];
        creditsUsed: number;
        creditsRefunded: number;
      }>('/ai/video/generate-first-frames', {
        storyboard: params.storyboard,
        ratio: params.ratio || '16:9',
        sceneIndices: params.sceneIndices,
      });

      if (!res.success) throw new Error(res.error || '首帧生成失败');

      const { sceneFrames: newFrames, failed } = res.data!;

      setSceneFrames((prev) => ({ ...prev, ...newFrames }));

      if (failed.length > 0) {
        setFirstFramesProgress(`${Object.keys(newFrames).length} 张成功，${failed.length} 张失败已退点`);
      }

      return { sceneFrames: newFrames, failed };
    } catch (e: any) {
      setError(e.message || '首帧生成失败');
      throw e;
    } finally {
      setGeneratingFirstFrames(false);
      setFirstFramesProgress('');
    }
  }, []);

  // ─── Merge video ───────────────────────────────────
  const mergeVideo = useCallback(async (params: MergeParams): Promise<{ videoUrl: string }> => {
    setMerging(true);
    setError(null);
    try {
      const res = await apiClient.post<{ videoUrl: string }>('/ai/video/merge', {
        videoUrls: params.videoUrls,
        bgmStyle: params.bgmStyle,
        subtitleStyle: params.subtitleStyle,
        subtitlePosition: params.subtitlePosition,
        storyboard: params.storyboard,
        stylePreset: params.stylePreset,
        language: params.language,
        topic: params.topic,
      });
      if (!res.success) throw new Error(res.error || '合并失败');
      setMergedVideoUrl(res.data!.videoUrl);
      return { videoUrl: res.data!.videoUrl };
    } catch (e: any) {
      setError(e.message || '合并失败');
      throw e;
    } finally {
      setMerging(false);
    }
  }, []);

  return {
    // Simple
    simpleGenerate, generateLongVideo, simpleGenerating, simpleProgress, simpleVideoUrl,
    // Pipeline
    generateStoryboard, submitSegments, oneClick, mergeVideo, cancelPolling,
    generatingStoryboard, generatingSegments, merging,
    phase, storyboard, segments, mergedVideoUrl,
    error, setError,
    setPhase, setStoryboard, setSegments, setMergedVideoUrl,
    // First-frame batch
    generateFirstFramesBatch, generatingFirstFrames, firstFramesProgress,
    sceneFrames, setSceneFrames,
    // HyperFrames
    generateHyperFrames, hyperframesGenerating, hyperframesVideoUrl,
  };
}
