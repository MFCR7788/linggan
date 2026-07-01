'use client';

import { useState, useEffect } from 'react';
import {
  Mic, Music, Loader2, CheckCircle2,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { generateTTS, base64ToUrl, measureAudioDuration, MAX_AUDIO_SECONDS } from '@/components/ai/digital-human/digital-human-utils';
import type { VoiceOption } from '@/components/ai/digital-human/types';

export interface DigitalHumanVoicePanelProps {
  ttsText: string;
  onTtsTextChange: (text: string) => void;
  voice: string;
  onVoiceChange: (voice: string) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  pitch: number;
  onPitchChange: (pitch: number) => void;
  clonedVoiceId: string | null;
  audioUrl: string;
  audioDuration: number | null;
  onAudioReady: (url: string, duration: number | null) => void;
  onToast: (message: string, type: 'success' | 'error') => void;
  targetLang: string;
}

export function DigitalHumanVoicePanel({
  ttsText,
  onTtsTextChange,
  voice,
  onVoiceChange,
  speed,
  onSpeedChange,
  pitch,
  onPitchChange,
  clonedVoiceId,
  audioUrl,
  audioDuration,
  onAudioReady,
  onToast,
  targetLang,
}: DigitalHumanVoicePanelProps) {
  const [audioTab, setAudioTab] = useState<'tts' | 'upload'>('tts');
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [ttsAudioBase64, setTtsAudioBase64] = useState<string | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);

  // 加载音色列表
  useEffect(() => {
    fetch(`/api/ai/tts?language=${targetLang}`)
      .then(r => r.json())
      .then(d => { if (d.success && d.data?.voices) setVoices(d.data.voices); })
      .catch(() => {});
  }, [targetLang]);

  // ─── Handlers ──────────────────────────────────────
  const handleTTSGenerate = async (text?: string) => {
    const txt = text || ttsText;
    if (!txt.trim()) {
      onToast('请输入文本', 'error');
      return;
    }
    setIsGeneratingTTS(true);
    try {
      const base64 = await generateTTS(txt, voice, speed, pitch, clonedVoiceId);
      if (base64) {
        // 测实际时长
        const dataUrl = `data:audio/mpeg;base64,${base64}`;
        let dur: number | null = null;
        try { dur = await measureAudioDuration(dataUrl); } catch {}
        if (dur !== null && dur > MAX_AUDIO_SECONDS) {
          onToast(`音频时长 ${dur.toFixed(1)} 秒,超过 ${MAX_AUDIO_SECONDS} 秒限制,请精简脚本(当前 ${txt.length} 字)`, 'error');
          return;
        }
        setTtsAudioBase64(base64);
      } else {
        onToast('TTS 生成失败', 'error');
      }
    } catch {
      onToast('TTS 请求失败', 'error');
    } finally {
      setIsGeneratingTTS(false);
    }
  };

  const handleUseTTSAudio = async () => {
    if (!ttsAudioBase64) return;
    setIsUploadingAudio(true);
    try {
      const url = await base64ToUrl(ttsAudioBase64);
      let dur: number | null = null;
      try { dur = await measureAudioDuration(`data:audio/mpeg;base64,${ttsAudioBase64}`); } catch {}
      onAudioReady(url, dur);
      setTtsAudioBase64(null);
      onToast('音频已准备就绪', 'success');
    } catch (err: any) {
      onToast(err.message || '音频上传失败', 'error');
    }
    setIsUploadingAudio(false);
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAudio(true);
    try {
      const localUrl = URL.createObjectURL(file);
      const dur = await measureAudioDuration(localUrl);
      URL.revokeObjectURL(localUrl);
      if (dur > MAX_AUDIO_SECONDS) {
        onToast(`音频时长 ${dur.toFixed(1)} 秒,超过 ${MAX_AUDIO_SECONDS} 秒限制,请用更短的音频`, 'error');
        setIsUploadingAudio(false);
        e.target.value = '';
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'audio');
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.data.url) {
        onAudioReady(data.data.url, dur);
      } else {
        onToast(data.error || '上传失败', 'error');
      }
    } catch (err: any) {
      onToast(err.message || '音频上传失败', 'error');
    }
    setIsUploadingAudio(false);
  };

  // ─── 字节/时长预估 ──────────────────────────────────
  const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(ttsText).length : ttsText.length;
  const overBytes = bytes > 1000;
  const estimatedSec = Math.ceil(ttsText.length / 5);
  const overSec = estimatedSec > MAX_AUDIO_SECONDS;

  return (
    <GlassCard>
      <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
        <span style={{ color: '#8B5CF6' }}>音频</span> · 配音
      </p>
      <div className="flex rounded-lg overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {([
          { key: 'tts' as const, label: '文字转语音', icon: <Mic size={12} /> },
          { key: 'upload' as const, label: '上传音频', icon: <Music size={12} /> },
        ]).map(({ key, label, icon }) => (
          <button key={key} onClick={() => setAudioTab(key)}
            className="flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-all"
            style={{
              background: audioTab === key ? 'rgba(139,92,246,0.2)' : 'transparent',
              color: audioTab === key ? '#C4B5FD' : '#9CA3AF',
              fontWeight: audioTab === key ? 600 : 400,
            }}>{icon} {label}</button>
        ))}
      </div>

      {audioTab === 'tts' ? (
        <>
          <textarea value={ttsText} onChange={e => onTtsTextChange(e.target.value)}
            placeholder="输入要播报的文本内容(建议 300 字以内)..." rows={3} maxLength={1000}
            className="w-full bg-transparent p-3 rounded-xl resize-none outline-none text-sm mb-2"
            style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
          <p style={{ color: (overBytes || overSec) ? '#EF4444' : '#6B7280', fontSize: 10, marginBottom: 8 }}>
            {ttsText.length} 字 / {bytes} 字节 / 预计 {estimatedSec} 秒{overSec ? ` (超过 ${MAX_AUDIO_SECONDS} 秒, 请精简)` : overBytes ? ' (超过 1000 字节)' : ' (建议 300 字以内)'}
          </p>

          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>音色</p>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {clonedVoiceId && (
              <button onClick={() => onVoiceChange('cloned_voice')}
                className="py-1.5 rounded-lg text-xs transition-all"
                style={{
                  background: voice === 'cloned_voice' ? 'rgba(236,72,153,0.2)' : 'rgba(255,255,255,0.06)',
                  border: voice === 'cloned_voice' ? '1px solid rgba(236,72,153,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  color: voice === 'cloned_voice' ? '#F9A8D4' : '#9CA3AF',
                }}>⭐ 我的克隆</button>
            )}
            {voices.map(v => (
              <button key={v.key} onClick={() => onVoiceChange(v.key)}
                className="py-1.5 rounded-lg text-xs transition-all"
                style={{
                  background: voice === v.key ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                  border: voice === v.key ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  color: voice === v.key ? '#C4B5FD' : '#9CA3AF',
                }}>{v.label}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="flex justify-between mb-1">
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>语速</span>
                <span style={{ color: '#C4B5FD', fontSize: 11 }}>{speed.toFixed(2)}x</span>
              </div>
              <input type="range" min="0.5" max="2.0" step="0.05" value={speed}
                onChange={e => onSpeedChange(parseFloat(e.target.value))} className="w-full accent-purple-500" />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>音调</span>
                <span style={{ color: '#C4B5FD', fontSize: 11 }}>{pitch.toFixed(2)}</span>
              </div>
              <input type="range" min="0.5" max="2.0" step="0.05" value={pitch}
                onChange={e => onPitchChange(parseFloat(e.target.value))} className="w-full accent-purple-500" />
            </div>
          </div>

          <PrimaryButton size="md" onClick={() => handleTTSGenerate()} disabled={isGeneratingTTS || !ttsText.trim()}>
            {isGeneratingTTS ? <><Loader2 size={14} className="animate-spin" /> 生成中...</> : <><Mic size={14} /> 生成语音</>}
          </PrimaryButton>

          {ttsAudioBase64 && (
            <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <audio src={`data:audio/mpeg;base64,${ttsAudioBase64}`} controls className="w-full mb-2" style={{ height: 32 }} />
              {audioDuration !== null && (
                <p style={{ color: audioDuration > MAX_AUDIO_SECONDS ? '#EF4444' : '#86EFAC', fontSize: 10, marginBottom: 6 }}>
                  实际时长 {audioDuration.toFixed(1)} 秒 {audioDuration > MAX_AUDIO_SECONDS ? `(超过 ${MAX_AUDIO_SECONDS} 秒限制)` : `(${MAX_AUDIO_SECONDS} 秒内 OK)`}
                </p>
              )}
              <button onClick={handleUseTTSAudio} disabled={isUploadingAudio || (audioDuration !== null && audioDuration > MAX_AUDIO_SECONDS)}
                className="w-full py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.3)' }}>
                {isUploadingAudio ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {isUploadingAudio ? '上传中...' : '使用此音频'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-4">
          <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" id="dh-audio-up" />
          <label htmlFor="dh-audio-up" className="flex flex-col items-center gap-2 py-6 px-4 rounded-xl cursor-pointer"
            style={{ border: '2px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}>
            {isUploadingAudio ? <Loader2 size={24} color="#C4B5FD" className="animate-spin" /> : <Music size={24} color="#C4B5FD" />}
            <span style={{ color: '#9CA3AF', fontSize: 12 }}>{isUploadingAudio ? '上传中...' : '上传音频文件'}</span>
            <span style={{ color: '#6B7280', fontSize: 10 }}>支持 MP3 / WAV</span>
          </label>
        </div>
      )}

      {/* 音频就绪指示器 */}
      {audioUrl ? (
        <div className="mt-3 p-3 rounded-xl flex items-center gap-3" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <CheckCircle2 size={16} color="#22C55E" />
          <div className="flex-1">
            <span style={{ color: '#86EFAC', fontSize: 12 }}>音频已就绪</span>
            {audioDuration !== null && (
              <span style={{ color: audioDuration > MAX_AUDIO_SECONDS ? '#EF4444' : '#9CA3AF', fontSize: 10, marginLeft: 8 }}>
                {audioDuration.toFixed(1)} 秒 {audioDuration > MAX_AUDIO_SECONDS ? `⚠️ 超过 ${MAX_AUDIO_SECONDS} 秒` : ''}
              </span>
            )}
          </div>
          <audio src={audioUrl} controls className="ml-auto" style={{ height: 28, maxWidth: 160 }} />
        </div>
      ) : null}
    </GlassCard>
  );
}
