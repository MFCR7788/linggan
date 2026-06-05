'use client';

import { useState, useEffect } from 'react';
import { Loader2, Play, Pause, Sparkles } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { StepWidgetProps } from '../StepWidgetRegistry';

const VOICES: { id: string; label: string; gender: string }[] = [
  { id: 'zh_female_qingxin', label: '清新女声', gender: 'female' },
  { id: 'zh_male_qingse', label: '磁性男声', gender: 'male' },
  { id: 'zh_female_shuangkuai', label: '爽快女声', gender: 'female' },
  { id: 'zh_male_wenrou', label: '温柔男声', gender: 'male' },
];

export function TtsStepWidget({ handoff, onComplete, isCompleting }: StepWidgetProps) {
  const [text, setText] = useState(handoff.script || handoff.text || '');
  const [voice, setVoice] = useState('zh_female_qingxin');
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audio] = useState(() => typeof Audio !== 'undefined' ? new (window.Audio)() : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (audioUrl && audio) {
      audio.src = audioUrl;
      audio.onended = () => setPlaying(false);
    }
    return () => { if (audio) { audio.pause(); audio.src = ''; } };
  }, [audioUrl, audio]);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.post<{ url: string }>('/ai/tts', { text: text.trim(), voice });
      if (!res.success) throw new Error(res.error);
      setAudioUrl(res.data!.url);
    } catch (e: any) {
      setError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
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
        {VOICES.map((v) => (
          <button
            key={v.id}
            onClick={() => setVoice(v.id)}
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
    </div>
  );
}
