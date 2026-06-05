'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { StepWidgetProps } from '../StepWidgetRegistry';

const PLATFORM_LIST = [
  { id: 'wechat_mp' as const, name: '公众号', emoji: '📰', color: '#07C160', autoPublish: true },
  { id: 'weibo' as const, name: '微博', emoji: '🔴', color: '#E6162D', autoPublish: true },
  { id: 'douyin' as const, name: '抖音', emoji: '🎵', color: '#010101', autoPublish: false },
  { id: 'xiaohongshu' as const, name: '小红书', emoji: '📕', color: '#FE2C55', autoPublish: false },
  { id: 'wechat_video' as const, name: '视频号', emoji: '🎬', color: '#FA9D3B', autoPublish: false },
  { id: 'bilibili' as const, name: 'B站', emoji: '📺', color: '#00A1D6', autoPublish: false },
];

export function PublishStepWidget({ handoff, onComplete, isCompleting, autoExecute, onAutoError }: StepWidgetProps) {
  const title = handoff.topic || handoff.prompt || '';
  const content = handoff.text || handoff.script || '';
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<Array<{ platform: string; success: boolean; msg: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoTriggeredRef = useRef(false);

  useEffect(() => { if (!autoExecute) { autoTriggeredRef.current = false; } }, [autoExecute]);

  useEffect(() => {
    if (!autoExecute || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    async function autoRun() {
      const t = (handoff.topic || handoff.prompt || '').trim();
      const c = (handoff.text || handoff.script || '').trim();
      if (!c && !t) {
        // No content to publish, just complete
        await onComplete({ handoffData: {} });
        return;
      }
      try {
        for (const p of PLATFORM_LIST) {
          if (p.autoPublish) {
            await apiClient.post('/platforms/publish', { platform: p.id, title: t || '未命名内容', content: c });
          } else {
            await apiClient.post('/platforms/publish-manual', { platform: p.id, title: t || '未命名内容', content: c });
          }
        }
        await onComplete({ handoffData: {} });
      } catch (e: any) {
        onAutoError?.(e.message || '发布失败');
      }
    }
    autoRun();
  }, [autoExecute, handoff.topic, handoff.prompt, handoff.text, handoff.script, onComplete, onAutoError]);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePublish = async () => {
    if (selectedPlatforms.size === 0) return;
    setPublishing(true);
    setError(null);
    const platformResults: Array<{ platform: string; success: boolean; msg: string }> = [];

    try {
      for (const pId of selectedPlatforms) {
        const platform = PLATFORM_LIST.find((p) => p.id === pId);
        if (!platform) continue;

        if (platform.autoPublish) {
          const res = await apiClient.post<{ externalUrl: string }>('/platforms/publish', {
            platform: pId,
            title: title.trim() || '未命名内容',
            content: content.trim(),
          });
          platformResults.push({
            platform: platform.name,
            success: res.success,
            msg: res.success ? '已发布' : (res.error || '发布失败'),
          });
        } else {
          const res = await apiClient.post<{ publication: { id: string } }>('/platforms/publish-manual', {
            platform: pId,
            title: title.trim() || '未命名内容',
            content: content.trim(),
          });
          platformResults.push({
            platform: platform.name,
            success: res.success,
            msg: res.success ? '草稿已创建' : (res.error || '创建失败'),
          });
        }
      }
      setResults(platformResults);
    } catch (e: any) {
      setError(e.message || '发布失败');
    } finally {
      setPublishing(false);
    }
  };

  const handleComplete = async () => {
    await onComplete({ handoffData: {} });
  };

  return (
    <div className="space-y-3">
      {(title || content) && (
        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {title && <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{title}</p>}
          {content && (
            <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.5 }} className="line-clamp-3">
              {content}
            </p>
          )}
        </div>
      )}

      <p style={{ color: '#9CA3AF', fontSize: 11 }}>选择发布平台</p>
      <div className="grid grid-cols-3 gap-2">
        {PLATFORM_LIST.map((p) => {
          const isSelected = selectedPlatforms.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => togglePlatform(p.id)}
              disabled={publishing || !!results}
              className="p-2 rounded-lg flex flex-col items-center gap-1 transition-all"
              style={{
                background: isSelected ? `${p.color}22` : 'rgba(255,255,255,0.03)',
                border: isSelected ? `1px solid ${p.color}88` : '1px solid rgba(255,255,255,0.08)',
                opacity: publishing || results ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: 18 }}>{p.emoji}</span>
              <span style={{ color: isSelected ? '#FFFFFF' : '#9CA3AF', fontSize: 10, fontWeight: 600 }}>{p.name}</span>
              <span style={{ color: '#6B7280', fontSize: 8 }}>{p.autoPublish ? '自动' : '手动'}</span>
            </button>
          );
        })}
      </div>

      {!results ? (
        <button
          onClick={handlePublish}
          disabled={selectedPlatforms.size === 0 || publishing || isCompleting}
          className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{
            background: selectedPlatforms.size > 0 ? 'linear-gradient(135deg, #3B82F6, #2563EB)' : 'rgba(255,255,255,0.06)',
            color: selectedPlatforms.size > 0 ? '#FFFFFF' : '#4B5563',
          }}
        >
          {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {publishing ? '发布中...' : `发布到 ${selectedPlatforms.size} 个平台`}
        </button>
      ) : (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{
                background: r.success ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${r.success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
              }}
            >
              {r.success ? <CheckCircle2 size={14} color="#4ADE80" /> : <AlertCircle size={14} color="#FCA5A5" />}
              <span style={{ color: r.success ? '#86EFAC' : '#FCA5A5' }}>{r.platform}: {r.msg}</span>
            </div>
          ))}
          <button
            onClick={handleComplete}
            disabled={isCompleting}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF' }}
          >
            {isCompleting ? <Loader2 size={16} className="animate-spin" /> : null}
            完成工作流
          </button>
        </div>
      )}

      {error && <p style={{ color: '#FCA5A5', fontSize: 11 }}>{error}</p>}
    </div>
  );
}
