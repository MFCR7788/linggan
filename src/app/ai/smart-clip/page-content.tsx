'use client';
// 智能编辑页面 — 智能剪辑 + 智能切片

import React, { useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TopNav } from '@/components/TopNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ClipTab } from '@/components/SmartClip/ClipTab';
import { SliceTab } from '@/components/SmartClip/SliceTab';
import { SegmentList } from '@/components/SmartClip/SegmentList';
import { SliceList } from '@/components/SmartClip/SliceList';
import { ResultViewer } from '@/components/SmartClip/ResultViewer';
import { ProgressPanel } from '@/components/SmartClip/ProgressPanel';
import type { ClipMode, SliceMode } from '@/components/SmartClip/ModeSelector';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import type { SegmentAnalysis, SlicePoint } from '@/lib/ai/smart-clip-engine';

type Phase = 'input' | 'preview' | 'executing' | 'result';

export default function SmartClipPageContent() {
  const router = useRouter();
  const [direction, setDirection] = useState<'clip' | 'slice'>('clip');

  // 输入
  const [videoUrl, setVideoUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  // 剪辑参数
  const [clipMode, setClipMode] = useState<ClipMode>('auto');
  const [description, setDescription] = useState('');
  const [timeRanges, setTimeRanges] = useState<Array<{ start: number; end: number }>>([]);
  const [silenceThreshold, setSilenceThreshold] = useState(-30);
  const [minSilenceDuration, setMinSilenceDuration] = useState(2.0);
  const [removeFillers, setRemoveFillers] = useState(true);
  const [removeRepetition, setRemoveRepetition] = useState(true);

  // 切片参数
  const [sliceMode, setSliceMode] = useState<SliceMode>('product');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [sliceDuration, setSliceDuration] = useState({ min: 15, max: 60 });

  // 分析结果
  const [taskId, setTaskId] = useState<string | null>(null);
  const [segments, setSegments] = useState<SegmentAnalysis[] | null>(null);
  const [slices, setSlices] = useState<SlicePoint[] | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);

  // 状态
  const [phase, setPhase] = useState<Phase>('input');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [execTaskId, setExecTaskId] = useState<string | null>(null);

  // 结果
  const [clipResult, setClipResult] = useState<{
    videoUrl: string;
    totalDuration: number;
    stats: { segmentCount: number; storageKey: string };
  } | null>(null);
  const [sliceResults, setSliceResults] = useState<
    Array<{ title: string; url: string; duration: number; sizeBytes: number }> | null
  >(null);

  const [error, setError] = useState('');

  // 文件上传到 Supabase Storage
  const handleUpload = useCallback(async (file: File) => {
    if (!file) return;
    setUploading(true);
    setError('');

    try {
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `smart-clip/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage
        .from('lingji-media')
        .upload(fileName, file, {
          contentType: file.type || 'video/mp4',
          upsert: false,
        });

      if (uploadErr) {
        // 如果客户端上传失败，回退到 API 上传
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        const data = await res.json();
        if (!data.success) {
          setError(`上传失败: ${data.error || '请重试'}`);
          return;
        }
        setVideoUrl(data.data.url);
      } else {
        const { data: urlData } = supabase.storage
          .from('lingji-media')
          .getPublicUrl(fileName);
        setVideoUrl(urlData.publicUrl);
      }
    } catch (e) {
      setError(`上传失败: ${e instanceof Error ? e.message : '网络错误'}`);
    } finally {
      setUploading(false);
    }
  }, []);

  // 分析
  const handleAnalyze = useCallback(async () => {
    if (!videoUrl.trim()) return;
    setIsAnalyzing(true);
    setError('');

    try {
      const body: Record<string, unknown> = {
        videoUrl: videoUrl.trim(),
        direction,
      };

      if (direction === 'clip') {
        body.clipMode = clipMode;
        if (clipMode === 'by_description') body.description = description;
        if (clipMode === 'by_time_ranges') body.timeRanges = timeRanges;
        body.silenceThreshold = silenceThreshold;
        body.minSilenceDuration = minSilenceDuration;
        body.removeFillers = removeFillers;
        body.removeRepetition = removeRepetition;
      } else {
        body.sliceMode = sliceMode;
        body.keywords = keywords.filter(Boolean);
        if (sliceMode === 'uniform') body.sliceDuration = sliceDuration;
      }

      const res = await fetch('/api/smart-clip/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || '分析失败');
        return;
      }

      setTaskId(data.data.taskId);
      setVideoDuration(data.data.videoDuration);
      if (direction === 'clip') {
        setSegments(data.data.segments || []);
      } else {
        setSlices(data.data.slices || []);
      }
      setPhase('preview');
    } catch (e) {
      setError(`分析失败: ${e instanceof Error ? e.message : '网络错误'}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [videoUrl, direction, clipMode, description, timeRanges, silenceThreshold,
      minSilenceDuration, removeFillers, removeRepetition, sliceMode, keywords, sliceDuration]);

  // 执行
  const handleExecute = useCallback(async () => {
    if (!taskId) return;
    setIsExecuting(true);
    setError('');
    setExecTaskId(taskId);

    try {
      const body: Record<string, unknown> = {
        taskId,
        postProcess: null,
      };

      if (direction === 'clip' && segments) {
        body.segments = segments.map((s) => ({
          start: s.start,
          end: s.end,
          action: s.recommendation,
        }));
      } else if (direction === 'slice' && slices) {
        body.slices = slices
          .filter((s) => s.enabled)
          .map((s) => ({
            start: s.start,
            end: s.end,
            enabled: s.enabled,
            title: s.title,
          }));
      }

      setPhase('executing');

      const res = await fetch('/api/smart-clip/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.code === 'INSUFFICIENT_CREDITS') {
        setError(`余额不足，需要 ${data.data?.required || 2} 点灵力`);
        setPhase('preview');
        setIsExecuting(false);
        setExecTaskId(null);
        return;
      }

      if (!data.success) {
        setError(data.error || '执行失败');
        setPhase('preview');
        setIsExecuting(false);
        setExecTaskId(null);
        return;
      }
    } catch (e) {
      setError(`执行失败: ${e instanceof Error ? e.message : '网络错误'}`);
      setIsExecuting(false);
      setExecTaskId(null);
      setPhase('preview');
    }
  }, [taskId, direction, segments, slices]);

  // SSE 完成回调
  const handleComplete = useCallback(
    (result: unknown) => {
      setIsExecuting(false);
      setPhase('result');
      const r = result as Record<string, unknown>;
      if (direction === 'clip' && r.videoUrl) {
        setClipResult({
          videoUrl: r.videoUrl as string,
          totalDuration: r.totalDuration as number,
          stats: r.stats as { segmentCount: number; storageKey: string },
        });
      } else if (direction === 'slice' && r.sliceUrls) {
        setSliceResults(r.sliceUrls as Array<{ title: string; url: string; duration: number; sizeBytes: number }>);
      }
    },
    [direction]
  );

  const handleError = useCallback((message: string) => {
    setIsExecuting(false);
    setExecTaskId(null);
    setError(message);
    setPhase('preview');
  }, []);

  // 重置
  const handleReset = useCallback(() => {
    setPhase('input');
    setTaskId(null);
    setSegments(null);
    setSlices(null);
    setClipResult(null);
    setSliceResults(null);
    setError('');
    setIsExecuting(false);
    setExecTaskId(null);
  }, []);

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen bg-[#0A1629]">
        <TopNav
          title="智能编辑"
          showBack
          onBack={() => router.push('/ai')}
        />

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
          {/* 方向切换 */}
          {phase === 'input' && (
            <div
              className="flex rounded-xl p-0.5"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              {(['clip', 'slice'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDirection(d);
                    setError('');
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: direction === d ? 'rgba(59,130,246,0.3)' : 'transparent',
                    color: direction === d ? '#FFFFFF' : '#9CA3AF',
                  }}
                >
                  {d === 'clip' ? '✂️ 智能剪辑' : '🔪 智能切片'}
                </button>
              ))}
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}
            >
              {error}
            </div>
          )}

          {/* 输入阶段 */}
          {phase === 'input' && direction === 'clip' && (
            <ClipTab
              videoUrl={videoUrl}
              setVideoUrl={setVideoUrl}
              clipMode={clipMode}
              onClipModeChange={setClipMode}
              description={description}
              setDescription={setDescription}
              timeRanges={timeRanges}
              setTimeRanges={setTimeRanges}
              silenceThreshold={silenceThreshold}
              setSilenceThreshold={setSilenceThreshold}
              minSilenceDuration={minSilenceDuration}
              setMinSilenceDuration={setMinSilenceDuration}
              removeFillers={removeFillers}
              setRemoveFillers={setRemoveFillers}
              removeRepetition={removeRepetition}
              setRemoveRepetition={setRemoveRepetition}
              onAnalyze={handleAnalyze}
              isAnalyzing={isAnalyzing}
              uploading={uploading}
              onUpload={handleUpload}
            />
          )}

          {phase === 'input' && direction === 'slice' && (
            <SliceTab
              videoUrl={videoUrl}
              setVideoUrl={setVideoUrl}
              sliceMode={sliceMode}
              onSliceModeChange={setSliceMode}
              keywords={keywords}
              setKeywords={setKeywords}
              sliceDuration={sliceDuration}
              setSliceDuration={setSliceDuration}
              onAnalyze={handleAnalyze}
              isAnalyzing={isAnalyzing}
              uploading={uploading}
              onUpload={handleUpload}
            />
          )}

          {/* 预览阶段 */}
          {phase === 'preview' && (
            <div className="space-y-4">
              {/* 分析结果统计 */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium" style={{ color: '#E5E7EB' }}>
                  {direction === 'clip' ? '剪辑预览' : '切片预览'}
                </h3>
                <span className="text-xs" style={{ color: '#9CA3AF' }}>
                  视频时长: {Math.floor(videoDuration / 60)}分{Math.floor(videoDuration % 60)}秒
                </span>
              </div>

              {direction === 'clip' && segments && (
                <SegmentList segments={segments} onChange={setSegments} />
              )}

              {direction === 'slice' && slices && (
                <SliceList slices={slices} onChange={setSlices} />
              )}

              <div className="flex gap-2">
                <PrimaryButton
                  variant="ghost"
                  onClick={handleReset}
                  style={{ flex: 1 }}
                >
                  重新分析
                </PrimaryButton>
                <PrimaryButton
                  onClick={handleExecute}
                  loading={isExecuting}
                  disabled={isExecuting}
                  style={{ flex: 2 }}
                >
                  {direction === 'clip' ? '开始剪辑' : '开始切片'}
                </PrimaryButton>
              </div>
            </div>
          )}

          {/* 执行中 */}
          {phase === 'executing' && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium" style={{ color: '#E5E7EB' }}>
                处理中...
              </h3>
              <ProgressPanel
                taskId={execTaskId}
                onComplete={handleComplete}
                onError={handleError}
              />
            </div>
          )}

          {/* 结果 */}
          {phase === 'result' && (
            <ResultViewer
              direction={direction}
              clipResult={clipResult || undefined}
              sliceResults={sliceResults || undefined}
              onReset={handleReset}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
