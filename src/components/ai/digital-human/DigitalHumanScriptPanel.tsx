'use client';

import { useState } from 'react';
import { Wand2, FileText, Loader2 } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { apiClient } from '@/lib/api-client';
import { ORAL_STYLES, LANGUAGES } from '@/components/ai/digital-human/types';

export interface DigitalHumanScriptPanelProps {
  s2vScriptSource: 'ai' | 'manual';
  onScriptSourceChange: (v: 'ai' | 'manual') => void;
  aiTopic: string;
  onAiTopicChange: (v: string) => void;
  aiStyle: string;
  onAiStyleChange: (v: string) => void;
  aiLength: number;
  onAiLengthChange: (v: number) => void;
  ttsText: string;
  onTtsTextChange: (text: string) => void;
  targetLang: string;
  onTargetLangChange: (lang: string) => void;
  onToast: (message: string, type: 'success' | 'error') => void;
}

export function DigitalHumanScriptPanel({
  s2vScriptSource,
  onScriptSourceChange,
  aiTopic,
  onAiTopicChange,
  aiStyle,
  onAiStyleChange,
  aiLength,
  onAiLengthChange,
  ttsText,
  onTtsTextChange,
  targetLang,
  onTargetLangChange,
  onToast,
}: DigitalHumanScriptPanelProps) {
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScripts, setGeneratedScripts] = useState<string[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);

  const handleGenerateScript = async () => {
    if (!aiTopic.trim()) { onToast('请输入主题', 'error'); return; }
    setIsGeneratingScript(true);
    setGeneratedScripts([]);
    try {
      const res = await apiClient.post<{ scripts: string[] }>('/ai/digital-human/script', {
        topic: aiTopic, style: aiStyle, targetLength: aiLength,
        variantCount: 3, language: targetLang,
      });
      const scripts = res.data?.scripts;
      if (res.success && scripts && scripts.length > 0) {
        setGeneratedScripts(scripts);
        setSelectedVariant(0);
        onTtsTextChange(scripts[0]);
      } else {
        onToast(res.error || '脚本生成失败', 'error');
      }
    } catch {
      onToast('脚本生成请求失败', 'error');
    }
    setIsGeneratingScript(false);
  };

  const handleSelectVariant = (i: number) => {
    setSelectedVariant(i);
    onTtsTextChange(generatedScripts[i]);
  };

  return (
    <GlassCard>
      <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
        <span style={{ color: '#3B82F6' }}>脚本</span> · 口播内容
      </p>
      <div className="flex rounded-lg overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {([
          { key: 'ai' as const, label: 'AI 写稿', icon: <Wand2 size={12} /> },
          { key: 'manual' as const, label: '自己写', icon: <FileText size={12} /> },
        ]).map(({ key, label, icon }) => (
          <button key={key} onClick={() => onScriptSourceChange(key)}
            className="flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-all"
            style={{
              background: s2vScriptSource === key ? 'rgba(59,130,246,0.2)' : 'transparent',
              color: s2vScriptSource === key ? '#93C5FD' : '#9CA3AF',
              fontWeight: s2vScriptSource === key ? 600 : 400,
            }}>{icon} {label}</button>
        ))}
      </div>

      {s2vScriptSource === 'ai' ? (
        <div className="space-y-3">
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>主题</p>
            <input value={aiTopic} onChange={e => onAiTopicChange(e.target.value)}
              placeholder="输入主题，例如：AI如何改变教育"
              className="w-full bg-transparent px-3 py-2 rounded-xl text-sm outline-none"
              style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>风格</p>
              <div className="grid grid-cols-2 gap-1">
                {ORAL_STYLES.map(({ key, label }) => (
                  <button key={key} onClick={() => onAiStyleChange(key)}
                    className="py-1.5 rounded-lg text-xs transition-all"
                    style={{
                      background: aiStyle === key ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                      border: aiStyle === key ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      color: aiStyle === key ? '#93C5FD' : '#9CA3AF',
                    }}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>语言</p>
              <div className="grid grid-cols-2 gap-1">
                {LANGUAGES.map(({ key, label }) => (
                  <button key={key} onClick={() => onTargetLangChange(key)}
                    className="py-1.5 rounded-lg text-xs transition-all"
                    style={{
                      background: targetLang === key ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                      border: targetLang === key ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      color: targetLang === key ? '#93C5FD' : '#9CA3AF',
                    }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span style={{ color: '#9CA3AF', fontSize: 11 }}>字数</span>
              <span style={{ color: '#93C5FD', fontSize: 11 }}>{aiLength}字 · ≈{Math.ceil(aiLength / 5)}秒</span>
            </div>
            <input type="range" min="50" max="400" step="10" value={aiLength}
              onChange={e => onAiLengthChange(parseInt(e.target.value))} className="w-full accent-blue-500" />
          </div>
          <PrimaryButton size="md" onClick={handleGenerateScript} disabled={isGeneratingScript || !aiTopic.trim()}>
            {isGeneratingScript ? <><Loader2 size={14} className="animate-spin" /> 生成中...</> : <><Wand2 size={14} /> AI 生成脚本</>}
          </PrimaryButton>
          {generatedScripts.length > 0 && (
            <div className="space-y-2">
              <p style={{ color: '#9CA3AF', fontSize: 11 }}>选择脚本变体</p>
              {generatedScripts.map((s, i) => (
                <div key={i} onClick={() => handleSelectVariant(i)}
                  className="p-3 rounded-xl cursor-pointer text-sm transition-all"
                  style={{
                    background: selectedVariant === i ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
                    border: selectedVariant === i ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    color: '#E5E7EB', maxHeight: 120, overflowY: 'auto',
                  }}>
                  <span style={{ color: selectedVariant === i ? '#93C5FD' : '#9CA3AF', fontSize: 10, fontWeight: 600 }}>
                    变体 {i + 1} {selectedVariant === i ? '✓' : ''}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap" style={{ lineHeight: 1.5 }}>{s}</p>
                </div>
              ))}
            </div>
          )}
          {targetLang !== 'zh' && (
            <p style={{ color: '#FBBF24', fontSize: 10 }}>⚠ 当前音色为中文音色，非中文文本朗读可能带口音</p>
          )}
        </div>
      ) : (
        <textarea value={ttsText} onChange={e => onTtsTextChange(e.target.value)}
          placeholder="直接输入或粘贴口播脚本..."
          rows={5}
          className="w-full bg-transparent p-3 rounded-xl resize-none outline-none text-sm"
          style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
      )}
    </GlassCard>
  );
}
