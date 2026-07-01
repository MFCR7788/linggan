'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Sparkles, Download, RefreshCw, Upload, FolderOpen, Wand2, ImageIcon, Check } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { findImagePreset } from '@/lib/preset-templates';
import { useWorkHistory } from '@/hooks/use-work-history';
import { useImageGeneration } from '@/hooks/ai/use-image-generation';
import type { StepWidgetProps } from '../StepWidgetRegistry';

const PRESETS: { id: string; label: string; prompt: string }[] = [
  { id: 'product', label: '产品图', prompt: '电商产品图，干净背景，专业布光，高清摄影' },
  { id: 'poster', label: '海报', prompt: '宣传海报，设计感，视觉冲击力强' },
  { id: 'social', label: '社交媒体封面', prompt: '社交媒体封面图，吸引点击' },
  { id: 'logo', label: 'Logo', prompt: '极简Logo设计' },
];

type SourceMode = 'ai' | 'upload' | 'library';

interface InspItem {
  id: string | number;
  title: string;
  type?: string;
  thumbnail_url?: string;
  media_urls?: string[];
  imageUrl?: string;
}

export function ImageStepWidget({ handoff, onComplete, isCompleting, autoExecute, onAutoError, role }: StepWidgetProps) {
  const [mode, setMode] = useState<SourceMode>('ai');
  const [prompt, setPrompt] = useState(handoff.prompt || handoff.text || '');
  const [preset, setPreset] = useState(handoff.preset || 'product');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSource, setResultSource] = useState<string>(''); // label describing source
  const { refinePrompt, generate: generateImage, refining, generating, error, setError } = useImageGeneration();

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  // Library state
  const [libItems, setLibItems] = useState<InspItem[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libSelected, setLibSelected] = useState<string | null>(null);

  const autoTriggeredRef = useRef(false);
  const { items: historyItems, isLoading: historyLoading } = useWorkHistory('图片');

  useEffect(() => { if (!autoExecute) { autoTriggeredRef.current = false; } }, [autoExecute]);

  // Load library items when switching to library mode
  useEffect(() => {
    if (mode !== 'library' || libItems.length > 0) return;
    setLibLoading(true);
    apiClient.get<InspItem[]>('/inspiration?limit=20&type=image&sortOrder=desc')
      .then((res) => {
        if (res.success) setLibItems(res.data || []);
      })
      .catch(() => {})
      .finally(() => setLibLoading(false));
  }, [mode, libItems.length]);

  // ─── Smart Refine ───────────────────────────────
  const handleRefine = async () => {
    const sourceText = prompt || handoff.text || handoff.prompt || '';
    if (!sourceText.trim()) return;
    try {
      const imgPreset = findImagePreset(preset);
      const refined = await refinePrompt({
        userInput: role ? `${role}\n${sourceText.trim()}` : sourceText.trim(),
        presetId: preset,
        style: handoff.style || '',
        ratio: imgPreset?.ratio,
      });
      if (refined) setPrompt(refined);
    } catch {}
  };

  // ─── AI Generate ────────────────────────────────
  const generatePrompt = preset ? PRESETS.find((p) => p.id === preset)?.prompt || prompt : prompt;

  const handleGenerate = async () => {
    const finalPrompt = prompt || generatePrompt;
    if (!finalPrompt.trim()) return;
    try {
      const imgPreset = findImagePreset(preset);
      const { imageUrl } = await generateImage({
        prompt: role ? `${role}\n请根据以下描述生成图片：${finalPrompt.trim()}` : finalPrompt.trim(),
        presetId: preset,
        style: handoff.style || '',
        ratio: imgPreset?.ratio || '1:1',
        n: 1,
      });
      if (imageUrl) {
        setResultUrl(imageUrl);
        setResultSource('AI 生成');
      }
    } catch {}
  };

  // ─── Upload ─────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/inspiration', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        const url = data.data?.media_urls?.[0] || data.data?.thumbnail_url || data.data?.url;
        if (url) {
          setResultUrl(url);
          setResultSource('本地上传');
          setUploadPreview(url);
        }
      } else {
        setError(data.error || '上传失败');
      }
    } catch (e: any) {
      setError(e.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  // ─── Library Select ─────────────────────────────
  const handleLibrarySelect = (item: InspItem) => {
    const url = item.media_urls?.[0] || item.thumbnail_url || item.imageUrl || '';
    if (!url) return;
    setLibSelected(item.id as string);
    setResultUrl(url);
    setResultSource('灵感库');
  };

  // ─── Confirm & Pass to Next Step ────────────────
  const handleComplete = async () => {
    if (!resultUrl) return;
    await onComplete({
      handoffData: {
        prompt: prompt || generatePrompt,
        imageUrl: resultUrl,
        topic: handoff.topic || '',
        style: handoff.style || '',
      },
    });
  };

  // ─── Auto-Execute ───────────────────────────────
  useEffect(() => {
    if (!autoExecute || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    async function autoRun() {
      const existingImg = handoff.imageUrl || '';
      const input = (handoff.prompt || handoff.text || '').trim();
      // If there's already an image from previous step, pass it through
      if (existingImg && !input) {
        setResultUrl(existingImg);
        setResultSource('上一步传来');
        await onComplete({
          handoffData: { prompt: input, imageUrl: existingImg, topic: handoff.topic || '', style: handoff.style || '' },
        });
        return;
      }
      if (!input) { onAutoError?.('缺少图片描述，无法自动生成图片'); return; }
      try {
        // Step 1: Refine prompt
        const imgPreset = findImagePreset(preset);
        let finalPrompt = input;
        try {
          const refined = await refinePrompt({
            userInput: role ? `${role}\n${input}` : input,
            presetId: preset,
            style: handoff.style || '',
            ratio: imgPreset?.ratio,
          });
          if (refined) finalPrompt = refined;
        } catch { /* use raw input as fallback */ }

        // Step 2: Generate image
        const { imageUrl } = await generateImage({
          prompt: role ? `${role}\n请根据以下描述生成图片：${finalPrompt}` : finalPrompt,
          presetId: preset,
          style: handoff.style || '',
          ratio: imgPreset?.ratio || '1:1',
          n: 1,
        });
        await onComplete({
          handoffData: { prompt: finalPrompt, imageUrl: imageUrl || '', topic: handoff.topic || '', style: handoff.style || '' },
        });
      } catch (e: any) {
        onAutoError?.(e.message || '图片生成失败');
      }
    }
    autoRun();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意省略依赖
  }, [autoExecute, handoff.prompt, handoff.text, handoff.style, handoff.topic, handoff.imageUrl, preset, onComplete, onAutoError]);

  // ─── Render ─────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div className="flex rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
        {([
          { id: 'ai' as const, label: 'AI 生图', icon: <Sparkles size={12} /> },
          { id: 'upload' as const, label: '本地上传', icon: <Upload size={12} /> },
          { id: 'library' as const, label: '灵感库', icon: <FolderOpen size={12} /> },
        ]).map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1"
            style={{
              background: mode === id ? 'rgba(139,92,246,0.2)' : 'transparent',
              color: mode === id ? '#A78BFA' : '#6B7280',
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── AI 生图 Mode ── */}
      {mode === 'ai' && (
        <>
          {/* Smart refine button — show when there's upstream text */}
          {(handoff.text || handoff.prompt || prompt) && (
            <button
              onClick={handleRefine}
              disabled={refining}
              className="w-full py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium transition-all"
              style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.15))',
                border: '1px solid rgba(139,92,246,0.3)',
                color: '#C4B5FD',
              }}
            >
              {refining ? (
                <><Loader2 size={12} className="animate-spin" /> 提炼中...</>
              ) : (
                <><Wand2 size={12} /> 智能提炼：把上一步内容总结为生图 prompt</>
              )}
            </button>
          )}

          {/* Presets */}
          <div className="flex gap-1.5 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => { setPreset(p.id); if (!prompt) setPrompt(p.prompt); }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
                style={{
                  background: preset === p.id ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                  border: preset === p.id ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  color: preset === p.id ? '#A78BFA' : '#9CA3AF',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Prompt input */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想生成的图片..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
          />

          {!resultUrl ? (
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || generating || isCompleting}
              className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
              style={{
                background: prompt.trim() ? 'linear-gradient(135deg, #8B5CF6, #A78BFA)' : 'rgba(255,255,255,0.06)',
                color: prompt.trim() ? '#FFFFFF' : '#4B5563',
              }}
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {generating ? '生成中...' : '生成图片'}
            </button>
          ) : null}
        </>
      )}

      {/* ── 本地上传 Mode ── */}
      {mode === 'upload' && (
        <div className="space-y-3">
          <label
            className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl cursor-pointer transition-all"
            style={{
              background: uploadPreview ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.03)',
              border: uploadPreview ? '1px solid rgba(34,197,94,0.2)' : '1px dashed rgba(255,255,255,0.15)',
            }}
          >
            {uploading ? (
              <><Loader2 size={20} className="animate-spin" color="#9CA3AF" /><span style={{ color: '#9CA3AF', fontSize: 11 }}>上传中...</span></>
            ) : uploadPreview ? (
              <div className="w-full px-3">
                <img src={uploadPreview} alt="Preview" className="w-full rounded-lg object-contain" style={{ maxHeight: 160, background: 'rgba(0,0,0,0.3)' }} />
                <p style={{ color: '#86EFAC', fontSize: 10, textAlign: 'center', marginTop: 6 }}>点击重新选择</p>
              </div>
            ) : (
              <><Upload size={20} color="#6B7280" /><span style={{ color: '#6B7280', fontSize: 11 }}>点击或拖拽上传图片</span></>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
          {uploadPreview && (
            <button
              onClick={handleComplete}
              disabled={isCompleting}
              className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF' }}
            >
              {isCompleting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              确认使用，进入下一步
            </button>
          )}
        </div>
      )}

      {/* ── 灵感库 Mode ── */}
      {mode === 'library' && (
        <div className="space-y-3">
          {libLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin" color="#6B7280" />
            </div>
          ) : libItems.length === 0 ? (
            <p style={{ color: '#6B7280', fontSize: 11, textAlign: 'center', padding: 16 }}>暂无图片素材</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
              {libItems.map((item) => {
                const url = item.media_urls?.[0] || item.thumbnail_url || item.imageUrl || '';
                const isSelected = libSelected === (item.id as string);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleLibrarySelect(item)}
                    className="relative rounded-lg overflow-hidden transition-all"
                    style={{
                      aspectRatio: '1',
                      background: 'rgba(0,0,0,0.3)',
                      border: isSelected ? '2px solid #8B5CF6' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {url ? (
                      <img src={url} alt={item.title || ''} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={20} color="#6B7280" />
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.3)' }}>
                        <Check size={16} color="#FFFFFF" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {libSelected && (
            <button
              onClick={handleComplete}
              disabled={isCompleting}
              className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF' }}
            >
              {isCompleting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              确认使用，进入下一步
            </button>
          )}
        </div>
      )}

      {/* ── Result (AI mode) ── */}
      {mode === 'ai' && resultUrl && (
        <div className="space-y-2">
          <div className="rounded-lg overflow-hidden" style={{ aspectRatio: '1', background: 'rgba(0,0,0,0.3)' }}>
            <img src={resultUrl} alt="Generated" className="w-full h-full object-contain" />
          </div>
          <p style={{ color: '#6B7280', fontSize: 10, textAlign: 'center' }}>来源：{resultSource}</p>
          <div className="flex gap-2">
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
            >
              <Download size={12} /> 下载
            </a>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
            >
              <RefreshCw size={12} /> 重新生成
            </button>
            <button
              onClick={handleComplete}
              disabled={isCompleting}
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-semibold"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF' }}
            >
              {isCompleting ? <Loader2 size={12} className="animate-spin" /> : '确认使用'}
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ color: '#FCA5A5', fontSize: 11 }}>{error}</p>}

      {/* 历史生成 */}
      {!historyLoading && historyItems.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 8 }}>历史生成</p>
          <div className="grid grid-cols-3 gap-1.5">
            {historyItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.imageUrl) {
                    setResultUrl(item.imageUrl);
                    setResultSource('历史记录');
                    setPrompt(item.title);
                  }
                }}
                className="rounded-lg overflow-hidden transition-all hover:opacity-80"
                style={{ aspectRatio: '1', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon size={16} color="#6B7280" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
