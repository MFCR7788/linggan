'use client';

// 剪辑方案卡片 — 在 Agent 对话中展示、确认、执行剪辑方案（本地，0 灵力）

import { useState, useCallback } from 'react';
import type { EditPlan } from '@/lib/agent/types';
import { useEditExecutor } from '@/hooks/use-edit-executor';
import type { ExecutorProgress } from '@/lib/agent/edit-executor';
import { estimateDuration } from '@/lib/agent/edit-executor';

interface Props {
  plan: EditPlan;
  fileMap: Map<string, File | Blob>;
  onDownload?: (blob: Blob, name: string) => void;
}

export function EditPlanCard({ plan, fileMap, onDownload }: Props) {
  const { state, execute, cancel } = useEditExecutor();
  const [showDetail, setShowDetail] = useState(false);

  const handleExecute = useCallback(async () => {
    const blob = await execute(plan, fileMap);
    if (blob && onDownload) {
      onDownload(blob, state.resultName);
    }
  }, [plan, fileMap, execute, onDownload, state.resultName]);

  const isRunning = state.status === 'running' || state.status === 'loading';
  const isDone = state.status === 'done';
  const estimated = estimateDuration(plan);

  return (
    <div className="mt-3 rounded-2xl border border-white/15 bg-white/8 backdrop-blur-sm overflow-hidden">
      {/* 头部 */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white/90 truncate">{plan.goal}</div>
          <div className="text-xs text-white/50 mt-0.5">
            {plan.operations.length} 个步骤 · 预计 {estimated} 秒 · <span className="text-green-400">本地执行 · 0 灵力</span>
          </div>
        </div>
      </div>

      {/* 步骤列表 */}
      {(showDetail || isRunning) && (
        <div className="px-4 pb-2">
          {plan.operations.map((op, i) => {
            const isActive = state.progress && state.progress.step === i;
            const isCompleted = state.progress && state.progress.step > i;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 py-1.5 text-xs transition-colors ${
                  isActive ? 'text-blue-300' : isCompleted ? 'text-green-300/70' : 'text-white/50'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isActive ? 'bg-blue-400 animate-pulse' : isCompleted ? 'bg-green-400' : 'bg-white/20'
                }`} />
                <span className="text-white/30 w-5 shrink-0">{i + 1}</span>
                <span className="truncate">{op.label || op.type}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 进度条 */}
      {isRunning && state.progress && (
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between text-xs text-white/60 mb-1">
            <span>{state.progress.label}</span>
            <span>{state.progress.step}/{state.progress.totalSteps}</span>
          </div>
          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${(state.progress.step / state.progress.totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 错误 */}
      {state.error && (
        <div className="px-4 pb-3">
          <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{state.error}</div>
        </div>
      )}

      {/* 完成 */}
      {isDone && (
        <div className="px-4 pb-3">
          <div className="text-xs text-green-400 bg-green-500/10 rounded-lg px-3 py-2">
            剪辑完成！已保存到本地。
          </div>
        </div>
      )}

      {/* 按钮区 */}
      <div className="px-4 pb-3 flex gap-2">
        {!isDone ? (
          <>
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="flex-1 h-8 rounded-lg border border-white/15 text-xs text-white/70 hover:bg-white/5 transition-colors"
            >
              {showDetail ? '收起步骤' : '查看步骤'}
            </button>
            <button
              onClick={handleExecute}
              disabled={isRunning}
              className={`flex-[2] h-8 rounded-lg text-xs font-medium transition-all ${
                isRunning
                  ? 'bg-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-blue-500/80 hover:bg-blue-500 text-white'
              }`}
            >
              {isRunning ? '执行中...' : `开始剪辑 (0 灵力)`}
            </button>
            {isRunning && (
              <button
                onClick={cancel}
                className="flex-1 h-8 rounded-lg border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                取消
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => {
              if (state.result) {
                const url = URL.createObjectURL(state.result);
                const a = document.createElement('a');
                a.href = url;
                a.download = state.resultName;
                a.click();
                URL.revokeObjectURL(url);
                onDownload?.(state.result, state.resultName);
              }
            }}
            className="flex-1 h-8 rounded-lg bg-green-500/80 hover:bg-green-500 text-white text-xs font-medium transition-colors"
          >
            下载视频
          </button>
        )}
      </div>
    </div>
  );
}
