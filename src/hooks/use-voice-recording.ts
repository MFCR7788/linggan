// 语音录制 Hook — MediaRecorder → 浏览器转 WAV → 百炼 Paraformer ASR
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '@/components/Toast';

/** 浏览器端将音频 Blob 转为 16kHz mono WAV */
async function blobToWav(audioBlob: Blob): Promise<Blob> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioCtx = new OfflineAudioContext(1, 1, 16000);
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error('音频解码失败');
  }

  const sampleRate = 16000;
  const length = audioBuffer.length;
  const wavBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(wavBuffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, length * 2, true);

  const channel = audioBuffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, channel[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

export function useVoiceRecording() {
  const { showToast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyPromiseRef = useRef<Promise<void> | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    readyPromiseRef.current = null;
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    if (mediaRecorderRef.current) return;

    let resolveReady!: () => void;
    readyPromiseRef.current = new Promise<void>((r) => { resolveReady = r; });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';
      mimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = () => {
        showToast('录音失败，请检查麦克风权限', 'warning');
        releaseStream();
        setIsRecording(false);
        setRecordingTime(0);
      };

      recorder.start(500);
      setIsRecording(true);
      setRecordingTime(0);
      resolveReady();
    } catch (e) {
      const err = e as Error;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showToast('请允许使用麦克风权限', 'warning');
      } else {
        showToast('无法启动录音，请检查设备', 'warning');
      }
      releaseStream();
      setIsRecording(false);
      setRecordingTime(0);
      resolveReady();
    }
  }, [showToast, releaseStream]);

  const stopRecording = useCallback(async (): Promise<string> => {
    if (readyPromiseRef.current) {
      await readyPromiseRef.current;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      releaseStream();
      setIsRecording(false);
      setRecordingTime(0);
      return '';
    }

    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (text: string) => {
        if (resolved) return;
        resolved = true;
        releaseStream();
        setIsRecording(false);
        setRecordingTime(0);
        resolve(text);
      };

      // 超时保护：5 秒后强制结束
      const timeout = setTimeout(() => {
        console.warn('[voice] onstop 超时，强制结束');
        // 强制停止并收集已有数据
        try { recorder.stop(); } catch {}
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        safeResolve(blob.size > 200 ? '（录音数据）' : '');
      }, 5000);

      recorder.onstop = async () => {
        clearTimeout(timeout);

        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        if (blob.size < 200) {
          safeResolve('');
          return;
        }

        try {
          let wavBlob: Blob;
          try {
            wavBlob = await blobToWav(blob);
          } catch {
            wavBlob = blob;
          }

          const formData = new FormData();
          formData.append('audio', wavBlob, 'recording.wav');

          const controller = new AbortController();
          const apiTimeout = setTimeout(() => controller.abort(), 30000);
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });
          clearTimeout(apiTimeout);

          const data = await res.json();
          if (data.success && data.data?.text) {
            safeResolve(data.data.text);
          } else {
            showToast(data.error || '语音识别失败，请重试', 'warning');
            safeResolve('');
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') {
            showToast('语音识别超时，请重试', 'warning');
          } else {
            showToast('网络异常，请重试', 'warning');
          }
          safeResolve('');
        }
      };

      // 如果 onstop 已经不会再触发（recorder 已经 inactive），手动触发
      if (recorder.state === 'inactive') {
        clearTimeout(timeout);
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        if (blob.size < 200) {
          safeResolve('');
        } else {
          // 模拟 onstop 流程
          recorder.onstop = null as any;
          recorder.dispatchEvent(new Event('stop'));
        }
        return;
      }

      recorder.stop();
    });
  }, [showToast, releaseStream]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        releaseStream();
        setIsRecording(false);
        setRecordingTime(0);
      };
      recorder.stop();
    } else {
      releaseStream();
      setIsRecording(false);
      setRecordingTime(0);
    }
  }, [releaseStream]);

  return { isRecording, recordingTime, startRecording, stopRecording, cancelRecording };
}

export function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
