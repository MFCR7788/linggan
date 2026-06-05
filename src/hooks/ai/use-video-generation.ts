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
    simpleGenerate, simpleGenerating, simpleProgress, simpleVideoUrl,
    // Pipeline
    generateStoryboard, submitSegments, oneClick, mergeVideo, cancelPolling,
    generatingStoryboard, generatingSegments, merging,
    phase, storyboard, segments, mergedVideoUrl,
    error, setError,
    setPhase, setStoryboard, setSegments, setMergedVideoUrl,
  };
}
