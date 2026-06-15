'use client';

import { getFilterButtonStyle } from '@/lib/style-constants';

export type ClipMode = 'auto' | 'silence_only' | 'by_description' | 'by_time_ranges';
export type SliceMode = 'product' | 'highlight' | 'topic' | 'uniform' | 'custom';

const CLIP_MODES: { value: ClipMode; label: string; desc: string }[] = [
  { value: 'auto', label: '智能分析', desc: '自动检测静音、口水词、重复' },
  { value: 'silence_only', label: '仅去静音', desc: '只删除静音段落' },
  { value: 'by_description', label: '按描述', desc: '用自然语言描述要保留/删除的内容' },
  { value: 'by_time_ranges', label: '按时间', desc: '手动指定删除时间段' },
];

const SLICE_MODES: { value: SliceMode; label: string; desc: string }[] = [
  { value: 'product', label: '产品讲解', desc: 'AI 识别产品介绍段落' },
  { value: 'highlight', label: '高能片段', desc: '提取精彩/高能时刻' },
  { value: 'topic', label: '话题分割', desc: '按语义话题拆分' },
  { value: 'uniform', label: '均分切片', desc: '按固定时长均匀切分' },
  { value: 'custom', label: '关键词', desc: '按关键词匹配切片' },
];

interface Props {
  direction: 'clip' | 'slice';
  clipMode: ClipMode;
  sliceMode: SliceMode;
  onClipModeChange: (mode: ClipMode) => void;
  onSliceModeChange: (mode: SliceMode) => void;
}

export function ModeSelector({
  direction,
  clipMode,
  sliceMode,
  onClipModeChange,
  onSliceModeChange,
}: Props) {
  const modes = direction === 'clip' ? CLIP_MODES : SLICE_MODES;
  const current = direction === 'clip' ? clipMode : sliceMode;

  return (
    <div>
      <h3 className="text-sm font-medium mb-2" style={{ color: '#E5E7EB' }}>
        {direction === 'clip' ? '剪辑模式' : '切片模式'}
      </h3>
      <div className="flex flex-wrap gap-2">
        {modes.map((m) => {
          const active = current === m.value;
          return (
            <button
              key={m.value}
              onClick={() => {
                if (direction === 'clip') onClipModeChange(m.value as ClipMode);
                else onSliceModeChange(m.value as SliceMode);
              }}
              className="px-3 py-2 rounded-lg text-left transition-all"
              style={getFilterButtonStyle(active)}
              title={m.desc}
            >
              <div className="text-xs font-medium">{m.label}</div>
              <div className="text-[10px] mt-0.5" style={{ color: active ? '#93C5FD' : '#6B7280' }}>
                {m.desc}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
