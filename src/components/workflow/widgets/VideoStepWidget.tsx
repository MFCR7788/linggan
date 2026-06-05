'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Sparkles, Play, Pause, Download } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useWorkHistory } from '@/hooks/use-work-history';
import type { StepWidgetProps } from '../StepWidgetRegistry';

export function VideoStepWidget({ handoff, onComplete, isCompleting, autoExecute, onAutoError, role }: StepWidgetProps) {
  const [text, setText] = useState(handoff.text || handoff.script || '');
  const [generating, setGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const autoTriggeredRef = useRef(false);
  const { items: historyItems, isLoading: historyLoading } = useWorkHistory('视频');

  useEffect(() => { if (!autoExecute) { autoTriggeredRef.current = false; } }, [autoExecute]);

  useEffect(() => {
    if (!autoExecute || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    async function autoRun() {
      const input = (handoff.text || handoff.script || '').trim();
      if (!input) { onAutoError?.('缺少视频脚本，无法自动生成视频'); return; }
      try {
        const res = await apiClient.post<{ taskId: string }>('/ai/video', {
          prompt: role ? `${role}\n${input}` : input,
          imageUrl: handoff.imageUrl || handoff.firstFrame || '',
          style: handoff.style || '',
        });
        if (!res.success) throw new Error(res.error);
        const taskId = res.data!.taskId;
        for (let i = 0; i < 90; i++) {
          await new Promise((r) => setTimeout(r, 4000));
          const pollRes = await apiClient.get<{ status: string; videoUrl?: string }>(`/ai/video?taskId=${taskId}`);
          if (!pollRes.success) continue;
          if (pollRes.data!.status === 'succeeded' && pollRes.data!.videoUrl) {
            await onComplete({ handoffData: { text: input.substring(0, 1000), firstFrame: handoff.imageUrl || '', videoUrl: pollRes.data!.videoUrl } });
            return;
          }
          if (pollRes.data!.status === 'failed') throw new Error('视频合成失败');
        }
        throw new Error('视频生成超时');
      } catch (e: any) {
        onAutoError?.(e.message || '视频生成失败');
      }
    }
    autoRun();
  }, [autoExecute, handoff.text, handoff.script, handoff.imageUrl, handoff.firstFrame, handoff.style, onComplete, onAutoError]);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.post<{ taskId: string }>('/ai/video', {
        prompt: text.trim(),
        imageUrl: handoff.imageUrl || handoff.firstFrame || '',
        style: handoff.style || '',
      });
      if (!res.success) throw new Error(res.error);

      const taskId = res.data!.taskId;
      // Poll for completion
      let attempts = 0;
      while (attempts < 60) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await apiClient.get<{ status: string; videoUrl?: string }>(`/ai/video?taskId=${taskId}`);
        if (pollRes.success && pollRes.data) {
          if (pollRes.data.status === 'succeeded' && pollRes.data.videoUrl) {
            setVideoUrl(pollRes.data.videoUrl);
            break;
          }
          if (pollRes.data.status === 'failed') {
            throw new Error('视频合成失败');
          }
        }
        attempts++;
        setProgress(`生成中... ${Math.round((attempts / 60) * 100)}%`);
      }
      if (!videoUrl && attempts >= 60) throw new Error('生成超时，请稍后重试');
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
      handoffData: { text: text.substring(0, 1000), firstFrame: handoff.imageUrl || '', videoUrl },
    });
  };

  return (
    <div className="space-y-3">
      {handoff.imageUrl && (
        <div className="rounded-lg overflow-hidden" style={{ aspectRatio: '16/9', background: 'rgba(0,0,0,0.3)', maxHeight: 120 }}>
          <img src={handoff.imageUrl} alt="Frame" className="w-full h-full object-contain" />
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入视频旁白或脚本..."
        rows={3}
        className="w-full px-3 py-2.5 rounded-lg text-sm resize-none"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
      />

      {!videoUrl ? (
        <>
          <button
            onClick={handleGenerate}
            disabled={!text.trim() || generating || isCompleting}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
            style={{
              background: text.trim() ? 'linear-gradient(135deg, #F43F5E, #E11D48)' : 'rgba(255,255,255,0.06)',
              color: text.trim() ? '#FFFFFF' : '#4B5563',
            }}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating ? (progress || '生成中...') : '生成视频'}
          </button>
          {progress && (
            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: progress.includes('%') ? progress : '10%', background: 'linear-gradient(90deg, #F43F5E, #E11D48)' }} />
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <video src={videoUrl} controls className="w-full rounded-lg" style={{ maxHeight: 200, background: '#000' }} />
          <div className="flex gap-2">
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
            >
              <Download size={12} /> 下载
            </a>
            <button
              onClick={handleComplete}
              disabled={isCompleting}
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-semibold"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF' }}
            >
              {isCompleting ? <Loader2 size={12} className="animate-spin" /> : null}
              确认使用
            </button>
          </div>
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
                onClick={() => { if (item.videoUrl) setVideoUrl(item.videoUrl); }}
                className="w-full text-left px-2.5 py-2 rounded-lg transition-all hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <p style={{ color: '#E5E7EB', fontSize: 11 }} className="truncate">{item.title || 'AI 生成视频'}</p>
                <span style={{ color: '#6B7280', fontSize: 10 }}>{item.time}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
