// 语音录制 Hook — 浏览器 SpeechRecognition + 实时标点
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '@/components/Toast';

export function useVoiceRecording() {
  const { showToast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldRestartRef = useRef(false);
  const punctuateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPunctuatedLenRef = useRef(0);
  const punctuatedTextRef = useRef('');

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  useEffect(() => {
    return () => { if (punctuateTimerRef.current) clearTimeout(punctuateTimerRef.current); };
  }, []);

  const schedulePunctuate = () => {
    if (punctuateTimerRef.current) clearTimeout(punctuateTimerRef.current);
    punctuateTimerRef.current = setTimeout(async () => {
      const fullText = finalTranscriptRef.current;
      const newPart = fullText.slice(lastPunctuatedLenRef.current);
      if (!newPart.trim()) return;
      try {
        const res = await fetch('/api/ai/punctuate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newPart }),
        });
        const data = await res.json();
        if (data.success && data.data?.text) {
          punctuatedTextRef.current = punctuatedTextRef.current + data.data.text;
          lastPunctuatedLenRef.current = fullText.length;
        }
      } catch { /* ignore */ }
    }, 1500);
  };

  const startRecording = useCallback(() => {
    if (recognitionRef.current) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast('您的浏览器不支持语音识别，请使用 Chrome 浏览器', 'warning'); return; }

    setIsRecording(true);
    setRecordingTime(0);
    setLiveTranscript('');
    finalTranscriptRef.current = '';
    punctuatedTextRef.current = '';
    lastPunctuatedLenRef.current = 0;
    shouldRestartRef.current = true;

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscriptRef.current += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      const newUnpunctuated = finalTranscriptRef.current.slice(lastPunctuatedLenRef.current);
      setLiveTranscript(punctuatedTextRef.current + newUnpunctuated + interim);
      if (newUnpunctuated.trim()) schedulePunctuate();
    };

    recognition.onerror = (event: any) => {
      console.error('语音识别错误:', event.error);
      if (event.error === 'not-allowed') {
        showToast('请允许使用麦克风权限', 'warning');
        shouldRestartRef.current = false;
        setIsRecording(false);
        setRecordingTime(0);
      }
    };

    recognition.onend = () => {
      if (shouldRestartRef.current) {
        try { recognition.start(); } catch {
          shouldRestartRef.current = false;
          setIsRecording(false);
          setRecordingTime(0);
        }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [showToast]);

  const stopRecording = useCallback(async () => {
    shouldRestartRef.current = false;
    if (punctuateTimerRef.current) { clearTimeout(punctuateTimerRef.current); punctuateTimerRef.current = null; }
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }

    const remaining = finalTranscriptRef.current.slice(lastPunctuatedLenRef.current);
    let finalText = punctuatedTextRef.current + remaining;
    if (remaining.trim()) {
      try {
        const res = await fetch('/api/ai/punctuate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: remaining }),
        });
        const data = await res.json();
        if (data.success && data.data?.text) {
          finalText = punctuatedTextRef.current + data.data.text;
        }
      } catch { /* ignore */ }
    }
    const transcript = finalText.trim() || finalTranscriptRef.current.trim();
    setIsRecording(false);
    setRecordingTime(0);
    setLiveTranscript('');
    return transcript;
  }, []);

  const cancelRecording = useCallback(() => {
    shouldRestartRef.current = false;
    if (punctuateTimerRef.current) { clearTimeout(punctuateTimerRef.current); punctuateTimerRef.current = null; }
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    setIsRecording(false);
    setRecordingTime(0);
    setLiveTranscript('');
  }, []);

  return { isRecording, recordingTime, liveTranscript, startRecording, stopRecording, cancelRecording };
}

export function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
