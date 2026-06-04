'use client';

import { useState } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import type { RecommendationCombo, LingjiEntry } from '@/lib/account-presets';

const CUSTOM_COMBOS_KEY = 'lingji_custom_combos';

// 可用步骤
const AVAILABLE_STEPS: { label: string; entry: LingjiEntry; emoji: string; color: string }[] = [
  { label: '选素材/灵感', entry: '/inspiration', emoji: '📁', color: '#F59E0B' },
  { label: 'AI 写文案', entry: '/ai/copywriting', emoji: '✍️', color: '#3B82F6' },
  { label: 'AI 生图', entry: '/ai/image', emoji: '🖼️', color: '#8B5CF6' },
  { label: 'AI 图片编辑', entry: '/ai/image-editor', emoji: '✂️', color: '#A78BFA' },
  { label: 'AI 视频合成', entry: '/ai/video', emoji: '🎬', color: '#F43F5E' },
  { label: 'AI 数字人', entry: '/ai/digital-human', emoji: '🎙️', color: '#06B6D4' },
  { label: 'AI 配音', entry: '/ai/tts', emoji: '🔊', color: '#22C55E' },
  { label: '9 宫格', entry: '/ai/ads', emoji: '🟪', color: '#F59E0B' },
  { label: '热点选题', entry: '/hotspot', emoji: '🔥', color: '#EF4444' },
  { label: '多平台分发', entry: '/publish', emoji: '📤', color: '#EC4899' },
];

const EMOJI_OPTIONS = ['🚀', '✨', '🎯', '💡', '🔥', '🌟', '📱', '🎬', '📦', '🛠️'];

export function getCustomCombos(): RecommendationCombo[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_COMBOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomCombos(combos: RecommendationCombo[]) {
  try {
    localStorage.setItem(CUSTOM_COMBOS_KEY, JSON.stringify(combos));
  } catch {}
}

interface Props {
  onSave: (combo: RecommendationCombo) => void;
  onClose: () => void;
}

export function CustomComboBuilder({ onSave, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [emoji, setEmoji] = useState('🚀');
  const [selectedSteps, setSelectedSteps] = useState<number[]>([]);

  const toggleStep = (idx: number) => {
    if (selectedSteps.includes(idx)) {
      setSelectedSteps(selectedSteps.filter((i) => i !== idx));
    } else if (selectedSteps.length < 5) {
      setSelectedSteps([...selectedSteps, idx].sort((a, b) => a - b));
    }
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const pos = selectedSteps.indexOf(idx);
    if (pos === -1) return;
    const newArr = [...selectedSteps];
    const newPos = pos + dir;
    if (newPos < 0 || newPos >= newArr.length) return;
    [newArr[pos], newArr[newPos]] = [newArr[newPos], newArr[pos]];
    setSelectedSteps(newArr);
  };

  const handleSave = () => {
    if (!title.trim() || selectedSteps.length < 2) return;
    const combo: RecommendationCombo = {
      id: `custom_${Date.now()}`,
      title: title.trim(),
      emoji,
      desc: desc.trim() || `${selectedSteps.length} 步自定义流程`,
      steps: selectedSteps.map((idx) => ({
        label: AVAILABLE_STEPS[idx].label,
        entry: AVAILABLE_STEPS[idx].entry,
      })),
    };
    const existing = getCustomCombos();
    saveCustomCombos([...existing, combo]);
    onSave(combo);
  };

  const valid = title.trim() && selectedSteps.length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl px-4 py-5 space-y-4"
        style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700 }}>创建自定义方案</p>
          <button onClick={onClose} className="p-1"><X size={18} color="#9CA3AF" /></button>
        </div>

        {/* 名称 + 描述 */}
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="方案名称，如：我的日常发布流程"
            className="w-full px-3 py-2.5 rounded-lg text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF' }}
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="一句话描述（可选）"
            className="w-full px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#E5E7EB' }}
          />
        </div>

        {/* Emoji 选择 */}
        <div>
          <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>选择图标</p>
          <div className="flex gap-2 flex-wrap">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                style={{
                  background: emoji === e ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${emoji === e ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* 步骤选择 */}
        <div>
          <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
            选择步骤（按顺序，至少选 2 个）
          </p>
          <div className="space-y-1.5">
            {AVAILABLE_STEPS.map((step, idx) => {
              const isSelected = selectedSteps.includes(idx);
              const pos = selectedSteps.indexOf(idx);
              return (
                <button
                  key={step.entry}
                  onClick={() => toggleStep(idx)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                  style={{
                    background: isSelected ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{step.emoji}</span>
                  <span style={{ color: isSelected ? '#E5E7EB' : '#9CA3AF', fontSize: 13, flex: 1 }}>
                    {step.label}
                  </span>
                  {isSelected && (
                    <div className="flex items-center gap-1">
                      <span style={{ color: '#A78BFA', fontSize: 11, fontWeight: 700 }}>#{pos + 1}</span>
                      {pos > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); moveStep(idx, -1); }} className="p-0.5" title="上移">
                          <span style={{ color: '#6B7280', fontSize: 14 }}>↑</span>
                        </button>
                      )}
                      {pos < selectedSteps.length - 1 && (
                        <button onClick={(e) => { e.stopPropagation(); moveStep(idx, 1); }} className="p-0.5" title="下移">
                          <span style={{ color: '#6B7280', fontSize: 14 }}>↓</span>
                        </button>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 预览 */}
        {selectedSteps.length > 0 && (
          <GlassCard className="!p-3">
            <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>流程预览</p>
            <div className="flex items-center gap-1 flex-wrap">
              {selectedSteps.map((idx, i) => (
                <span key={idx} className="flex items-center gap-1">
                  <span style={{ color: '#E5E7EB', fontSize: 14 }}>{AVAILABLE_STEPS[idx].emoji}</span>
                  <span style={{ color: '#9CA3AF', fontSize: 10 }}>{AVAILABLE_STEPS[idx].label}</span>
                  {i < selectedSteps.length - 1 && <span style={{ color: '#4B5563', fontSize: 10 }}>→</span>}
                </span>
              ))}
            </div>
          </GlassCard>
        )}

        {/* 保存按钮 */}
        <button
          onClick={handleSave}
          disabled={!valid}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{
            background: valid
              ? 'linear-gradient(135deg, #F472B6, #8B5CF6)'
              : 'rgba(255,255,255,0.06)',
            color: valid ? '#FFFFFF' : '#4B5563',
          }}
        >
          <Save size={16} /> 保存方案
        </button>
      </div>
    </div>
  );
}
