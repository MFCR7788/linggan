'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Wand2, Loader2, RefreshCw, ChevronLeft, Zap } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { MediaPicker } from '@/components/MediaPicker';
import { PrimaryButton } from '@/components/PrimaryButton';
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

const typeEmojis: Record<string, string> = {
  text: '✨', link: '🔗', image: '🖼️', video: '🎬', voice: '🎵', audio: '🎵', schedule: '📅',
};

export interface VideoPromptPanelProps {
  // Step 1
  topic: string;
  setTopic: (v: string) => void;
  inspirations: InspirationItem[];
  inspirationsLoading: boolean;
  selectedInspirations: Set<string | number>;
  setSelectedInspirations: (v: Set<string | number>) => void;
  firstFrameUrl: string | null;
  setFirstFrameUrl: (url: string | null) => void;

  // Step 2
  storyboard: StoryboardScene[];
  setStoryboard: (v: StoryboardScene[]) => void;
  isGenerating: boolean;
  duration: number;

  // Navigation
  currentStep: number;
  setCurrentStep: (v: number) => void;
  setToast: (toast: { message: string; type: 'success' | 'error' } | null) => void;

  // Callbacks
  onGenerate: () => void;
}

export function VideoPromptPanel({
  topic,
  setTopic,
  inspirations,
  inspirationsLoading,
  selectedInspirations,
  setSelectedInspirations,
  firstFrameUrl,
  setFirstFrameUrl,
  storyboard,
  setStoryboard,
  isGenerating,
  duration,
  currentStep,
  setCurrentStep,
  setToast,
  onGenerate,
}: VideoPromptPanelProps) {
  const [isAutoSubtitling, setIsAutoSubtitling] = useState(false);
  const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingSceneIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingSceneIndex]);

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

  const updateScene = (index: number, field: 'visualPrompt' | 'subtitle', value: string) => {
    setStoryboard(
      storyboard.map((s) => (s.index === index ? { ...s, [field]: value } : s))
    );
  };

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
        setStoryboard(
          storyboard.map((orig) => {
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

  // ─── Step 1: 确定方向 ──────────────────────────────────

  if (currentStep === 1) {
    return (
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

        {/* 生成按钮 */}
        <PrimaryButton fullWidth size="lg" onClick={onGenerate} disabled={isGenerating || selectedInspirations.size === 0}>
          <Sparkles size={16} /> {isGenerating ? '生成中...' : 'AI 生成分镜'}
        </PrimaryButton>
      </>
    );
  }

  // ─── Step 2: 分镜预览 & 微调 ─────────────────────────

  return (
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
              onClick={onGenerate}
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
}
