'use client';

// 能力标签栏 — 在输入框下方展示 Agent 可用能力，点击快速填入输入框

export interface Capability {
  label: string;
  prompt: string;
  icon?: string;
}

const DEFAULT_CAPABILITIES: Capability[] = [
  { label: '写文案', prompt: '帮我写一篇', icon: '✍️' },
  { label: '生成图片', prompt: '帮我生成一张', icon: '🎨' },
  { label: '做视频', prompt: '帮我做一个视频，主题是', icon: '🎬' },
  { label: '数字人', prompt: '帮我生成数字人口播视频，主题是', icon: '🤖' },
  { label: '查热点', prompt: '帮我查看最近的热点话题', icon: '🔥' },
  { label: '搜灵感', prompt: '帮我搜索灵感库，关键词：', icon: '💡' },
  { label: '9宫格', prompt: '帮我制作朋友圈九宫格，主题是', icon: '🖼️' },
  { label: '语音合成', prompt: '帮我把这段文字转成语音：', icon: '🔊' },
];

interface CapabilityTagsProps {
  capabilities?: Capability[];
  onSelect: (prompt: string) => void;
}

export function CapabilityTags({
  capabilities = DEFAULT_CAPABILITIES,
  onSelect,
}: CapabilityTagsProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {capabilities.map((cap) => (
        <button
          key={cap.label}
          onClick={() => onSelect(cap.prompt)}
          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all duration-150 hover:scale-[1.02] active:scale-95"
          style={{
            background: 'rgba(59,130,246,0.15)',
            border: '1px solid rgba(59,130,246,0.25)',
            color: '#93C5FD',
          }}
        >
          {cap.icon && <span className="text-[11px]">{cap.icon}</span>}
          {cap.label}
        </button>
      ))}
    </div>
  );
}
