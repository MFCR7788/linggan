'use client';

import { ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { STYLE_PRESETS } from '@/lib/style-constants';
import { QUALITY_TIERS, type QualityTier } from '@/lib/video-models';
import { LANGUAGE_OPTIONS } from '@/lib/style-constants';

const DURATION_OPTIONS = [
  { value: 10, label: '10秒', desc: '1段, 约3分钟' },
  { value: 15, label: '15秒', desc: '2段, 约5分钟' },
  { value: 30, label: '30秒', desc: '3段, 约5分钟' },
  { value: 60, label: '60秒', desc: '6段, 约8分钟' },
];

function getModelDisplayName(model: string): string {
  if (model.includes('wan')) return 'Wan 2.6';
  if (model.includes('happyhorse')) return 'HappyHorse';
  if (model.includes('fast')) return 'Seedance Fast';
  if (model.includes('1-5-pro')) return 'Seedance 1.5 Pro';
  if (model.includes('lite')) return 'Seedance Lite';
  return model.substring(0, 14);
}

export interface VideoParamsPanelProps {
  stylePreset: string;
  setStylePreset: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  qualityTier: string;
  setQualityTier: (v: string) => void;
  language: string;
  setLanguage: (v: string) => void;
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean) => void;
}

const stylePresets = Object.entries(STYLE_PRESETS);

export function VideoParamsPanel({
  stylePreset,
  setStylePreset,
  duration,
  setDuration,
  qualityTier,
  setQualityTier,
  language,
  setLanguage,
  advancedOpen,
  setAdvancedOpen,
}: VideoParamsPanelProps) {
  return (
    <>
      {/* 风格预设 */}
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#8B5CF6' }}>风格</span> · 视频风格预设
        </p>
        <div className="grid grid-cols-3 gap-2">
          {stylePresets.map(([key, preset]) => (
            <button
              key={key}
              onClick={() => setStylePreset(key)}
              className="flex flex-col items-center gap-1 p-3 rounded-xl transition-all"
              style={{
                background: stylePreset === key ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
                border: stylePreset === key ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span style={{ fontSize: 22 }}>{preset.icon}</span>
              <span style={{ color: stylePreset === key ? '#C4B5FD' : '#E5E7EB', fontSize: 12, fontWeight: 600 }}>
                {preset.label}
              </span>
              <span style={{ color: '#9CA3AF', fontSize: 10 }}>推荐{preset.recDuration}s</span>
            </button>
          ))}
        </div>
        <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8 }}>
          风格预设会自动匹配 BGM 和字幕样式
        </p>
      </GlassCard>

      {/* 时长选择 */}
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#22C55E' }}>时长</span> · 选择视频长度
        </p>
        <div className="grid grid-cols-4 gap-2">
          {DURATION_OPTIONS.map(({ value, label, desc }) => (
            <button key={value}
              onClick={() => setDuration(value as 10 | 15 | 30 | 60)}
              className="flex flex-col items-center py-3 rounded-xl transition-all"
              style={{
                background: duration === value ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
                border: duration === value ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.1)',
              }}>
              <span style={{ color: duration === value ? '#86EFAC' : '#E5E7EB', fontSize: 16, fontWeight: 700 }}>{label}</span>
              <span style={{ color: '#9CA3AF', fontSize: 9 }}>{desc}</span>
            </button>
          ))}
        </div>
      </GlassCard>

      {/* 高级设置折叠 */}
      <div
        className="p-3 rounded-xl cursor-pointer transition-all"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={() => setAdvancedOpen(!advancedOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={14} color="#9CA3AF" />
            <span style={{ color: '#9CA3AF', fontSize: 13 }}>高级设置</span>
            <span style={{ color: '#6B7280', fontSize: 10 }}>
              {qualityTier === 'standard' ? '标准画质' : qualityTier === 'high' ? '高清画质' : '超高清'} · {LANGUAGE_OPTIONS.find(l => l.value === language)?.nativeLabel || '中文'}
            </span>
          </div>
          {advancedOpen ? <ChevronUp size={14} color="#9CA3AF" /> : <ChevronDown size={14} color="#9CA3AF" />}
        </div>
        {advancedOpen && (
          <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {/* 画质档位 */}
            <div>
              <p style={{ color: '#F59E0B', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>画质档位</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.values(QUALITY_TIERS).map((tier: QualityTier) => {
                  const t2vName = getModelDisplayName(tier.t2v.model);
                  const i2vName = getModelDisplayName(tier.i2v.model);
                  return (
                    <button
                      key={tier.value}
                      onClick={(e) => { e.stopPropagation(); setQualityTier(tier.value); }}
                      className="flex flex-col items-center gap-1 p-2.5 rounded-xl transition-all relative"
                      style={{
                        background: qualityTier === tier.value ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                        border: qualityTier === tier.value ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{tier.icon}</span>
                      {tier.recommended && (
                        <span style={{
                          background: 'linear-gradient(135deg, #F59E0B 0%, #F97316 100%)',
                          color: '#FFFFFF',
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: 4,
                          position: 'absolute',
                          top: -4,
                          right: -4,
                        }}>推荐</span>
                      )}
                      <span style={{
                        color: qualityTier === tier.value ? '#FCD34D' : '#E5E7EB',
                        fontSize: 13, fontWeight: 700,
                      }}>
                        {tier.label}
                      </span>
                      <span style={{ color: '#9CA3AF', fontSize: 9 }}>{tier.description}</span>
                      <span style={{
                        color: qualityTier === tier.value ? '#FCD34D' : '#6B7280',
                        fontSize: 9, lineHeight: 1.4, textAlign: 'center',
                      }}>
                        {t2vName}<br />{i2vName}
                      </span>
                      <span style={{
                        color: qualityTier === tier.value ? '#FCD34D' : '#6B7280',
                        fontSize: 9, fontWeight: 600,
                      }}>
                        {tier.t2v.price}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* 语言选择 */}
            <div>
              <p style={{ color: '#3B82F6', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>字幕语言</p>
              <div className="grid grid-cols-4 gap-2">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <button
                    key={lang.value}
                    onClick={(e) => { e.stopPropagation(); setLanguage(lang.value); }}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all"
                    style={{
                      background: language === lang.value ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                      border: language === lang.value ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{lang.icon}</span>
                    <span style={{ color: language === lang.value ? '#93C5FD' : '#9CA3AF', fontSize: 11 }}>
                      {lang.nativeLabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
