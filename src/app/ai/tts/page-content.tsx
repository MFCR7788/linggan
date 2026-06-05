'use client';

import { useState, useEffect, useRef } from 'react';
import { Music, Play, Download, FolderOpen, RefreshCw, Volume2, Clock, Mic, ChevronDown, User, UserPlus, Upload, CheckCircle2, Loader2, AlertCircle, Sparkles, X } from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components';
import { Toast } from '@/components/Toast';
import { useContentHandoff } from '@/hooks/use-content-handoff';
import { useWorkflowSession } from '@/hooks/use-workflow-session';
import { WorkflowSessionBar } from '@/components/WorkflowSessionBar';

interface VoiceOption {
  key: string;
  id: string;
  label: string;
}

interface InspirationItem {
  id: string | number;
  title: string;
  type?: string;
  original_text?: string;
  ai_summary?: string;
}

const typeEmojis: Record<string, string> = {
  text: '📝', link: '🔗', image: '🖼️', video: '🎬', voice: '🎵', audio: '🎵', schedule: '📅',
};

function TTSPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { receive, handoff } = useContentHandoff();
  const workflowSessionId = searchParams.get('workflow_session_id') || undefined;
  const { session, isInWorkflow, completeCurrentStep, pauseSession, resumeSession, abandonSession } = useWorkflowSession(workflowSessionId);

  // 文本输入
  const [textMode, setTextMode] = useState<'manual' | 'inspiration'>('manual');
  const [text, setText] = useState('');
  const [inspirations, setInspirations] = useState<InspirationItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());

  // 声音设置
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voice, setVoice] = useState('female_natural');
  const [speed, setSpeed] = useState(1.15);
  const [pitch, setPitch] = useState(1.0);

  // 生成
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 声音复刻（创始人 IP 关键）
  const [showClonePanel, setShowClonePanel] = useState(false);
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [cloneAudioBase64, setCloneAudioBase64] = useState<string | null>(null);
  const [cloneAudioFormat, setCloneAudioFormat] = useState<'wav' | 'mp3' | 'm4a'>('mp3');
  const [cloneAudioSize, setCloneAudioSize] = useState(0);
  const [cloneDemoText, setCloneDemoText] = useState('');
  const [cloneProgress, setCloneProgress] = useState<{
    speakerId: string;
    status: 'NotFound' | 'Training' | 'Success' | 'Failed' | 'Active';
    error?: string;
    stage: 'upload' | 'training' | 'done' | 'failed';
  } | null>(null);
  const clonePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载已保存的克隆音色
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('lingji_cloned_voice_id');
    if (stored) setClonedVoiceId(stored);
  }, []);

  // 接收 handoff URL 参数（从 AI 文案带入）
  useEffect(() => {
    const params = receive(['text', 'script']);
    if (params.text || params.script) {
      setText((params.text || params.script || '').slice(0, 1000));
    }
  }, []);

  // 工作流：从 session.accumulated_handoff 预填
  useEffect(() => {
    if (!session?.accumulated_handoff) return;
    const h = session.accumulated_handoff as Record<string, string>;
    if (h.text || h.script) {
      setText((h.text || h.script || '').slice(0, 1000));
    }
  }, [session]);

  // 完成后跳到数字人
  const handleImportToDigitalHuman = () => {
    if (!audioBase64) {
      setToast({ message: '请先生成音频', type: 'error' });
      return;
    }
    // 数字人接收 audioUrl，但我们这里是 base64。
    // 实际上传 base64 音频到 Supabase 略复杂，这里直接提示用户去数字人页用 base64 内容
    handoff('/ai/digital-human', { audioUrl: 'tts-recent' });
  };

  // 加载灵感
  useEffect(() => {
    fetch('/api/inspiration?limit=20')
      .then((r) => r.json())
      .then((d) => { if (d.success) setInspirations(d.data || []); })
      .catch(() => {});
  }, []);

  // 加载音色
  useEffect(() => {
    fetch('/api/ai/tts')
      .then((r) => r.json())
      .then((d) => { if (d.success) setVoices(d.data.voices || []); })
      .catch(() => {});
  }, []);

  const toggleInspiration = (id: string | number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const buildTextFromSelections = () => {
    return inspirations
      .filter((i) => selectedIds.has(i.id))
      .map((i) => i.ai_summary || i.original_text || i.title)
      .join('\n\n')
      .substring(0, 2000);
  };

  const handleGenerate = async () => {
    const finalText = textMode === 'inspiration' ? buildTextFromSelections() : text;
    if (!finalText.trim()) {
      setToast({ message: '请输入文本或选择素材', type: 'error' });
      return;
    }
    setIsGenerating(true);
    setAudioBase64(null);
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: finalText,
          voice,
          speed,
          pitch,
          cloned_voice_id: voice === 'cloned_voice' ? clonedVoiceId : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAudioBase64(data.audioBase64);
      } else {
        setToast({ message: data.error || '生成失败', type: 'error' });
      }
    } catch {
      setToast({ message: '网络错误，请重试', type: 'error' });
    }
    setIsGenerating(false);
  };

  const handleDownload = () => {
    if (!audioBase64) return;
    const blob = new Blob(
      [Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0))],
      { type: 'audio/mpeg' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tts-${Date.now()}.mp3`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!audioBase64) return;
    try {
      const res = await fetch('/api/inspiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'voice',
          title: text.substring(0, 100) || 'AI 配音',
          original_text: text,
          tags: ['AI配音', voice],
          workflow_session_id: workflowSessionId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: '已保存到作品库', type: 'success' });
        if (isInWorkflow) {
          completeCurrentStep(
            { text: text.substring(0, 1000), script: text.substring(0, 1000), audioUrl: `data:audio/mpeg;base64,${audioBase64}` },
            data.data?.id
          );
        }
      } else {
        setToast({ message: data.error || '保存失败', type: 'error' });
      }
    } catch {
      setToast({ message: '保存失败，请重试', type: 'error' });
    }
  };

  // 处理克隆音频上传（转 base64 + 校验大小）
  const handleCloneAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setToast({ message: '音频文件需 ≤ 10MB', type: 'error' });
      return;
    }
    const ext = file.name.toLowerCase().split('.').pop() || 'mp3';
    if (!['wav', 'mp3', 'm4a'].includes(ext)) {
      setToast({ message: '仅支持 wav / mp3 / m4a 格式', type: 'error' });
      return;
    }
    setCloneAudioFormat(ext as 'wav' | 'mp3' | 'm4a');
    setCloneAudioSize(file.size);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      setCloneAudioBase64(base64);
      setToast({ message: `已选择 ${file.name} (${(file.size / 1024).toFixed(0)}KB)`, type: 'success' });
    };
    reader.readAsDataURL(file);
  };

  // 开始训练
  const handleStartClone = async () => {
    if (!cloneAudioBase64) {
      setToast({ message: '请先上传音频样本', type: 'error' });
      return;
    }
    if (cloneDemoText.length < 4 || cloneDemoText.length > 80) {
      setToast({ message: '演示文本需 4-80 字', type: 'error' });
      return;
    }
    setCloning(true);
    setCloneProgress({ speakerId: '', status: 'NotFound', stage: 'upload' });
    try {
      const res = await fetch('/api/ai/voice-clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: cloneAudioBase64,
          audioFormat: cloneAudioFormat,
          demoText: cloneDemoText,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setCloneProgress({ speakerId: '', status: 'Failed', error: data.error, stage: 'failed' });
        setToast({ message: data.error || '上传失败', type: 'error' });
        setCloning(false);
        return;
      }
      setCloneProgress({ speakerId: data.data.speakerId, status: 'Training', stage: 'training' });
      setToast({ message: '上传成功,训练中(约 1-5 分钟)', type: 'success' });
      // 开始轮询
      if (clonePollRef.current) clearInterval(clonePollRef.current);
      clonePollRef.current = setInterval(handlePollCloneStatus, 8000);
      // 立即查一次
      setTimeout(handlePollCloneStatus, 2000);
    } catch (e: any) {
      setCloneProgress({ speakerId: '', status: 'Failed', error: e?.message, stage: 'failed' });
      setToast({ message: '上传失败,请重试', type: 'error' });
      setCloning(false);
    }
  };

  // 轮询克隆状态
  const handlePollCloneStatus = async () => {
    if (!cloneProgress?.speakerId) return;
    try {
      const res = await fetch(`/api/ai/voice-clone?speakerId=${encodeURIComponent(cloneProgress.speakerId)}`);
      const data = await res.json();
      if (data.success) {
        const status = data.data.status;
        if (status === 'Success' || status === 'Active') {
          setCloneProgress({ ...cloneProgress, status, stage: 'done' });
          setClonedVoiceId(cloneProgress.speakerId);
          if (typeof window !== 'undefined') {
            localStorage.setItem('lingji_cloned_voice_id', cloneProgress.speakerId);
          }
          setVoice('cloned_voice'); // 自动切换到克隆音色
          setToast({ message: '🎉 声音克隆完成,可在音色列表选择使用', type: 'success' });
          if (clonePollRef.current) clearInterval(clonePollRef.current);
          setCloning(false);
        } else if (status === 'Failed') {
          setCloneProgress({ ...cloneProgress, status, error: data.data.error, stage: 'failed' });
          setToast({ message: `训练失败: ${data.data.error || '请检查音频质量'}`, type: 'error' });
          if (clonePollRef.current) clearInterval(clonePollRef.current);
          setCloning(false);
        } else {
          setCloneProgress({ ...cloneProgress, status });
        }
      }
    } catch {
      // 静默重试
    }
  };

  // 清除克隆音色
  const handleClearClonedVoice = () => {
    setClonedVoiceId(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('lingji_cloned_voice_id');
    }
    if (voice === 'cloned_voice' && voices.length > 0) {
      setVoice(voices[0].key);
    }
    setToast({ message: '已清除克隆音色', type: 'success' });
  };

  useEffect(() => {
    return () => {
      if (clonePollRef.current) clearInterval(clonePollRef.current);
    };
  }, []);

  const handleNavigate = (page: PageKey) => {
    const routes: Record<string, string> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(routes[page] || '/home');
  };

  // Slider style helper
  const sliderTrack = (value: number, min: number, max: number) => {
    const pct = ((value - min) / (max - min)) * 100;
    return `linear-gradient(to right, #22C55E66 ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
  };

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <TopNav title="AI 配音" showBack onBack={() => router.push('/ai')} />

      {isInWorkflow && session && (
        <WorkflowSessionBar session={session} onPause={pauseSession} onResume={resumeSession} onAbandon={abandonSession} />
      )}

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* Step 1: 文本输入 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: '#22C55E' }}>文本</span> · 输入配音文本
          </p>

          {/* 模式切换 */}
          <div className="flex gap-1 mb-3 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {[
              { id: 'manual' as const, label: '手动输入', icon: <Mic size={14} /> },
              { id: 'inspiration' as const, label: '灵感库选材', icon: <FolderOpen size={14} /> },
            ].map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setTextMode(id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all"
                style={{
                  background: textMode === id ? 'rgba(34,197,94,0.2)' : 'transparent',
                  color: textMode === id ? '#86EFAC' : '#9CA3AF',
                }}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {textMode === 'manual' ? (
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="输入要配音的文本...支持中文/英文，最多2000字"
                rows={5}
                maxLength={2000}
                className="w-full px-3 py-2.5 rounded-xl bg-transparent text-sm outline-none resize-none"
                style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
              />
              <div className="flex justify-end mt-1">
                <span style={{ color: text.length > 1800 ? '#FCA5A5' : '#6B7280', fontSize: 11 }}>
                  {text.length} / 2000
                </span>
              </div>
            </div>
          ) : (
            <div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto mb-2">
                {inspirations.length > 0 ? (
                  inspirations.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2 rounded-lg cursor-pointer"
                      onClick={() => toggleInspiration(item.id)}
                      style={{
                        background: selectedIds.has(item.id) ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
                        border: selectedIds.has(item.id) ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                        style={{
                          background: selectedIds.has(item.id) ? '#22C55E' : 'transparent',
                          border: selectedIds.has(item.id) ? 'none' : '1px solid rgba(255,255,255,0.3)',
                          fontSize: 10, color: '#fff',
                        }}>
                        {selectedIds.has(item.id) ? '✓' : ''}
                      </div>
                      <span style={{ fontSize: 16 }}>{typeEmojis[item.type || 'text']}</span>
                      <span style={{ color: '#E5E7EB', fontSize: 12 }} className="truncate">
                        {item.title || item.ai_summary?.substring(0, 40) || '未命名'}
                      </span>
                    </div>
                  ))
                ) : (
                  <p style={{ color: '#6B7280', fontSize: 12, textAlign: 'center', padding: 16 }}>加载中...</p>
                )}
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>已选 {selectedIds.size} 项</span>
                <button onClick={() => setText(buildTextFromSelections())} style={{ color: '#22C55E', fontSize: 11 }}>
                  预览拼接文本 →
                </button>
              </div>
            </div>
          )}
        </GlassCard>

        {/* Step 2: 声音设置 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: '#8B5CF6' }}>声音</span> · 选择音色与参数
          </p>

          {/* 音色选择 */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {/* 克隆音色(若存在) */}
            {clonedVoiceId && (
              <button
                onClick={() => setVoice('cloned_voice')}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all relative"
                style={{
                  background: voice === 'cloned_voice' ? 'rgba(236,72,153,0.2)' : 'rgba(255,255,255,0.05)',
                  border: voice === 'cloned_voice' ? '1px solid rgba(236,72,153,0.5)' : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <Sparkles size={16} color={voice === 'cloned_voice' ? '#F9A8D4' : '#9CA3AF'} />
                <span style={{
                  color: voice === 'cloned_voice' ? '#F9A8D4' : '#9CA3AF',
                  fontSize: 11, fontWeight: voice === 'cloned_voice' ? 600 : 400,
                }}>
                  我的克隆
                </span>
                <span style={{
                  position: 'absolute', top: 2, right: 2,
                  fontSize: 8, color: '#EC4899', background: 'rgba(236,72,153,0.15)',
                  padding: '0 3px', borderRadius: 4,
                }}>
                  ⭐
                </span>
              </button>
            )}
            {voices.map((v) => (
              <button
                key={v.key}
                onClick={() => setVoice(v.key)}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all"
                style={{
                  background: voice === v.key ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
                  border: voice === v.key ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <Volume2 size={16} color={voice === v.key ? '#C4B5FD' : '#9CA3AF'} />
                <span style={{
                  color: voice === v.key ? '#C4B5FD' : '#9CA3AF',
                  fontSize: 11, fontWeight: voice === v.key ? 600 : 400,
                }}>
                  {v.label}
                </span>
              </button>
            ))}
          </div>

          {/* 声音克隆入口(折叠面板) */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(236,72,153,0.25)' }}
          >
            <button
              onClick={() => setShowClonePanel(!showClonePanel)}
              className="w-full flex items-center justify-between px-3 py-2.5"
              style={{ background: 'rgba(236,72,153,0.08)' }}
            >
              <div className="flex items-center gap-2">
                <UserPlus size={14} color="#F9A8D4" />
                <span style={{ color: '#F9A8D4', fontSize: 12, fontWeight: 600 }}>
                  克隆我的声音
                </span>
                {clonedVoiceId && (
                  <span style={{
                    fontSize: 9, color: '#22C55E', background: 'rgba(34,197,94,0.15)',
                    padding: '1px 5px', borderRadius: 4,
                  }}>
                    已训练
                  </span>
                )}
              </div>
              <ChevronDown
                size={14} color="#F9A8D4"
                style={{ transform: showClonePanel ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
              />
            </button>

            {showClonePanel && (
              <div className="p-3 space-y-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                {!clonedVoiceId ? (
                  <>
                    <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.6 }}>
                      上传 30 秒清晰人声样本(无背景音乐),系统会训练你的专属音色,约 1-5 分钟完成。
                      <span style={{ color: '#FBBF24' }}>首次训练 ¥99,合成按字符数计费 ~¥0.0001/字</span>
                    </p>

                    {/* 音频上传 */}
                    <div>
                      <label
                        className="flex flex-col items-center gap-1.5 py-3 rounded-lg cursor-pointer"
                        style={{
                          background: cloneAudioBase64 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
                          border: cloneAudioBase64 ? '1px solid rgba(34,197,94,0.3)' : '1px dashed rgba(255,255,255,0.2)',
                        }}
                      >
                        {cloneAudioBase64 ? (
                          <>
                            <CheckCircle2 size={20} color="#22C55E" />
                            <span style={{ color: '#86EFAC', fontSize: 11 }}>
                              已选择音频 ({(cloneAudioSize / 1024).toFixed(0)} KB)
                            </span>
                          </>
                        ) : (
                          <>
                            <Upload size={20} color="#9CA3AF" />
                            <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                              点击上传音频样本 (wav / mp3 / m4a, ≤ 10MB)
                            </span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="audio/wav,audio/mpeg,audio/mp4,audio/x-m4a"
                          onChange={handleCloneAudioChange}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>

                    {/* 演示文本 */}
                    <div>
                      <div className="flex justify-between mb-1">
                        <span style={{ color: '#9CA3AF', fontSize: 11 }}>演示文本（请说这段话）</span>
                        <span style={{
                          color: cloneDemoText.length < 4 || cloneDemoText.length > 80 ? '#FCA5A5' : '#6B7280',
                          fontSize: 10,
                        }}>
                          {cloneDemoText.length} / 80
                        </span>
                      </div>
                      <textarea
                        value={cloneDemoText}
                        onChange={(e) => setCloneDemoText(e.target.value)}
                        placeholder="例如:大家好,我是创始人,很高兴通过灵集和你分享我的故事"
                        rows={2}
                        maxLength={80}
                        className="w-full px-2.5 py-2 rounded-lg bg-transparent text-xs outline-none resize-none"
                        style={{
                          color: '#E5E7EB',
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'rgba(255,255,255,0.04)',
                        }}
                      />
                    </div>

                    {/* 训练状态 / 按钮 */}
                    {cloneProgress?.stage === 'failed' ? (
                      <div className="flex items-start gap-2 p-2.5 rounded-lg"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
                        <AlertCircle size={14} color="#FCA5A5" style={{ flexShrink: 0, marginTop: 1 }} />
                        <div className="flex-1">
                          <p style={{ color: '#FCA5A5', fontSize: 11, fontWeight: 600 }}>训练失败</p>
                          <p style={{ color: '#FCA5A5', fontSize: 10, marginTop: 2 }}>
                            {cloneProgress.error || '请检查音频质量后重试'}
                          </p>
                        </div>
                        <button
                          onClick={() => setCloneProgress(null)}
                          style={{ color: '#FCA5A5', fontSize: 10 }}
                        >
                          重试
                        </button>
                      </div>
                    ) : cloneProgress?.stage === 'training' ? (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg"
                        style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
                        <Loader2 size={14} color="#FBBF24" className="animate-spin" />
                        <div className="flex-1">
                          <p style={{ color: '#FBBF24', fontSize: 11, fontWeight: 600 }}>训练中...</p>
                          <p style={{ color: '#FBBF24', fontSize: 10, marginTop: 2 }}>
                            约 1-5 分钟,完成后会自动通知
                          </p>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={handleStartClone}
                        disabled={cloning || !cloneAudioBase64 || cloneDemoText.length < 4}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: cloning || !cloneAudioBase64 || cloneDemoText.length < 4
                            ? 'rgba(236,72,153,0.15)'
                            : 'linear-gradient(135deg, rgba(236,72,153,0.4), rgba(139,92,246,0.4))',
                          color: cloning || !cloneAudioBase64 || cloneDemoText.length < 4 ? '#6B7280' : '#FBCFE8',
                          border: '1px solid rgba(236,72,153,0.3)',
                          cursor: cloning || !cloneAudioBase64 || cloneDemoText.length < 4 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Sparkles size={14} />
                        {cloning ? '上传中...' : '开始训练 (¥99 一次性)'}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2.5 rounded-lg"
                      style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
                      <CheckCircle2 size={14} color="#22C55E" />
                      <div className="flex-1">
                        <p style={{ color: '#86EFAC', fontSize: 11, fontWeight: 600 }}>克隆音色已就绪</p>
                        <p style={{ color: '#6B7280', fontSize: 9, marginTop: 2, fontFamily: 'monospace' }}>
                          {clonedVoiceId}
                        </p>
                      </div>
                      <button
                        onClick={handleClearClonedVoice}
                        className="p-1"
                        style={{ color: '#9CA3AF' }}
                        title="清除"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <p style={{ color: '#6B7280', fontSize: 10, lineHeight: 1.5 }}>
                      💡 在上方「我的克隆」卡片选择,或直接去做数字人(数字人页会优先推荐使用克隆音色)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 语速 */}
          <div className="mb-3">
            <div className="flex justify-between mb-1.5">
              <span style={{ color: '#9CA3AF', fontSize: 11 }}>语速</span>
              <span style={{ color: '#86EFAC', fontSize: 11, fontWeight: 500 }}>{speed.toFixed(2)}x</span>
            </div>
            <input
              type="range" min="0.5" max="2.0" step="0.05" value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ background: sliderTrack(speed, 0.5, 2.0), accentColor: '#22C55E' }}
            />
            <div className="flex justify-between mt-0.5">
              <span style={{ color: '#6B7280', fontSize: 10 }}>慢速</span>
              <span style={{ color: '#6B7280', fontSize: 10 }}>快速</span>
            </div>
          </div>

          {/* 音调 */}
          <div>
            <div className="flex justify-between mb-1.5">
              <span style={{ color: '#9CA3AF', fontSize: 11 }}>音调</span>
              <span style={{ color: '#86EFAC', fontSize: 11, fontWeight: 500 }}>{pitch.toFixed(2)}</span>
            </div>
            <input
              type="range" min="0.5" max="2.0" step="0.05" value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ background: sliderTrack(pitch, 0.5, 2.0), accentColor: '#22C55E' }}
            />
            <div className="flex justify-between mt-0.5">
              <span style={{ color: '#6B7280', fontSize: 10 }}>低沉</span>
              <span style={{ color: '#6B7280', fontSize: 10 }}>尖细</span>
            </div>
          </div>
        </GlassCard>

        {/* Step 3: 生成 & 预览 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: '#3B82F6' }}>生成</span> · 合成语音
          </p>

          {!audioBase64 && (
            <PrimaryButton fullWidth size="lg" onClick={handleGenerate} loading={isGenerating}>
              <Music size={16} /> {isGenerating ? '生成中...' : '生成语音'}
            </PrimaryButton>
          )}

          {audioBase64 && (
            <>
              <audio
                ref={audioRef}
                controls
                className="w-full mb-3"
                style={{ borderRadius: 12, background: 'rgba(255,255,255,0.05)' }}
                src={`data:audio/mpeg;base64,${audioBase64}`}
              />

              <div className="grid grid-cols-4 gap-2">
                <button onClick={handleDownload}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#86EFAC' }}>
                  <Download size={16} /> 下载
                </button>
                <button onClick={handleSave}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs"
                  style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#C4B5FD' }}>
                  <FolderOpen size={16} /> 保存
                </button>
                <button onClick={handleGenerate}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs"
                  style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93C5FD' }}>
                  <RefreshCw size={16} /> 重新生成
                </button>
                <button
                  onClick={async () => {
                    // 把音频 base64 上传到 storage，然后跳到数字人
                    try {
                      setToast({ message: '正在准备音频...', type: 'success' });
                      const bytes = Uint8Array.from(atob(audioBase64!), c => c.charCodeAt(0));
                      const blob = new Blob([bytes], { type: 'audio/mpeg' });
                      const fd = new FormData();
                      fd.append('file', blob, `tts-${Date.now()}.mp3`);
                      const upRes = await fetch('/api/upload/inspiration', { method: 'POST', body: fd });
                      const upData = await upRes.json();
                      if (upData.success && upData.data?.url) {
                        handoff('/ai/digital-human', { audioUrl: upData.data.url });
                      } else {
                        handoff('/ai/digital-human', {});
                        setToast({ message: '已跳转，请在数字人页用"上传"选这个音频', type: 'success' });
                      }
                    } catch {
                      handoff('/ai/digital-human', {});
                    }
                  }}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs"
                  style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(236,72,153,0.2))', border: '1px solid rgba(236,72,153,0.4)', color: '#FBCFE8' }}>
                  <User size={16} /> 驱动数字人
                </button>
              </div>
            </>
          )}
        </GlassCard>
      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function TTSPage() {
  return (
    <ProtectedRoute>
      <TTSPageContent />
    </ProtectedRoute>
  );
}
