// 语音识别 Hook — 浏览器原生 SpeechRecognition API，实时转文字
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechRecognitionResult {
  transcript: string;
  isFinal: boolean;
}

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef('');

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
    }
  }, []);

  const startListening = useCallback((lang: string = 'zh-CN') => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return false;

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      finalTextRef.current = '';
      setLiveText('');

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTextRef.current += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        setLiveText(finalTextRef.current + interim);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          // 正常终止，不报错
        } else if (event.error === 'not-allowed') {
          console.warn('SpeechRecognition: 麦克风权限被拒绝');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // 合并最后的 interim 结果
        recognitionRef.current = null;
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
      return true;
    } catch (e) {
      console.warn('SpeechRecognition 启动失败:', e);
      return false;
    }
  }, []);

  const stopListening = useCallback((): string => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    const text = (liveText || finalTextRef.current).trim();
    finalTextRef.current = '';
    setLiveText('');
    return text;
  }, [liveText]);

  const cancelListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.abort();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    finalTextRef.current = '';
    setLiveText('');
  }, []);

  return { isListening, liveText, supported, startListening, stopListening, cancelListening };
}
