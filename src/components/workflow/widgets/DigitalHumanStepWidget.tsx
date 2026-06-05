'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Play } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { StepWidgetProps } from '../StepWidgetRegistry';

export function DigitalHumanStepWidget({ handoff, onComplete, isCompleting }: StepWidgetProps) {
  const [text, setText] = useState(handoff.text || handoff.script || '');
  const [generating, setGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.post<{ taskId: string }>('/ai/digital-human', {
        text: text.trim(),
        imageUrl: handoff.imageUrl || '',
        audioUrl: handoff.audioUrl || '',
      });
      if (!res.success) throw new Error(res.error);

      const taskId = res.data!.taskId;
      let attempts = 0;
      while (attempts < 90) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await apiClient.get<{ status: string; video_url?: string; url?: string }>(
          `/ai/digital-human?taskId=${taskId}`
        );
        if (pollRes.success && pollRes.data) {
          const url = pollRes.data.video_url || pollRes.data.url;
          if (pollRes.data.status === 'completed' && url) {
            setVideoUrl(url);
            break;
          }
          if (pollRes.data.status === 'failed') throw new Error('数字人生成失败');
        }
        attempts++;
        setProgress(`生成中... ${Math.round((attempts / 90) * 100)}%`);
      }
      if (!videoUrl && attempts >= 90) throw new Error('生成超时');
    } catch (e: any) {
      setError(e.message || '生成失败');
    } finally {
      setGenerating(false);
      setProgress('');
    }
  };

  const handleComplete = async () => {
    if (!videoUrl) return;
    await onComplete({
      handoffData: { text: text.substring(0, 1000), script: text.substring(0, 1000), videoUrl, firstFrame: handoff.imageUrl || '' },
    });
  };

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入数字人口播文本..."
        rows={4}
        className="w-full px-3 py-2.5 rounded-lg text-sm resize-none"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
      />

      {handoff.imageUrl && (
        <div className="flex items-center gap-2">
          <span style={{ color: '#6B7280', fontSize: 11 }}>人物形象:</span>
          <img src={handoff.imageUrl} alt="Character" className="w-12 h-12 rounded-lg object-cover" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>
      )}
      {handoff.audioUrl && (
        <div className="flex items-center gap-2">
          <span style={{ color: '#6B7280', fontSize: 11 }}>配音:</span>
          <audio src={handoff.audioUrl} controls className="h-8" />
        </div>
      )}

      {!videoUrl ? (
        <>
          <button
            onClick={handleGenerate}
            disabled={!text.trim() || generating || isCompleting}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
            style={{
              background: text.trim() ? 'linear-gradient(135deg, #06B6D4, #0891B2)' : 'rgba(255,255,255,0.06)',
              color: text.trim() ? '#FFFFFF' : '#4B5563',
            }}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating ? (progress || '生成中...') : '生成数字人视频'}
          </button>
          {progress && (
            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full" style={{ width: '30%', background: 'linear-gradient(90deg, #06B6D4, #0891B2)' }} />
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <video src={videoUrl} controls className="w-full rounded-lg" style={{ maxHeight: 200, background: '#000' }} />
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
