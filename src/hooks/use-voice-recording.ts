// 语音录制 Hook — MediaRecorder → 百炼 Paraformer ASR
// iOS WKWebView 中 SpeechRecognition 不稳定，改用 MediaRecorder + 服务端转写
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '@/components/Toast';

export function useVoiceRecording() {
  const { showToast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  /** 释放麦克风资源 */
  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 选择支持的 MIME 类型
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';

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

      recorder.start(500); // 每 500ms 收集一次数据块
      setIsRecording(true);
      setRecordingTime(0);
      setLiveTranscript('');
    } catch (e) {
      const err = e as Error;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showToast('请允许使用麦克风权限', 'warning');
      } else {
        showToast('无法启动录音，请检查设备', 'warning');
      }
      releaseStream();
    }
  }, [showToast, releaseStream]);

  const stopRecording = useCallback(async (): Promise<string> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      releaseStream();
      setIsRecording(false);
      setRecordingTime(0);
      return '';
    }

    return new Promise((resolve) => {
      recorder.onstop = async () => {
        releaseStream();
        setIsRecording(false);
        setRecordingTime(0);

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (blob.size < 100) {
          // 音频太短，可能是误触
          resolve('');
          return;
        }

        try {
          const formData = new FormData();
          formData.append('audio', blob, `recording.${recorder.mimeType.includes('webm') ? 'webm' : 'm4a'}`);

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const data = await res.json();
          if (data.success && data.data?.text) {
            resolve(data.data.text);
          } else {
            console.warn('[voice] 转写失败:', data.error);
            showToast('语音识别失败，请重试', 'warning');
            resolve('');
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') {
            showToast('语音识别超时，请重试', 'warning');
          } else {
            console.error('[voice] 转写请求异常:', e);
          }
          resolve('');
        }
      };

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
        setLiveTranscript('');
      };
      recorder.stop();
    } else {
      releaseStream();
      setIsRecording(false);
      setRecordingTime(0);
      setLiveTranscript('');
    }
  }, [releaseStream]);

  return { isRecording, recordingTime, liveTranscript, startRecording, stopRecording, cancelRecording };
}

export function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
