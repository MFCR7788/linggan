'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Play, Pause, Sparkles } from 'lucide-react';
import { useWorkHistory } from '@/hooks/use-work-history';
import { useTts } from '@/hooks/ai/use-tts';
import type { StepWidgetProps } from '../StepWidgetRegistry';

const FALLBACK_VOICES = [
  { id: 'female_natural', label: '温柔女声', gender: 'female' },
  { id: 'female_emotional', label: '活泼女声', gender: 'female' },
  { id: 'female_professional', label: '知性女声', gender: 'female' },
  { id: 'male_natural', label: '磁性男声', gender: 'male' },
  { id: 'male_warm', label: '暖声男声', gender: 'male' },
];

export function TtsStepWidget({ handoff, onComplete, isCompleting, autoExecute, onAutoError, role }: StepWidgetProps) {
  const [text, setText] = useState(handoff.script || handoff.text || '');
  const [voice, setVoice] = useState('female_natural');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audio] = useState(() => typeof Audio !== 'undefined' ? new (window.Audio)() : null);
  const { voices: apiVoices, generate: generateTts, generating, error, setError } = useTts();
  const voices = apiVoices.length > 0 ? apiVoices : FALLBACK_VOICES;
  const autoTriggeredRef = useRef(false);
  const { items: historyItems, isLoading: historyLoading } = useWorkHistory('文案');

  useEffect(() => { if (!autoExecute) { autoTriggeredRef.current = false; } }, [autoExecute]);

  useEffect(() => {
    if (!autoExecute || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    async function autoRun() {
      const input = (handoff.script || handoff.text || '').trim();
      if (!input) { onAutoError?.('缺少文本，无法自动生成配音'); return; }
      try {
        const result = await generateTts({ text: role ? `${role}\n${input}` : input, voice });
        const dataUri = `data:${result.mimeType};base64,${result.audioBase64}`;
        await onComplete({ handoffData: { text: input.substring(0, 1000), script: input.substring(0, 1000), audioUrl: dataUri } });
      } catch (e: any) {
        onAutoError?.(e.message || '配音生成失败');
      }
    }
    autoRun();
  }, [autoExecute, handoff.script, handoff.text, voice, onComplete, onAutoError]);

  useEffect(() => {
    if (audioUrl && audio) {
      audio.src = audioUrl;
      audio.onended = () => setPlaying(false);
    }
    return () => { if (audio) { audio.pause(); audio.src = ''; } };
  }, [audioUrl, audio]);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    try {
      const result = await generateTts({ text: text.trim(), voice });
      const dataUri = `data:${result.mimeType};base64,${result.audioBase64}`;
      setAudioUrl(dataUri);
    } catch {}
  };

  const togglePlay = () => {
    if (!audio || !audioUrl) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().catch(() => {}); setPlaying(true); }
  };

  const handleComplete = async () => {
    if (!audioUrl) return;
    await onComplete({ handoffData: { text: text.substring(0, 1000), script: text.substring(0, 1000), audioUrl } });
  };

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入要转换的文本..."
        rows={4}
        className="w-full px-3 py-2.5 rounded-lg text-sm resize-none"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
      />

      <div className="flex gap-2 flex-wrap">
        {voices.map((v) => (
          <button
            key={v.id || v.label}
            onClick={() => setVoice(v.id || '')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: voice === v.id ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
              border: voice === v.id ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.06)',
              color: voice === v.id ? '#4ADE80' : '#9CA3AF',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {!audioUrl ? (
        <button
          onClick={handleGenerate}
          disabled={!text.trim() || generating || isCompleting}
          className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{
            background: text.trim() ? 'linear-gradient(135deg, #22C55E, #16A34A)' : 'rgba(255,255,255,0.06)',
            color: text.trim() ? '#FFFFFF' : '#4B5563',
          }}
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {generating ? '生成中...' : '生成配音'}
        </button>
      ) : (
        <div className="space-y-2">
          <div
            className="p-3 rounded-lg flex items-center gap-3"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}
          >
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(34,197,94,0.2)' }}
            >
              {playing ? <Pause size={16} color="#4ADE80" /> : <Play size={16} color="#4ADE80" />}
            </button>
            <div className="flex-1 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: playing ? '60%' : '0%', background: '#22C55E' }}
              />
            </div>
          </div>
          <button
            onClick={handleComplete}
            disabled={isCompleting}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF' }}
          >
            {isCompleting ? <Loader2 size={16} className="animate-spin" /> : null}
            确认使用，进入下一步
          </button>
        </div>
      )}

      {error && <p style={{ color: '#FCA5A5', fontSize: 11 }}>{error}</p>}

      {/* 历史生成 */}
      {!historyLoading && historyItems.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 8 }}>历史生成</p>
          <div className="space-y-1.5">
            {historyItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setText(item.title); }}
                className="w-full text-left px-2.5 py-2 rounded-lg transition-all hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <p style={{ color: '#E5E7EB', fontSize: 11 }} className="truncate">{item.title || 'AI 生成配音'}</p>
                <span style={{ color: '#6B7280', fontSize: 10 }}>{item.time}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
