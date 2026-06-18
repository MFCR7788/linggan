// 语音录制 Hook — MediaRecorder → WAV → /api/ai/transcribe
'use client';

import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/components/Toast';

/** AudioContext 将音频 Blob 转为 16kHz mono WAV */
async function blobToWav(blob: Blob): Promise<Blob> {
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const len = buf.length;
  const wav = new ArrayBuffer(44 + len * 2);
  const v = new DataView(wav);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, len * 2, true);
  const ch = buf.getChannelData(0);
  for (let i = 0, o = 44; i < len; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, ch[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([wav], { type: 'audio/wav' });
}

export function useVoiceRecording() {
  const { showToast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    if (recorderRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
      const r = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = r;
      chunksRef.current = [];
      r.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      r.start(250);
      setIsRecording(true);
    } catch (e: any) {
      cleanup();
      showToast(e?.name === 'NotAllowedError' ? '请允许麦克风权限' : '麦克风不可用', 'warning');
    }
  }, [showToast, cleanup]);

  const stopRecording = useCallback(async (): Promise<string> => {
    const r = recorderRef.current;
    if (!r || r.state === 'inactive') { cleanup(); setIsRecording(false); return ''; }

    return new Promise(resolve => {
      r.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: r.mimeType });
        cleanup();
        setIsRecording(false);

        if (blob.size < 200) { resolve(''); return; }

        try {
          const wav = await blobToWav(blob).catch(() => blob);
          const fd = new FormData();
          fd.append('audio', wav, 'audio.wav');

          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 30000);
          const res = await fetch('/api/ai/transcribe', { method: 'POST', body: fd, signal: ctrl.signal });
          clearTimeout(t);

          const data = await res.json();
          if (data.success && data.data?.text) {
            resolve(data.data.text);
          } else {
            showToast(data.error || '识别失败，请重试', 'warning');
            resolve('');
          }
        } catch {
          showToast('网络异常，请重试', 'warning');
          resolve('');
        }
      };
      r.stop();
    });
  }, [showToast, cleanup]);

  const cancelRecording = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') {
      r.onstop = () => { cleanup(); setIsRecording(false); };
      r.stop();
    } else {
      cleanup();
      setIsRecording(false);
    }
  }, [cleanup]);

  return { isRecording, startRecording, stopRecording, cancelRecording };
}
