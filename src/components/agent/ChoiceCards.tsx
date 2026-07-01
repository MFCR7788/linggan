'use client';

// 交互式选项卡片 — 解析 LLM 输出的 <choices> 标签，渲染为可勾选的卡片
// 选择状态通过 onChange 上报父组件，由父组件统一处理提交
// 当 choice block 有 type="image" 或 type="video" 时，额外渲染"从本地选择"/"从灵感库选择"按钮

import { useState, useCallback, useRef } from 'react';
import { Image, FolderOpen, Film } from 'lucide-react';
import { parseChoices, type ChoiceBlock, type ChoiceOption } from '@/lib/agent/choice-parser';

export { parseChoices, type ChoiceBlock, type ChoiceOption } from '@/lib/agent/choice-parser';

export interface ChoiceSelection {
  options: ChoiceOption[];
  customInput: string;
}

interface ChoiceCardsProps {
  block: ChoiceBlock;
  onChange: (selection: ChoiceSelection) => void;
  /** 用户点击"从本地选择"时的回调，父组件负责打开文件选择器并处理上传 */
  onPickLocal?: () => void;
  /** 用户点击"从灵感库选择"时的回调，父组件负责打开 InspirationPicker */
  onPickInspiration?: () => void;
}

export function ChoiceCards({ block, onChange, onPickLocal, onPickInspiration }: ChoiceCardsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState('');
  const customInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((sel: Set<string>, input: string) => {
    const opts = block.options.filter(o => sel.has(o.id));
    onChange({ options: opts, customInput: input });
  }, [block.options, onChange]);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (block.multi) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      notify(next, customInput);
      return next;
    });
  }, [block.multi, customInput, notify]);

  const handleCustomChange = useCallback((value: string) => {
    setCustomInput(value);
    setSelected(prev => {
      const next = new Set(prev);
      if (value.trim()) {
        next.add('__custom__');
      } else {
        next.delete('__custom__');
      }
      notify(next, value);
      return next;
    });
  }, [notify]);

  const toggleCustomCheck = useCallback(() => {
    if (!customInput.trim()) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has('__custom__')) {
        next.delete('__custom__');
      } else {
        next.add('__custom__');
      }
      notify(next, customInput);
      return next;
    });
  }, [customInput, notify]);

  const mediaType = block.type; // 'image' | 'video' | undefined

  return (
    <div className="my-2 space-y-1.5">
      {/* 媒体选择按钮 — 当 block.type 为 image/video 时显示 */}
      {mediaType && (onPickLocal || onPickInspiration) && (
        <div className="flex gap-2 mb-2">
          {onPickLocal && (
            <button
              onClick={onPickLocal}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-all active:scale-[0.98] hover:brightness-110"
              style={{
                background: mediaType === 'image'
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.1))'
                  : 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.1))',
                border: mediaType === 'image'
                  ? '1px solid rgba(245,158,11,0.3)'
                  : '1px solid rgba(139,92,246,0.3)',
                color: mediaType === 'image' ? '#FCD34D' : '#C4B5FD',
              }}
            >
              {/* eslint-disable-next-line jsx-a11y/alt-text -- lucide-react decorative icon */}
              <Image size={14} />
              从本地选择
            </button>
          )}
          {onPickInspiration && (
            <button
              onClick={onPickInspiration}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-all active:scale-[0.98] hover:brightness-110"
              style={{
                background: mediaType === 'image'
                  ? 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.1))'
                  : 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.1))',
                border: mediaType === 'image'
                  ? '1px solid rgba(59,130,246,0.3)'
                  : '1px solid rgba(139,92,246,0.3)',
                color: mediaType === 'image' ? '#93C5FD' : '#C4B5FD',
              }}
            >
              <FolderOpen size={14} />
              从灵感库选择
            </button>
          )}
        </div>
      )}

      {/* 文字选项卡片 */}
      {block.options.map((opt) => {
        const isSelected = selected.has(opt.id);
        return (
          <button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-150 active:scale-[0.98] ${
              isSelected
                ? 'bg-blue-500/20 border border-blue-400/40'
                : 'bg-white/5 border border-white/10 hover:bg-white/8'
            }`}
          >
            <div
              className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-colors ${
                isSelected
                  ? 'bg-blue-500 border-blue-500'
                  : 'border border-white/30'
              }`}
            >
              {isSelected && (
                block.multi ? (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )
              )}
            </div>

            <div className="flex-1 min-w-0">
              <span className={`text-sm ${isSelected ? 'text-blue-200' : 'text-white/80'}`}>
                {opt.label}
              </span>
              {opt.description && (
                <p className="text-xs text-white/40 mt-0.5">{opt.description}</p>
              )}
            </div>

            {isSelected && (
              <span className="text-[10px] text-blue-400 flex-shrink-0">
                {block.multi ? '已选' : '✓'}
              </span>
            )}
          </button>
        );
      })}

      {/* 自定义输入行 */}
      <div
        onClick={(e) => {
          if (!(e.target instanceof HTMLInputElement)) {
            customInputRef.current?.focus();
          }
        }}
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-text ${
          selected.has('__custom__')
            ? 'bg-blue-500/20 border border-blue-400/40'
            : 'bg-white/5 border border-white/10 hover:bg-white/8'
        }`}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
            toggleCustomCheck();
          }}
          className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
            selected.has('__custom__')
              ? 'bg-blue-500 border-blue-500'
              : 'border border-white/30'
          }`}
        >
          {selected.has('__custom__') && (
            block.multi ? (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <div className="w-2 h-2 rounded-full bg-white" />
            )
          )}
        </div>
        <input
          ref={customInputRef}
          type="text"
          value={customInput}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="其他（自定义输入，可自行填写）"
          className="flex-1 min-w-0 bg-transparent text-sm text-white/80 placeholder-white/30 outline-none"
        />
      </div>
    </div>
  );
}
