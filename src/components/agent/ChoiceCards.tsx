'use client';

// 交互式选项卡片 — 解析 LLM 输出的 <choices> 标签，渲染为可勾选的卡片
// 用户勾选后点击发送，选项传回 Agent

import { useState, useCallback } from 'react';
import { parseChoices, type ChoiceBlock, type ChoiceOption } from '@/lib/agent/choice-parser';

export { parseChoices, type ChoiceBlock, type ChoiceOption } from '@/lib/agent/choice-parser';

interface ChoiceCardsProps {
  block: ChoiceBlock;
  onSelect: (selected: ChoiceOption[]) => void;
  /** 是否正在提交 */
  submitting?: boolean;
}

export function ChoiceCards({ block, onSelect, submitting }: ChoiceCardsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (block.multi) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        // 单选模式
        next.clear();
        next.add(id);
      }
      return next;
    });
  }, [block.multi]);

  const handleSubmit = () => {
    const selectedOpts = block.options.filter(o => selected.has(o.id));
    if (selectedOpts.length === 0) return;
    onSelect(selectedOpts);
  };

  return (
    <div className="my-2 space-y-1.5">
      {block.options.map((opt) => {
        const isSelected = selected.has(opt.id);
        const isMulti = block.multi;
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
            {/* 勾选图标 */}
            <div
              className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-colors ${
                isSelected
                  ? 'bg-blue-500 border-blue-500'
                  : 'border border-white/30'
              }`}
            >
              {isSelected && (
                isMulti ? (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )
              )}
            </div>

            {/* 文本 */}
            <div className="flex-1 min-w-0">
              <span className={`text-sm ${isSelected ? 'text-blue-200' : 'text-white/80'}`}>
                {opt.label}
              </span>
              {opt.description && (
                <p className="text-xs text-white/40 mt-0.5">{opt.description}</p>
              )}
            </div>

            {/* 选中指示 */}
            {isSelected && (
              <span className="text-[10px] text-blue-400 flex-shrink-0">
                {isMulti ? '已选' : '✓'}
              </span>
            )}
          </button>
        );
      })}

      {/* 提交按钮 */}
      {selected.size > 0 && (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full mt-2 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
            color: '#FFFFFF',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? (
            <>处理中...</>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              发送选择
            </>
          )}
        </button>
      )}
    </div>
  );
}
