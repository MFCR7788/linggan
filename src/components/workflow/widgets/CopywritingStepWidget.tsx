'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Sparkles, Copy, Check } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useWorkHistory } from '@/hooks/use-work-history';
import type { StepWidgetProps } from '../StepWidgetRegistry';

const CONTENT_TYPES: { id: string; label: string; platform: string; promptHint: string }[] = [
  { id: 'xiaohongshu', label: '小红书', platform: 'xiaohongshu', promptHint: '小红书种草文案，带emoji和标签' },
  { id: 'wechat_article', label: '公众号', platform: 'wechat_article', promptHint: '公众号长文，有深度' },
  { id: 'douyin', label: '短视频脚本', platform: 'douyin', promptHint: '抖音短视频脚本，3秒抓眼球' },
  { id: 'script', label: '口播稿', platform: 'script', promptHint: '口播文案，口语化' },
];

export function CopywritingStepWidget({ handoff, onComplete, isCompleting, autoExecute, onAutoError, role }: StepWidgetProps) {
  const [topic, setTopic] = useState(handoff.topic || handoff.text || '');
  const [contentType, setContentType] = useState(handoff.style || 'xiaohongshu');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoTriggeredRef = useRef(false);
  const { items: historyItems, isLoading: historyLoading } = useWorkHistory('文案');

  useEffect(() => { if (!autoExecute) { autoTriggeredRef.current = false; } }, [autoExecute]);

  useEffect(() => {
    if (!autoExecute || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    async function autoRun() {
      const input = (handoff.topic || handoff.text || '').trim();
      if (!input) { onAutoError?.('缺少话题/文本，无法自动生成文案'); return; }
      try {
        const ct = CONTENT_TYPES.find((c) => c.id === contentType);
        const res = await apiClient.post<{ content: string }>('/ai/copywriting', {
          inspirations: [{ title: input, originalText: input }],
          type: contentType,
          style: ct?.promptHint || handoff.style || '',
          industry: handoff.industry || '',
          userInstruction: role ? `${role}\n${ct?.promptHint || ''}` : (ct?.promptHint || ''),
        });
        if (!res.success) throw new Error(res.error);
        const text = res.data!.content;
        await fetch('/api/inspiration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'text', title: input, content: text }),
        });
        await onComplete({ handoffData: { text: text.substring(0, 1000), topic: input, style: contentType, industry: handoff.industry || '' } });
      } catch (e: any) {
        onAutoError?.(e.message || '文案生成失败');
      }
    }
    autoRun();
  }, [autoExecute, handoff.topic, handoff.text, handoff.style, handoff.industry, contentType, onComplete, onAutoError]);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const ct = CONTENT_TYPES.find((c) => c.id === contentType);
      const res = await apiClient.post<{ content: string }>('/ai/copywriting', {
        inspirations: [{ title: topic.trim(), originalText: topic.trim() }],
        type: contentType,
        style: ct?.label || handoff.style || '',
        industry: handoff.industry || '',
        userInstruction: role ? `${role}\n${ct?.promptHint || ''}` : (ct?.promptHint || ''),
      });
      if (!res.success) throw new Error(res.error);
      setResult(res.data!.content);
    } catch (e: any) {
      setError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirm = async () => {
    if (!result) return;
    // Save to inspiration
    await fetch('/api/inspiration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', title: topic, content: result }),
    });
    await onComplete({
      handoffData: { text: result.substring(0, 1000), topic, style: contentType, industry: handoff.industry || '' },
    });
  };

  return (
    <div className="space-y-3">
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="输入话题或主题..."
        className="w-full px-3 py-2.5 rounded-lg text-sm"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
      />

      <div className="flex gap-2 flex-wrap">
        {CONTENT_TYPES.map((ct) => (
          <button
            key={ct.id}
            onClick={() => setContentType(ct.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: contentType === ct.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
              border: contentType === ct.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
              color: contentType === ct.id ? '#60A5FA' : '#9CA3AF',
            }}
          >
            {ct.label}
          </button>
        ))}
      </div>

      {!result ? (
        <button
          onClick={handleGenerate}
          disabled={!topic.trim() || generating || isCompleting}
          className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{
            background: topic.trim() ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)' : 'rgba(255,255,255,0.06)',
            color: topic.trim() ? '#FFFFFF' : '#4B5563',
          }}
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {generating ? '生成中...' : '生成文案'}
        </button>
      ) : (
        <div className="space-y-2">
          <div
            className="p-3 rounded-lg text-sm max-h-60 overflow-y-auto leading-relaxed"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#E5E7EB' }}
          >
            {result}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(result); }}
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
            >
              <Copy size={12} /> 复制
            </button>
            <button
              onClick={handleConfirm}
              disabled={isCompleting}
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-semibold"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF' }}
            >
              {isCompleting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              确认，进入下一步
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
                onClick={() => { setTopic(item.title); setResult(item.content || ''); }}
                className="w-full text-left px-2.5 py-2 rounded-lg transition-all hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <p style={{ color: '#E5E7EB', fontSize: 11 }} className="truncate">{item.title || 'AI 生成文案'}</p>
                <span style={{ color: '#6B7280', fontSize: 10 }}>{item.time}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
