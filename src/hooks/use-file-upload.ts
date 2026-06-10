// 文件上传 Hook — 图片/视频/文档上传 + 预览
'use client';

import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/components/Toast';
import { syncDevAuthCookie } from '@/lib/dev-auth';

export interface AttachedFile {
  id: string;
  file: File;
  preview: string;
  type: 'image' | 'video' | 'document';
}

export function useFileUpload() {
  const { showToast } = useToast();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    const isDoc = file.type === 'application/pdf' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'text/plain' ||
      file.type === 'text/markdown';
    formData.append('type', isDoc ? 'document' : (file.type.startsWith('image') ? 'image' : 'video'));

    try {
      syncDevAuthCookie();
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) { setUploadError(data.error || '上传失败'); return null; }
      setUploadError(null);
      return data.data.url;
    } catch { setUploadError('网络错误，上传失败'); return null; }
  }, []);

  const validateFile = useCallback((file: File, type: 'image' | 'document'): boolean => {
    if (type === 'document') {
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'];
      const validExts = ['.pdf', '.docx', '.txt', '.md'];
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
        showToast('仅支持 PDF/DOCX/TXT/MD 格式', 'warning'); return false;
      }
      if (file.size > 20 * 1024 * 1024) {
        showToast(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大 20MB`, 'warning'); return false;
      }
      return true;
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) { showToast('格式不支持，仅支持 JPEG/PNG/WebP/GIF', 'warning'); return false; }
    if (file.size > 20 * 1024 * 1024) {
      showToast(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大 20MB`, 'warning'); return false;
    }
    return true;
  }, [showToast]);

  const createPreview = useCallback((file: File): string => {
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.push(url);
    return url;
  }, []);

  const revokePreview = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    objectUrlsRef.current = objectUrlsRef.current.filter(u => u !== url);
  }, []);

  const pickImage = useCallback((): Promise<AttachedFile | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) { resolve(null); return; }
        const isValid = validateFile(file, 'image');
        if (!isValid) { resolve(null); return; }
        const attached: AttachedFile = {
          id: Date.now().toString(),
          file,
          preview: createPreview(file),
          type: 'image',
        };
        resolve(attached);
      };
      input.click();
    });
  }, [validateFile, createPreview]);

  const pickDocument = useCallback((): Promise<AttachedFile | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.docx,.txt,.md';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) { resolve(null); return; }
        const isValid = validateFile(file, 'document');
        if (!isValid) { resolve(null); return; }
        const attached: AttachedFile = {
          id: Date.now().toString(),
          file,
          preview: file.name,
          type: 'document',
        };
        resolve(attached);
      };
      input.click();
    });
  }, [validateFile]);

  return { uploadError, setUploadError, objectUrlsRef, uploadFile, validateFile, createPreview, revokePreview, pickImage, pickDocument };
}
