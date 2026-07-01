'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Zap, ChevronRight, Download, Save, RefreshCw,
  Loader2, XCircle, Wand2,
  Plus, Square, UserCircle2, CheckCircle2,
  Trash2, FolderOpen,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { MediaPicker } from '@/components/MediaPicker';
import { TopNav } from '@/components/TopNav';
import { PageKey } from "@/components/BottomNav";
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProtectedRoute } from '@/components';
import { Toast } from '@/components/Toast';
import { useContentHandoff } from '@/hooks/use-content-handoff';
import { useWorkflowSession } from '@/hooks/use-workflow-session';
import { useWorkHistory } from '@/hooks/use-work-history';
import { WorkflowSessionBar } from '@/components/WorkflowSessionBar';
import { apiClient } from '@/lib/api-client';

import type { DigitalHumanMode, BatchItem, VoiceOption } from '@/components/ai/digital-human/types';
import {
  MODES, RESOLUTION_OPTIONS, BATCH_STATUS_LABELS,
  ANIMATE_PRESET_KEY, type AnimatePreset,
} from '@/components/ai/digital-human/types';
import {
  generateTTS, base64ToUrl, measureAudioDuration,
  submitAndPoll, splitScriptForDigitalHuman, MAX_AUDIO_SECONDS,
} from '@/components/ai/digital-human/digital-human-utils';
import { DigitalHumanScriptPanel } from '@/components/ai/digital-human/DigitalHumanScriptPanel';
import { DigitalHumanVoicePanel } from '@/components/ai/digital-human/DigitalHumanVoicePanel';
import { DigitalHumanImagePanel } from '@/components/ai/digital-human/DigitalHumanImagePanel';
import { DigitalHumanResultPanel } from '@/components/ai/digital-human/DigitalHumanResultPanel';
import { DigitalHumanHistoryPanel } from '@/components/ai/digital-human/DigitalHumanHistoryPanel';
import { DigitalHumanAvatarSection } from '@/components/ai/digital-human/DigitalHumanAvatarSection';

function DigitalHumanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { receive, handoff } = useContentHandoff();
  const workflowSessionId = searchParams.get('workflow_session_id') || undefined;
  const { session, isInWorkflow, completeCurrentStep, pauseSession, resumeSession, abandonSession } = useWorkflowSession(workflowSessionId);

  // ─── 模式 ──────────────────────────────────────
  const [dhMode, setDhMode] = useState<DigitalHumanMode>('s2v');

  // ─── 角色图片 ──────────────────────────────────
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // ─── 脚本/文案 ─────────────────────────────────
  const [s2vScriptSource, setS2vScriptSource] = useState<'ai' | 'manual'>('ai');
  const [aiTopic, setAiTopic] = useState('');
  const [aiStyle, setAiStyle] = useState('oral');
  const [aiLength, setAiLength] = useState(100);
  const [ttsText, setTtsText] = useState('');

  // ─── 音色/TTS ──────────────────────────────────
  const [voice, setVoice] = useState('female_natural');
  const [speed, setSpeed] = useState(1.15);
  const [pitch, setPitch] = useState(1.0);
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [targetLang, setTargetLang] = useState('zh');

  // ─── 生成状态 ──────────────────────────────────
  const [resolution, setResolution] = useState<'480P' | '720P'>('720P');
  const [generatePhase, setGeneratePhase] = useState<'idle' | 'uploading_audio' | 'submitting' | 'generating' | 'done' | 'error'>('idle');
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // ─── 一键成片 ─────────────────────────────────
  const [ocPhase, setOcPhase] = useState<'idle' | 'scripting' | 'tts' | 'uploading' | 'submitting' | 'generating' | 'merging' | 'done' | 'error'>('idle');
  const [ocError, setOcError] = useState<string | null>(null);
  const [ocCurrentSegment, setOcCurrentSegment] = useState(0);
  const [ocTotalSegments, setOcTotalSegments] = useState(0);
  const ocAbortRef = useRef(false);

  // ─── 批量生成 ─────────────────────────────────
  const [s2vBatchMode, setS2vBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchInput, setBatchInput] = useState('');
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const batchAbortRef = useRef(false);

  // ─── Animate 预配置 ───────────────────────────
  const [animatePreset, setAnimatePreset] = useState<AnimatePreset | null>(null);

  // ─── Toast / 历史 ─────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { items: historyItems, isLoading: historyLoading } = useWorkHistory('视频', 'ai_digital_human');

  // ─── 初始化 ───────────────────────────────────
  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);
  useEffect(() => { const stored = localStorage.getItem('lingji_cloned_voice_id'); if (stored) setClonedVoiceId(stored); }, []);
  useEffect(() => { try { const raw = localStorage.getItem(ANIMATE_PRESET_KEY); if (raw) setAnimatePreset(JSON.parse(raw)); } catch {} }, []);

  // 接收 handoff URL 参数
  useEffect(() => {
    const params = receive(['imageUrl', 'audioUrl', 'text', 'script']);
    if (params.imageUrl) { setImageUrl(params.imageUrl); setImagePreview(params.imageUrl); }
    if (params.audioUrl) { setAudioUrl(params.audioUrl); measureAudioDuration(params.audioUrl).then(d => setAudioDuration(d)).catch(() => {}); }
    if (params.text || params.script) { setTtsText((params.text || params.script || '').slice(0, 1000)); setAiTopic((params.text || params.script || '').slice(0, 100)); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 工作流 handoff 预填
  useEffect(() => {
    if (!session?.accumulated_handoff) return;
    const h = session.accumulated_handoff as Record<string, string>;
    if (h.imageUrl) { setImageUrl(h.imageUrl); setImagePreview(h.imageUrl); }
    if (h.audioUrl) { setAudioUrl(h.audioUrl); measureAudioDuration(h.audioUrl).then(d => setAudioDuration(d)).catch(() => {}); }
    if (h.text || h.script) { setTtsText((h.text || h.script || '').slice(0, 1000)); setAiTopic((h.text || h.script || '').slice(0, 100)); }
  }, [session]);

  // ─── Handlers ──────────────────────────────────
  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });
  const handleImageSelect = (url: string) => { setImageUrl(url); setImagePreview(url); };
  const handleAudioReady = (url: string, duration: number | null) => {
    setAudioUrl(url);
    if (duration !== null) setAudioDuration(duration);
  };

  const handleGenerate = async () => {
    if (!imageUrl) { showToast('请先选择角色图片', 'error'); return; }
    if (!audioUrl) { showToast('请生成或上传音频', 'error'); return; }
    setGeneratePhase('submitting'); setErrorMsg(null); setFinalVideoUrl(null);
    const poll = await submitAndPoll(
      imageUrl, audioUrl, resolution,
      (videoUrl) => {
        setFinalVideoUrl(videoUrl); setGeneratePhase('done');
        if (isInWorkflow) completeCurrentStep({ text: ttsText, script: ttsText, topic: aiTopic, imageUrl: imageUrl || '', firstFrame: videoUrl }, undefined);
      },
      (msg) => { setErrorMsg(msg); setGeneratePhase('error'); },
      audioDuration,
    );
    pollingRef.current = poll;
    if (poll) setGeneratePhase('generating');
  };

  const handleCancel = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setGeneratePhase('idle');
  };

  const handleOneClick = async () => {
    if (!imageUrl) { showToast('请先选择角色图片', 'error'); return; }
    ocAbortRef.current = false; setOcError(null);
    let script: string;
    if (s2vScriptSource === 'ai') {
      if (!aiTopic.trim()) { showToast('请输入主题', 'error'); return; }
      setOcPhase('scripting');
      try {
        const sRes = await apiClient.post<{ scripts: string[] }>('/ai/digital-human/script', {
          topic: aiTopic, style: aiStyle, targetLength: aiLength, variantCount: 1, language: targetLang,
        });
        if (!sRes.success) throw new Error(sRes.error || '写稿失败');
        script = sRes.data!.scripts[0];
      } catch (err: any) { setOcError((err instanceof Error ? err.message : '') || '操作失败'); setOcPhase('error'); return; }
    } else {
      if (!ttsText.trim()) { showToast('请输入口播脚本', 'error'); return; }
      script = ttsText.trim();
    }
    if (ocAbortRef.current) return;

    const segments = splitScriptForDigitalHuman(script, 100);
    setOcTotalSegments(segments.length); setOcCurrentSegment(0);
    const videoUrls: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      if (ocAbortRef.current) return;
      setOcCurrentSegment(i + 1); setOcPhase('tts');
      const base64 = await generateTTS(segments[i], voice, speed, pitch, clonedVoiceId);
      if (!base64) throw new Error(`第${i + 1}段配音失败`);
      if (ocAbortRef.current) return;
      setOcPhase('uploading');
      const audUrl = await base64ToUrl(base64);
      if (ocAbortRef.current) return;
      try { const dur = await measureAudioDuration(audUrl); if (dur > MAX_AUDIO_SECONDS) { showToast(`第${i + 1}段音频超20s限制,已跳过`, 'error'); continue; } } catch {}
      setOcPhase('submitting');
      await new Promise<void>((resolve, reject) => {
        submitAndPoll(imageUrl, audUrl, resolution, (videoUrl) => { videoUrls.push(videoUrl); resolve(); }, (msg) => { reject(new Error(msg)); });
        if (ocAbortRef.current) { resolve(); }
      });
      if (ocAbortRef.current) return;
    }
    if (videoUrls.length === 0) throw new Error('所有分段均生成失败');

    let mergedUrl: string | null = null;
    if (videoUrls.length > 1) {
      setOcPhase('merging');
      try {
        const mergeRes = await fetch('/api/ai/digital-human/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoUrls }) });
        const mergeData = await mergeRes.json();
        if (mergeData.success && mergeData.data?.videoUrl) mergedUrl = mergeData.data.videoUrl;
      } catch {}
    }
    const finalUrl = mergedUrl || videoUrls[0];
    setFinalVideoUrl(finalUrl); setOcPhase('done');
    if (isInWorkflow) completeCurrentStep({ text: ttsText, script, topic: aiTopic, imageUrl: imageUrl || '', firstFrame: finalUrl }, undefined);
  };

  const addBatchItem = () => {
    const text = batchInput.trim(); if (!text) return;
    setBatchItems(prev => [...prev, ...text.split('\n').filter(l => l.trim()).map(t => ({
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      topic: t, script: '', audioUrl: null, taskId: null, videoUrl: null, status: 'pending' as const,
    }))]);
    setBatchInput('');
  };

  const removeBatchItem = (id: string) => setBatchItems(prev => prev.filter(i => i.id !== id));

  const runBatch = async () => {
    if (!imageUrl) { showToast('请先选择角色图片', 'error'); return; }
    if (batchItems.length === 0) { showToast('请添加主题', 'error'); return; }
    batchAbortRef.current = false; setIsBatchRunning(true);
    for (let i = 0; i < batchItems.length; i++) {
      if (batchAbortRef.current) break;
      const item = batchItems[i];
      const update = (updates: Partial<BatchItem>) => setBatchItems(prev => prev.map(it => it.id === item.id ? { ...it, ...updates } : it));
      try {
        update({ status: 'scripting' });
        const sRes = await apiClient.post<{ scripts: string[] }>('/ai/digital-human/script', { topic: item.topic, style: 'oral', targetLength: 100, variantCount: 1 });
        if (!sRes.success) throw new Error('写稿失败');
        update({ script: sRes.data!.scripts[0], status: 'tts' });
        const base64 = await generateTTS(sRes.data!.scripts[0], voice, speed, pitch, clonedVoiceId);
        if (!base64) throw new Error('配音失败');
        update({ status: 'uploading' });
        const aUrl = await base64ToUrl(base64);
        update({ audioUrl: aUrl, status: 'submitting' });
        await new Promise<void>((resolve, reject) => {
          submitAndPoll(imageUrl, aUrl, resolution,
            (videoUrl) => { update({ videoUrl, status: 'done' }); if (isInWorkflow) completeCurrentStep({ text: ttsText, script: ttsText, topic: aiTopic, imageUrl: imageUrl || '', firstFrame: videoUrl }, undefined); resolve(); },
            (msg) => { update({ errorMsg: msg, status: 'error' }); reject(new Error(msg)); }, audioDuration);
          setTimeout(() => { if (batchAbortRef.current) { update({ status: 'pending' }); resolve(); } }, 1000);
        });
      } catch {}
      if (i < batchItems.length - 1 && !batchAbortRef.current) await new Promise(r => setTimeout(r, 1100));
    }
    setIsBatchRunning(false);
  };

  const handleDownload = async (url?: string) => {
    const u = url || finalVideoUrl; if (!u) return;
    try {
      const res = await fetch(u); const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = objUrl; a.download = `digital-human-${Date.now()}.mp4`; a.click();
      URL.revokeObjectURL(objUrl);
    } catch {}
  };

  const handleSave = async (videoUrl?: string) => {
    const u = videoUrl || finalVideoUrl; if (!u) return;
    try {
      const res = await fetch('/api/inspiration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'video', title: `数字人视频 · ${resolution}`, media_urls: [u], tags: ['数字人', 'AI生成', 'video_material'], source_platform: 'ai_digital_human' }) });
      const data = await res.json();
      showToast(data.success ? '已保存到作品库' : '保存失败', data.success ? 'success' : 'error');
    } catch { showToast('保存失败', 'error'); }
  };

  const showProgress = generatePhase === 'uploading_audio' || generatePhase === 'submitting' || generatePhase === 'generating';

  // ════════════════════════════════════════════════
  // 渲染
  // ════════════════════════════════════════════════
  return (
    <div className="flex flex-col min-h-screen pb-24">
      <TopNav title="AI 数字人" showBack onBack={() => router.push('/ai')} />
      {isInWorkflow && session && (
        <WorkflowSessionBar session={session} onPause={pauseSession} onResume={resumeSession} onAbandon={abandonSession} />
      )}

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* 模式选择 */}
        <div className="overflow-x-auto -mx-4 px-4 pb-1">
          <div className="flex gap-2 min-w-max">
            {MODES.map(({ key, label, icon }) => (
              <button key={key} onClick={() => { setDhMode(key); setGeneratePhase('idle'); setFinalVideoUrl(null); setErrorMsg(null); setOcPhase('idle'); setOcError(null); }}
                className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all flex-shrink-0"
                style={{
                  background: dhMode === key ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)',
                  border: dhMode === key ? '1px solid rgba(6,182,212,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: dhMode === key ? '0 0 12px rgba(6,182,212,0.2)' : 'none',
                }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <span style={{ color: dhMode === key ? '#67E8F9' : '#9CA3AF', fontSize: 11, fontWeight: dhMode === key ? 700 : 400 }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 预配置资产状态栏 */}
        <div className="flex gap-2">
          <button onClick={() => router.push('/profile/settings')}
            className="flex-1 flex items-center gap-2 p-2.5 rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <UserCircle2 size={14} color="#9CA3AF" />
            </div>
            <div className="text-left">
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 500 }}>训练数字分身</p>
              <p style={{ color: '#6B7280', fontSize: 10 }}>HeyGen · 5-15分钟</p>
            </div>
            <ChevronRight size={12} color="#6B7280" className="flex-shrink-0 ml-auto" />
          </button>
          {animatePreset ? (
            <button onClick={() => setDhMode('animate')}
              className="flex-1 flex items-center gap-2 p-2.5 rounded-xl transition-all"
              style={{ background: dhMode === 'animate' ? 'rgba(139,92,246,0.12)' : 'rgba(34,197,94,0.06)', border: dhMode === 'animate' ? '1px solid rgba(139,92,246,0.35)' : '1px solid rgba(34,197,94,0.15)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: 'rgba(139,92,246,0.2)' }}>
                {animatePreset.imagePreview ? <img src={animatePreset.imagePreview} alt="" className="w-full h-full object-cover" /> : <UserCircle2 size={14} color="#C4B5FD" />}
              </div>
              <div className="text-left min-w-0">
                <p style={{ color: '#D1D5DB', fontSize: 11, fontWeight: 600 }} className="truncate">{animatePreset.name}</p>
                <p style={{ color: '#34D399', fontSize: 10 }}>● 形象就绪</p>
              </div>
              <ChevronRight size={12} color="#6B7280" className="flex-shrink-0 ml-auto" />
            </button>
          ) : (
            <button onClick={() => setDhMode('animate')}
              className="flex-1 flex items-center gap-2 p-2.5 rounded-xl transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <UserCircle2 size={14} color="#9CA3AF" />
              </div>
              <div className="text-left">
                <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 500 }}>配置角色形象</p>
                <p style={{ color: '#6B7280', fontSize: 10 }}>Wan2.2 · 动作迁移</p>
              </div>
              <ChevronRight size={12} color="#6B7280" className="flex-shrink-0 ml-auto" />
            </button>
          )}
        </div>

        {/* 角色图片 */}
        <MediaPicker accept="image" onSelect={handleImageSelect} value={imageUrl} />
        {imagePreview && (
          <GlassCard>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ border: '2px solid rgba(6,182,212,0.4)' }}>
                <img src={imagePreview} alt="角色" className="w-full h-full object-cover" />
              </div>
              <div>
                <span style={{ color: '#86EFAC', fontSize: 11 }}>✓ 角色已选</span>
                <button onClick={() => { setImageUrl(''); setImagePreview(null); }} className="block text-xs mt-0.5" style={{ color: '#F87171' }}>移除</button>
              </div>
            </div>
          </GlassCard>
        )}

        {/* ── s2v 模式 ── */}
        {dhMode === 's2v' && (
          <>
            <DigitalHumanScriptPanel
              s2vScriptSource={s2vScriptSource} onScriptSourceChange={setS2vScriptSource}
              aiTopic={aiTopic} onAiTopicChange={setAiTopic}
              aiStyle={aiStyle} onAiStyleChange={setAiStyle}
              aiLength={aiLength} onAiLengthChange={setAiLength}
              targetLang={targetLang} onTargetLangChange={setTargetLang}
              ttsText={ttsText} onTtsTextChange={setTtsText}
              onToast={showToast}
            />
            {ttsText && (
              <DigitalHumanVoicePanel
                ttsText={ttsText} onTtsTextChange={setTtsText}
                voice={voice} onVoiceChange={setVoice}
                speed={speed} onSpeedChange={setSpeed}
                pitch={pitch} onPitchChange={setPitch}
                clonedVoiceId={clonedVoiceId}
                audioUrl={audioUrl} audioDuration={audioDuration}
                onAudioReady={handleAudioReady}
                onToast={showToast}
                targetLang={targetLang}
              />
            )}

            {/* 生成操作区 */}
            {(ttsText || audioUrl) && (
              <GlassCard>
                <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 12 }}><span style={{ color: '#06B6D4' }}>生成</span> · 视频</p>

                <div className="flex items-center justify-between mb-3 p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div><span style={{ color: '#E5E7EB', fontSize: 12, fontWeight: 600 }}>📦 批量模式</span><span style={{ color: '#9CA3AF', fontSize: 10, marginLeft: 6 }}>多主题逐条生成</span></div>
                  <button onClick={() => setS2vBatchMode(!s2vBatchMode)} className="relative w-10 h-5 rounded-full transition-all" style={{ background: s2vBatchMode ? 'rgba(245,158,11,0.6)' : 'rgba(255,255,255,0.15)' }}>
                    <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: s2vBatchMode ? 22 : 2 }} />
                  </button>
                </div>

                {s2vBatchMode ? (
                  <>
                    <div className="flex gap-2 mb-3">
                      <input value={batchInput} onChange={e => setBatchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addBatchItem(); }}
                        placeholder="输入主题，每行一个..." className="flex-1 bg-transparent px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
                      <button onClick={addBatchItem} className="px-4 py-2 rounded-xl text-xs flex items-center gap-1" style={{ background: 'rgba(245,158,11,0.2)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.3)' }}><Plus size={14} /> 添加</button>
                    </div>
                    {batchItems.length > 0 && (
                      <div className="space-y-1.5 max-h-60 overflow-y-auto mb-3">
                        {batchItems.map((item, idx) => {
                          const st = BATCH_STATUS_LABELS[item.status];
                          return (
                            <div key={item.id} className="p-2 rounded-lg flex items-center justify-between" style={{ background: st.bg, border: '1px solid rgba(255,255,255,0.06)' }}>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span style={{ color: '#6B7280', fontSize: 10 }}>#{idx + 1}</span>
                                <span className="truncate" style={{ color: '#E5E7EB', fontSize: 11 }}>{item.topic}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {item.status === 'done' ? <CheckCircle2 size={12} color="#22C55E" /> : item.status === 'error' ? <XCircle size={12} color="#EF4444" /> : item.status !== 'pending' ? <Loader2 size={12} color={st.color} className="animate-spin" /> : null}
                                <span style={{ color: st.color, fontSize: 10 }}>{st.text}</span>
                                {!isBatchRunning && <button onClick={() => removeBatchItem(item.id)}><Trash2 size={10} color="#6B7280" /></button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex gap-2 text-xs mb-3" style={{ color: '#9CA3AF' }}>
                      <span>总计: {batchItems.length}</span><span style={{ color: '#86EFAC' }}>完成: {batchItems.filter(i => i.status === 'done').length}</span><span style={{ color: '#FCA5A5' }}>失败: {batchItems.filter(i => i.status === 'error').length}</span>
                    </div>
                    {isBatchRunning ? (
                      <button onClick={() => { batchAbortRef.current = true; }} className="w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-2" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}><Square size={14} /> 停止生成</button>
                    ) : (
                      <PrimaryButton fullWidth size="lg" onClick={runBatch} disabled={batchItems.length === 0 || !imageUrl}><Zap size={18} /> 开始批量生成 ({batchItems.length} 个 · 约 {batchItems.length * (resolution === '720P' ? 20 : 10)} 灵力)</PrimaryButton>
                    )}
                  </>
                ) : (
                  <>
                    <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>分辨率</p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {RESOLUTION_OPTIONS.map(({ key, label, cost }) => (
                        <button key={key} onClick={() => setResolution(key)} className="flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all"
                          style={{ background: resolution === key ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)', border: resolution === key ? '1px solid rgba(6,182,212,0.4)' : '1px solid rgba(255,255,255,0.1)' }}>
                          <span style={{ color: resolution === key ? '#67E8F9' : '#E5E7EB', fontSize: 14, fontWeight: 700 }}>{label}</span>
                          <span style={{ color: '#9CA3AF', fontSize: 10 }}>{cost}</span>
                        </button>
                      ))}
                    </div>
                    {generatePhase === 'idle' && ocPhase === 'idle' && (
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={handleOneClick} disabled={!imageUrl || !ttsText} className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all"
                          style={{ background: imageUrl && ttsText ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.05)', border: imageUrl && ttsText ? '1px solid rgba(6,182,212,0.4)' : '1px solid rgba(255,255,255,0.1)', opacity: imageUrl && ttsText ? 1 : 0.4 }}>
                          <Zap size={18} color="#67E8F9" /><span style={{ color: '#67E8F9', fontSize: 12, fontWeight: 600 }}>一键生成</span><span style={{ color: '#9CA3AF', fontSize: 10 }}>自动配音+分段+合并</span>
                        </button>
                        <button onClick={handleGenerate} disabled={!imageUrl || !audioUrl} className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all"
                          style={{ background: imageUrl && audioUrl ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)', border: imageUrl && audioUrl ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.1)', opacity: imageUrl && audioUrl ? 1 : 0.4 }}>
                          <Wand2 size={18} color="#C4B5FD" /><span style={{ color: '#C4B5FD', fontSize: 12, fontWeight: 600 }}>生成视频</span><span style={{ color: '#9CA3AF', fontSize: 10 }}>用已有音频生成</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </GlassCard>
            )}

            <DigitalHumanResultPanel
              finalVideoUrl={finalVideoUrl} generatePhase={generatePhase} errorMsg={errorMsg}
              showProgress={showProgress} onDownload={handleDownload} onSave={handleSave}
              onRetry={() => { setGeneratePhase('idle'); setErrorMsg(null); setFinalVideoUrl(null); setOcPhase('idle'); setOcError(null); }}
              onCancel={handleCancel}
              ocPhase={ocPhase} ocCurrentSegment={ocCurrentSegment} ocTotalSegments={ocTotalSegments}
              onCancelOc={() => { ocAbortRef.current = true; setOcPhase('idle'); }}
              aiTopic={aiTopic} ttsText={ttsText} imageUrl={imageUrl}
              onHandoffToVideo={() => handoff('/ai/video', { firstFrame: finalVideoUrl!, topic: aiTopic || ttsText.slice(0, 30) || '我的数字人', imageUrl: imageUrl || '' })}
              onHandoffToPublish={() => handoff('/publish', { text: aiTopic || ttsText.slice(0, 30) || '我的数字人', topic: aiTopic || ttsText.slice(0, 30) || '我的数字人' })}
            />
          </>
        )}

        {/* ── Animate 模式 ── */}
        {dhMode === 'animate' && <DigitalHumanImagePanel imageUrl={imageUrl} imagePreview={imagePreview} isAnimateMode={true} onToast={showToast} />}

        {/* ── Avatar 模式 ── */}
        {dhMode === 'avatar' && <DigitalHumanAvatarSection onToast={showToast} onDownload={handleDownload} />}
      </div>

      <DigitalHumanHistoryPanel items={historyItems} isLoading={historyLoading} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function DigitalHumanPage() {
  return <ProtectedRoute><DigitalHumanContent /></ProtectedRoute>;
}
