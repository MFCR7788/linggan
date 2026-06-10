'use client';

// 交互式选项卡片 — 解析 LLM 输出的 <choices> 标签，渲染为可勾选的卡片
// 选择状态通过 onChange 上报父组件，由父组件统一处理提交

import { useState, useCallback } from 'react';
import { parseChoices, type ChoiceBlock, type ChoiceOption } from '@/lib/agent/choice-parser';

export { parseChoices, type ChoiceBlock, type ChoiceOption } from '@/lib/agent/choice-parser';

export interface ChoiceSelection {
  options: ChoiceOption[];
  customInput: string;
}

interface ChoiceCardsProps {
  block: ChoiceBlock;
  onChange: (selection: ChoiceSelection) => void;
}

export function ChoiceCards({ block, onChange }: ChoiceCardsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState('');

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

  return (
    <div className="my-2 space-y-1.5">
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

      {/* 自定义输入行 — 用户输入即自动勾选 */}
      <div
        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-150 ${
          selected.has('__custom__')
            ? 'bg-blue-500/20 border border-blue-400/40'
            : 'bg-white/5 border border-white/10'
        }`}
      >
        <div
          onClick={toggleCustomCheck}
          className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
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
          type="text"
          value={customInput}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="其他（自定义输入）"
          className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/30 outline-none"
        />
      </div>
    </div>
  );
}
