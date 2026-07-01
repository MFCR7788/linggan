'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopNav } from '@/components/TopNav';
import { ProtectedRoute } from '@/components';
import { Toast } from '@/components/Toast';
import { STYLE_PRESETS } from '@/lib/style-constants';
import { useContentHandoff } from '@/hooks/use-content-handoff';
import { useWorkflowSession } from '@/hooks/use-workflow-session';
import { useVideoGeneration } from '@/hooks/ai/use-video-generation';
import { useWorkHistory } from '@/hooks/use-work-history';
import { WorkflowSessionBar } from '@/components/WorkflowSessionBar';
import { apiClient } from '@/lib/api-client';

import { VideoPromptPanel } from '@/components/ai/video/VideoPromptPanel';
import { VideoParamsPanel } from '@/components/ai/video/VideoParamsPanel';
import { VideoResultPanel } from '@/components/ai/video/VideoResultPanel';
import { VideoHistoryPanel } from '@/components/ai/video/VideoHistoryPanel';
import { VideoHyperFramesPanel } from '@/components/ai/video/VideoHyperFramesPanel';

import type { InspirationItem, StoryboardScene, SegmentState } from '@/components/ai/video/types';

const STEPS = ['创作方向', '分镜脚本', '生成成片'];

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
  // ─── 多首尾帧模式 ──
  const [multiFrameMode, setMultiFrameMode] = useState(false);
  const [lastFrameUrl, setLastFrameUrl] = useState('');
  const [extraFramesText, setExtraFramesText] = useState('');

  // ─── Step 2: 分镜预览 & 微调 ─────────────────────────

  const [storyboard, setStoryboard] = useState<StoryboardScene[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // ─── Step 3: 首帧生成 ─────────────────────────────────
  const [generatingFrameIndices, setGeneratingFrameIndices] = useState<Set<number>>(new Set());

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
  const { generateStoryboard: genStoryboard, submitSegments: submitSegs, mergeVideo: mergeVid, cancelPolling, phase: hookPhase, segments: hookSegs, error: hookError, generateFirstFramesBatch, generatingFirstFrames, firstFramesProgress, sceneFrames, setSceneFrames, generateHyperFrames } = useVideoGeneration();

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
    } else if (params.imageUrl) {
      setFirstFrameUrl(params.imageUrl);
    }
    if (params.prompt || params.text) {
      setTopic((params.prompt || params.text || '').slice(0, 300));
    } else if (params.topic) {
      setTopic(params.topic);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意省略依赖
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
    } else if (h.imageUrl) {
      setFirstFrameUrl(h.imageUrl);
    }
    if (h.text) setTopic(h.text.slice(0, 300));
    else if (h.topic) setTopic(h.topic);
    if (h.style && Object.keys(STYLE_PRESETS).includes(h.style)) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意省略依赖
  }, [stylePreset]);

  // ─── 操作函数 ────────────────────────────────────────

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

        {/* Step 1: 风格/时长/高级设置 */}
        {currentStep === 1 && (
          <VideoParamsPanel
            stylePreset={stylePreset}
            setStylePreset={setStylePreset}
            duration={duration}
            setDuration={setDuration}
            qualityTier={qualityTier}
            setQualityTier={setQualityTier}
            language={language}
            setLanguage={setLanguage}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
          />
        )}

        {/* Step 1-2: 提示词输入 + 分镜预览 */}
        {(currentStep === 1 || currentStep === 2) && (
          <VideoPromptPanel
            topic={topic}
            setTopic={setTopic}
            inspirations={inspirations}
            inspirationsLoading={inspirationsLoading}
            selectedInspirations={selectedInspirations}
            setSelectedInspirations={setSelectedInspirations}
            firstFrameUrl={firstFrameUrl}
            setFirstFrameUrl={setFirstFrameUrl}
            storyboard={storyboard}
            setStoryboard={setStoryboard}
            isGenerating={isGenerating}
            duration={duration}
            currentStep={currentStep}
            setCurrentStep={setCurrentStep}
            setToast={setToast}
            onGenerate={handleGenerateStoryboardV2}
          />
        )}

        {/* Step 3: 确认参数 + 生成视频 + 结果展示 */}
        {(currentStep === 3 || isGenActive || genPhase === 'done') && (
          <VideoResultPanel
            genPhase={genPhase}
            setGenPhase={setGenPhase}
            genError={genError}
            segments={segments}
            setSegments={setSegments}
            storyboard={storyboard}
            mergePhase={mergePhase}
            setMergePhase={setMergePhase}
            mergedVideoUrl={mergedVideoUrl}
            setMergedVideoUrl={setMergedVideoUrl}
            mergeError={mergeError}
            setMergeError={setMergeError}
            sceneFrames={sceneFrames}
            qualityTier={qualityTier}
            stylePreset={stylePreset}
            duration={duration}
            topic={topic}
            selectedInspirations={selectedInspirations}
            inspirations={inspirations}
            bgmStyle={bgmStyle}
            setBgmStyle={setBgmStyle}
            subtitleStyle={subtitleStyle}
            setSubtitleStyle={setSubtitleStyle}
            subtitlePos={subtitlePos}
            setSubtitlePos={setSubtitlePos}
            firstFrameUrl={firstFrameUrl}
            setFirstFrameUrl={setFirstFrameUrl}
            multiFrameMode={multiFrameMode}
            lastFrameUrl={lastFrameUrl}
            extraFramesText={extraFramesText}
            generatingFrameIndices={generatingFrameIndices}
            generatingFirstFrames={generatingFirstFrames}
            firstFramesProgress={firstFramesProgress}
            currentStep={currentStep}
            setCurrentStep={setCurrentStep}
            setToast={setToast}
            onStartGenerate={submitGenerate}
            onCancel={handleCancel}
            onMerge={handleMerge}
            onGenerateFrames={handleGenerateFrames}
            onHandoff={handoff}
          />
        )}
      </div>

      {/* 历史生成 */}
      <VideoHistoryPanel
        items={historyItems}
        isLoading={historyLoading}
        onSelect={(item) => {
          if (item.videoUrl) window.open(item.videoUrl, '_blank');
          if (item.prompt) setTopic(item.prompt);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* 动态图形 · HyperFrames Beta（独立功能） */}
      <VideoHyperFramesPanel
        generateHyperFrames={generateHyperFrames}
        setToast={setToast}
      />

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
