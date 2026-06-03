'use client';

import { useState, useEffect } from 'react';
import { X, Wand2, Check, FileText, Sparkles } from 'lucide-react';
import { PrimaryButton } from '@/components/PrimaryButton';

interface InspirationItem {
  id: string | number;
  title: string;
  type?: string;
  original_text?: string;
  ai_summary?: string;
  source_platform?: string;
}

interface Step1MaterialRefineModalProps {
  open: boolean;
  userInput: string;
  inspirations: InspirationItem[];
  initialResult: string;
  onClose: () => void;
  onConfirm: (finalText: string) => void;
}

/**
 * 智能助手产物对比 Modal
 * 左:原始输入 + 选中素材(只读,标 [素材1])
 * 右:提炼结果(textarea 可编辑)
 * 底部:用这个提炼 / 取消
 */
export function Step1MaterialRefineModal({
  open, userInput, inspirations, initialResult, onClose, onConfirm,
}: Step1MaterialRefineModalProps) {
  const [edited, setEdited] = useState(initialResult);
  const [hasEdited, setHasEdited] = useState(false);

  useEffect(() => {
    setEdited(initialResult);
    setHasEdited(false);
  }, [initialResult, open]);

  if (!open) return null;

  const handleChange = (v: string) => {
    setEdited(v);
    if (v !== initialResult) setHasEdited(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl"
        style={{
          background: 'rgba(10,22,41,0.97)',
          border: '1px solid rgba(139,92,246,0.4)',
          boxShadow: '0 -4px 30px rgba(0,0,0,0.5), 0 0 30px rgba(139,92,246,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部 */}
        <div
          className="p-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(139,92,246,0.25)' }}
        >
          <div className="flex items-center gap-2">
            <Wand2 size={18} color="#C4B5FD" />
            <div>
              <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>
                智能助手 · 提炼对比
              </p>
              <p style={{ color: '#9CA3AF', fontSize: 10, marginTop: 2 }}>
                左边看素材,右边可编辑
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X size={18} color="#9CA3AF" />
          </button>
        </div>

        {/* 双栏对比 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {/* 左:原始输入 + 素材 */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileText size={12} color="#9CA3AF" />
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600 }}>
                原始输入与素材
              </p>
              <span style={{ color: '#6B7280', fontSize: 10 }}>(只读)</span>
            </div>
            <div
              className="p-3 rounded-lg space-y-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {userInput.trim() && (
                <div>
                  <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>✏️ 用户输入</p>
                  <p style={{ color: '#D1D5DB', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {userInput}
                  </p>
                </div>
              )}
              {inspirations.length > 0 && (
                <div>
                  <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>
                    📚 选中素材 ({inspirations.length})
                  </p>
                  <div className="space-y-1.5">
                    {inspirations.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-2 rounded"
                        style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}
                      >
                        <p style={{ color: '#93C5FD', fontSize: 10, marginBottom: 2 }}>
                          [素材{idx + 1}] {item.title}
                          {item.source_platform === 'ai' && (
                            <span style={{ color: '#FDE68A', marginLeft: 6 }}>⚠️ AI</span>
                          )}
                        </p>
                        <p style={{ color: '#D1D5DB', fontSize: 11, lineHeight: 1.5 }}>
                          {(item.ai_summary || item.original_text || '').slice(0, 200)}
                          {(item.ai_summary || item.original_text || '').length > 200 ? '...' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!userInput.trim() && inspirations.length === 0 && (
                <p style={{ color: '#6B7280', fontSize: 11 }}>(无内容)</p>
              )}
            </div>
          </div>

          {/* 中间箭头 */}
          <div className="flex justify-center">
            <div
              className="px-2 py-1 rounded-full flex items-center gap-1"
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}
            >
              <Sparkles size={11} color="#C4B5FD" />
              <span style={{ color: '#C4B5FD', fontSize: 10 }}>AI 提炼</span>
            </div>
          </div>

          {/* 右:可编辑的提炼结果 */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Wand2 size={12} color="#A78BFA" />
              <p style={{ color: '#A78BFA', fontSize: 11, fontWeight: 600 }}>
                提炼结果
              </p>
              <span style={{ color: '#6B7280', fontSize: 10 }}>(可编辑{hasEdited ? ' · 已修改' : ''})</span>
            </div>
            <textarea
              value={edited}
              onChange={(e) => handleChange(e.target.value)}
              className="w-full p-3 rounded-lg text-sm resize-none custom-scrollbar"
              style={{
                background: 'rgba(139,92,246,0.08)',
                border: '1px solid rgba(139,92,246,0.3)',
                color: '#E5E7EB',
                minHeight: 140,
                maxHeight: 280,
                fontFamily: 'inherit',
                lineHeight: 1.6,
              }}
              placeholder="AI 提炼中..."
            />
            <p style={{ color: '#6B7280', fontSize: 10, marginTop: 4, lineHeight: 1.5 }}>
              💡 觉得 AI 提炼偏了?直接在框里改,改完点「用这个提炼」
            </p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div
          className="p-3 flex gap-2 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
        >
          <PrimaryButton variant="ghost" onClick={onClose} fontSize={13} style={{ flex: 1 }}>
            取消
          </PrimaryButton>
          <PrimaryButton onClick={() => onConfirm(edited)} fontSize={13} style={{ flex: 2 }}>
            <Check size={14} /> 用这个提炼
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
