'use client';
// 标题优化器 — 多平台标题生成

import React, { useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TopNav } from '@/components/TopNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { GlassCard } from '@/components/GlassCard';
import { useRouter } from 'next/navigation';
import { Copy, Check } from 'lucide-react';
import type { Platform, TitleType, PlatformTitles } from '@/lib/ai/title-optimizer';

const PLATFORM_OPTIONS: { value: Platform; label: string; emoji: string }[] = [
  { value: '抖音', label: '抖音', emoji: '📱' },
  { value: '小红书', label: '小红书', emoji: '📕' },
  { value: 'B站', label: 'B站', emoji: '🎬' },
  { value: '视频号', label: '视频号', emoji: '📺' },
  { value: '快手', label: '快手', emoji: '⚡' },
  { value: 'YouTube', label: 'YouTube', emoji: '🌍' },
];

const TYPE_OPTIONS: { value: TitleType; label: string }[] = [
  { value: '悬念型', label: '🔥 悬念' },
  { value: '信息型', label: '📊 信息' },
  { value: '情绪型', label: '😱 情绪' },
  { value: '痛点型', label: '🎯 痛点' },
  { value: '教程型', label: '🛠️ 教程' },
  { value: '对比型', label: '⚖️ 对比' },
  { value: '互动型', label: '💬 互动' },
];

export default function TitleOptimizerPageContent() {
  const router = useRouter();
  const [contentText, setContentText] = useState('');
  const [customContext, setCustomContext] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>(['抖音', '小红书', 'B站']);
  const [titleTypes, setTitleTypes] = useState<TitleType[]>(['悬念型', '信息型', '情绪型', '痛点型', '教程型']);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{ platforms: PlatformTitles[]; contentSummary: string; keywords: string[] } | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [error, setError] = useState('');

  const togglePlatform = (p: Platform) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleGenerate = useCallback(async () => {
    if (!contentText.trim()) return;
    setIsGenerating(true);
    setError('');

    try {
      const res = await fetch('/api/title-optimizer/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          contentText: contentText.trim(),
          platforms,
          titleTypes,
          customContext: customContext.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || '生成失败'); return; }
      setResult(data.data);
    } catch (e) {
      setError(`生成失败: ${e instanceof Error ? e.message : '网络错误'}`);
    } finally {
      setIsGenerating(false);
    }
  }, [contentText, platforms, titleTypes, customContext]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(key);
      setTimeout(() => setCopiedIndex(null), 1500);
    });
  };

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen bg-[#0A1629]">
        <TopNav title="标题优化" showBack onBack={() => router.push('/ai')} />

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
          {/* 输入 */}
          <GlassCard className="p-4">
            <h3 className="text-sm font-medium mb-2" style={{ color: '#E5E7EB' }}>输入内容</h3>
            <textarea
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              placeholder="粘贴视频文案或转写文本…"
              rows={4}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
            />
            <input
              type="text"
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              placeholder="额外信息：产品名、品牌调性…（可选）"
              className="w-full mt-2 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
            />
          </GlassCard>

          {/* 平台选择 */}
          <GlassCard className="p-4">
            <h3 className="text-sm font-medium mb-2" style={{ color: '#E5E7EB' }}>目标平台</h3>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => togglePlatform(p.value)}
                  className="px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: platforms.includes(p.value) ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${platforms.includes(p.value) ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    color: platforms.includes(p.value) ? '#93C5FD' : '#9CA3AF',
                  }}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          </GlassCard>

          {/* 错误 */}
          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}>
              {error}
            </div>
          )}

          {/* 生成按钮 */}
          <PrimaryButton fullWidth loading={isGenerating} disabled={!contentText.trim()} onClick={handleGenerate}>
            🪄 生成标题
          </PrimaryButton>

          {/* 结果 */}
          {result && (
            <div className="space-y-4">
              {/* 摘要 */}
              <GlassCard className="p-3">
                <div className="text-xs" style={{ color: '#9CA3AF' }}>
                  📝 {result.contentSummary}
                  {result.keywords.length > 0 && (
                    <span className="ml-2">
                      {result.keywords.map((k, i) => (
                        <span key={i} className="inline-block px-1.5 py-0.5 rounded mr-1" style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD' }}>{k}</span>
                      ))}
                    </span>
                  )}
                </div>
              </GlassCard>

              {/* 各平台标题 */}
              {result.platforms.map((pt) => {
                const platformInfo = PLATFORM_OPTIONS.find(p => p.value === pt.platform);
                return (
                  <GlassCard key={pt.platform} className="p-4">
                    <h3 className="text-sm font-medium mb-3" style={{ color: '#E5E7EB' }}>
                      {platformInfo?.emoji} {pt.platform}
                    </h3>
                    <div className="space-y-2">
                      {pt.candidates.map((c, i) => {
                        const key = `${pt.platform}-${i}`;
                        return (
                          <div key={key} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <span className="text-xs mt-0.5 px-1.5 py-0.5 rounded" style={{
                              background: c.score >= 4 ? 'rgba(52,211,153,0.2)' : 'rgba(251,191,36,0.2)',
                              color: c.score >= 4 ? '#34D399' : '#FBBF24',
                            }}>
                              {'★'.repeat(c.score)}{'☆'.repeat(5 - c.score)}
                            </span>
                            <div className="flex-1">
                              <div className="text-sm" style={{ color: '#E5E7EB' }}>{c.text}</div>
                              <div className="text-[11px] mt-0.5" style={{ color: '#6B7280' }}>
                                {c.type} {c.reasoning && `· ${c.reasoning}`}
                              </div>
                            </div>
                            <button
                              onClick={() => handleCopy(c.text, key)}
                              className="p-1 rounded hover:bg-white/10"
                            >
                              {copiedIndex === key
                                ? <Check size={14} style={{ color: '#34D399' }} />
                                : <Copy size={14} style={{ color: '#9CA3AF' }} />
                              }
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
