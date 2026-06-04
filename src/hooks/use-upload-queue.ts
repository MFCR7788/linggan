// 上传队列 hook
// 维护一组上传任务的状态，支持进度条、错误重试、并发控制
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { compressImageIfNeeded } from '@/lib/upload/client-compress';

export type UploadStatus =
  | 'queued'
  | 'compressing'
  | 'uploading'
  | 'creating'
  | 'extracting'
  | 'done'
  | 'error';

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number; // 0-100
  error?: string;
  resultId?: string;
  compressed?: boolean;
  originalSize?: number;
  compressedSize?: number;
}

const MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
];

const DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];

function pickEndpoint(file: File): string {
  if (DOCUMENT_TYPES.includes(file.type)) return '/api/upload/document';
  if (MEDIA_TYPES.includes(file.type)) return '/api/upload/inspiration';
  return '/api/upload/inspiration';
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface UseUploadQueueOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  onSuccess?: (item: UploadItem) => void;
  onAllDone?: (summary: {
    succeeded: number;
    failed: number;
    total: number;
    inFlight: number;
    firstError?: string;
  }) => void;
}

export function useUploadQueue(options: UseUploadQueueOptions = {}) {
  const { maxRetries = 2, retryDelayMs = 1000, onSuccess, onAllDone } = options;
  const [items, setItems] = useState<UploadItem[]>([]);
  const isProcessingRef = useRef(false);
  const itemsRef = useRef<UploadItem[]>([]);
  const processQueueRef = useRef<() => Promise<void>>(async () => {});

  // ref 始终指向最新 items（render 同步更新）
  itemsRef.current = items;

  // updateItem 内部同步刷 ref，避免 processQueue 末尾读到陈旧值
  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, ...patch } : it));
      itemsRef.current = next;
      return next;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      itemsRef.current = next;
      return next;
    });
  }, []);

  const clearDone = useCallback(() => {
    setItems((prev) => {
      const next = prev.filter((it) => it.status !== 'done');
      itemsRef.current = next;
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  // 串行上传单个文件
  const uploadOne = useCallback(
    async (item: UploadItem, attempt = 0): Promise<boolean> => {
      const endpoint = pickEndpoint(item.file);
      const isDocument = endpoint === '/api/upload/document';

      try {
        // 1. 压缩（仅图片）
        let fileToUpload = item.file;
        if (item.file.type.startsWith('image/')) {
          updateItem(item.id, { status: 'compressing' });
          const result = await compressImageIfNeeded(item.file);
          fileToUpload = result.file;
          updateItem(item.id, {
            compressed: result.compressed,
            originalSize: item.file.size,
            compressedSize: result.file.size,
          });
        }

        // 2. XHR 上传（带进度）
        updateItem(item.id, { status: 'uploading', progress: 0 });
        const formData = new FormData();
        formData.append('file', fileToUpload);
        if (isDocument) {
          formData.append('type', 'document');
        } else {
          formData.append(
            'type',
            item.file.type.startsWith('image/')
              ? 'image'
              : item.file.type.startsWith('video/')
              ? 'video'
              : 'audio'
          );
        }

        const data = await new Promise<{ ok: boolean; status: number; body: any }>(
          (resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', endpoint);
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const p = Math.round((e.loaded / e.total) * 100);
                updateItem(item.id, { progress: p });
              }
            };
            xhr.onload = () => {
              try {
                const body = JSON.parse(xhr.responseText);
                resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
              } catch {
                resolve({ ok: false, status: xhr.status, body: null });
              }
            };
            xhr.onerror = () => reject(new Error('network error'));
            xhr.send(formData);
          }
        );

        if (!data.ok) {
          const errMsg = data.body?.error
            ? `${data.body.error} (HTTP ${data.status})`
            : `HTTP ${data.status}`;
          if (data.status >= 400 && data.status < 500) {
            updateItem(item.id, { status: 'error', error: errMsg });
            return false;
          }
          throw new Error(errMsg);
        }

        // 3. 成功
        const resultId = data.body?.data?.id;
        updateItem(item.id, {
          status: isDocument ? 'extracting' : 'done',
          progress: 100,
          resultId,
        });
        onSuccess?.({ ...item, status: isDocument ? 'extracting' : 'done', progress: 100, resultId });

        // 4. 文档：fire-and-forget 触发抽取
        if (isDocument && resultId) {
          fetch(`/api/inspiration/${resultId}/extract`, { method: 'POST' })
            .then(() => {
              updateItem(item.id, { status: 'done' });
              onSuccess?.({ ...item, status: 'done', progress: 100, resultId });
            })
            .catch((e) => {
              console.warn('[upload-queue] 触发抽取失败:', e);
            });
        }

        return true;
      } catch (e: any) {
        if (attempt < maxRetries) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          return uploadOne(item, attempt + 1);
        }
        updateItem(item.id, { status: 'error', error: e?.message || '上传失败' });
        return false;
      }
    },
    [maxRetries, retryDelayMs, updateItem, onSuccess]
  );

  // 串行处理队列：使用 ref 快照 + 循环重读防止漏掉新增项
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      // 使用 while 循环而非一次性快照，避免漏掉处理期间新增的队列项
      let safety = 0;
      const MAX_LOOPS = 500;
      while (safety++ < MAX_LOOPS) {
        const queued = itemsRef.current.filter((it) => it.status === 'queued');
        if (queued.length === 0) break;
        for (const item of queued) {
          await uploadOne(item);
        }
      }
      const final = itemsRef.current;
      const succeeded = final.filter((it) => it.status === 'done' || it.status === 'extracting').length;
      const failed = final.filter((it) => it.status === 'error').length;
      const inFlight = final.filter(
        (it) => it.status === 'uploading' || it.status === 'compressing'
      ).length;
      const unknown = final.filter(
        (it) =>
          it.status !== 'done' &&
          it.status !== 'extracting' &&
          it.status !== 'error' &&
          it.status !== 'uploading' &&
          it.status !== 'compressing'
      );
      const errors = final
        .filter((it) => it.status === 'error')
        .map((it) => it.error)
        .filter(Boolean);
      if (unknown.length > 0) {
        console.warn('[upload-queue] 漏判状态:', unknown.map((it) => ({ id: it.id, status: it.status, name: it.file.name })));
      }
      onAllDone?.({
        succeeded,
        failed,
        total: final.length,
        inFlight,
        firstError: errors[0] || (unknown.length > 0 ? `未处理状态: ${unknown.map((it) => it.status).join(',')}` : undefined),
      });
    } finally {
      isProcessingRef.current = false;
    }
  }, [uploadOne, onAllDone]);

  // 始终让 ref 指向最新的 processQueue
  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: UploadItem[] = Array.from(files).map((f) => ({
      id: genId(),
      file: f,
      status: 'queued',
      progress: 0,
    }));
    // 同步刷 ref，避免 setTimeout 0 跑 processQueue 时 ref 还没更新
    itemsRef.current = [...itemsRef.current, ...newItems];
    setItems((prev) => [...prev, ...newItems]);
    setTimeout(() => {
      processQueueRef.current();
    }, 0);
    return newItems;
  }, []);

  const retry = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.map<UploadItem>((it) =>
        it.id === id
          ? { ...it, status: 'queued' as const, progress: 0, error: undefined }
          : it
      );
      itemsRef.current = next;
      return next;
    });
    setTimeout(() => {
      processQueueRef.current();
    }, 0);
  }, []);

  return {
    items,
    addFiles,
    retry,
    removeItem,
    clearDone,
    clearAll,
  };
}
