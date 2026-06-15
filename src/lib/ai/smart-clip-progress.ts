// 智能剪辑 SSE 进度总线
// 单例 EventEmitter，API execute 发射事件，SSE stream 端点订阅

import { EventEmitter } from 'events';

export interface SmartClipProgressEvent {
  type: 'progress' | 'step_complete' | 'complete' | 'error';
  step?: string;
  percent?: number;
  duration?: number; // ms, for step_complete
  message?: string;
  result?: unknown;
}

const progressBus = new EventEmitter();
progressBus.setMaxListeners(100);

/** 订阅某个 task 的进度事件。返回取消订阅函数。 */
export function subscribeToTask(
  taskId: string,
  callback: (event: SmartClipProgressEvent) => void
): () => void {
  const handler = (event: SmartClipProgressEvent) => callback(event);
  progressBus.on(taskId, handler);
  return () => { progressBus.off(taskId, handler); };
}

/** 发射进度事件到指定 task */
export function emitProgress(taskId: string, event: SmartClipProgressEvent): void {
  progressBus.emit(taskId, event);
}

/** 清理 task 的所有监听器 */
export function cleanupTask(taskId: string): void {
  progressBus.removeAllListeners(taskId);
}

// 每 10 分钟清理一次过期的 task 监听器（简单 GC）
const MAX_TASK_AGE_MS = 30 * 60 * 1000;
const taskCreatedAt = new Map<string, number>();

export function registerTask(taskId: string): void {
  taskCreatedAt.set(taskId, Date.now());
}

export function unregisterTask(taskId: string): void {
  taskCreatedAt.delete(taskId);
  cleanupTask(taskId);
}

// 分析状态缓存：analyze → execute 跨请求共享
const analysisCache = new Map<string, { videoPath: string; audioPath: string; direction: string }>();

export function cacheAnalysis(
  taskId: string,
  data: { videoPath: string; audioPath: string; direction: string }
): void {
  analysisCache.set(taskId, data);
}

export function getAnalysis(taskId: string): { videoPath: string; audioPath: string; direction: string } | undefined {
  return analysisCache.get(taskId);
}

export function clearAnalysis(taskId: string): void {
  analysisCache.delete(taskId);
}

setInterval(() => {
  const now = Date.now();
  for (const [taskId, createdAt] of taskCreatedAt) {
    if (now - createdAt > MAX_TASK_AGE_MS) {
      unregisterTask(taskId);
      analysisCache.delete(taskId);
    }
  }
}, 10 * 60 * 1000).unref();
