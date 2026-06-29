// 语音识别 Hook — 原生优先（Capacitor 插件），降级到浏览器 SpeechRecognition API
// iOS WKWebView 不支持 window.SpeechRecognition，必须走原生 SFSpeechRecognizer
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition as NativeSpeechRecognition } from '@capacitor-community/speech-recognition';

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const isNative = useRef(false);

  useEffect(() => {
    isNative.current = Capacitor.isNativePlatform();
    if (isNative.current) {
      NativeSpeechRecognition.available().then(({ available }) => {
        if (!available) setSupported(false);
      }).catch(() => setSupported(false));
    } else {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) setSupported(false);
    }
  }, []);

  // ─── 原生语音识别 (iOS/Android) ─────────────────────────

  const startNative = useCallback(async (lang: string) => {
    try {
      const perm = await NativeSpeechRecognition.checkPermissions();
      if (perm.speechRecognition !== 'granted') {
        const req = await NativeSpeechRecognition.requestPermissions();
        if (req.speechRecognition !== 'granted') return false;
      }

      await NativeSpeechRecognition.removeAllListeners();

      await NativeSpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
        if (data.matches && data.matches.length > 0) {
          setLiveText(data.matches[0]);
        }
      });

      await NativeSpeechRecognition.start({
        language: lang,
        maxResults: 1,
        partialResults: true,
        popup: false,
      });

      setIsListening(true);
      return true;
    } catch (e) {
      console.warn('原生语音识别启动失败:', e);
      return false;
    }
  }, []);

  const stopNative = useCallback(async (): Promise<string> => {
    try {
      await NativeSpeechRecognition.stop();
      await NativeSpeechRecognition.removeAllListeners();
    } catch { /* ignore */ }
    setIsListening(false);
    const text = liveText.trim();
    setLiveText('');
    return text;
  }, [liveText]);

  const cancelNative = useCallback(async () => {
    try {
      await NativeSpeechRecognition.stop();
      await NativeSpeechRecognition.removeAllListeners();
    } catch { /* ignore */ }
    setIsListening(false);
    setLiveText('');
  }, []);

  // ─── 浏览器语音识别 (Web Speech API) ────────────────────

  const startBrowser = useCallback((lang: string = 'zh-CN') => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return false;

    try {
      const recognition = new SR();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      setLiveText('');

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        setLiveText(final + interim);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          // 正常终止
        } else if (event.error === 'not-allowed') {
          console.warn('SpeechRecognition: 麦克风权限被拒绝');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
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

  const stopBrowser = useCallback((): string => {
    const rec = recognitionRef.current;
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    const text = liveText.trim();
    setLiveText('');
    return text;
  }, [liveText]);

  const cancelBrowser = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try { rec.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setLiveText('');
  }, []);

  // ─── 统一调度 ────────────────────────────────────────────

  const startListening = useCallback(
    (lang: string = 'zh-CN') => {
      return isNative.current ? startNative(lang) : startBrowser(lang);
    },
    [startNative, startBrowser]
  );

  const stopListening = useCallback(async (): Promise<string> => {
    if (isNative.current) {
      return await stopNative();
    }
    return stopBrowser();
  }, [stopNative, stopBrowser]);

  const cancelListening = useCallback(() => {
    if (isNative.current) {
      cancelNative();
    } else {
      cancelBrowser();
    }
  }, [cancelNative, cancelBrowser]);

  return {
    isListening,
    liveText,
    supported,
    startListening,
    stopListening,
    cancelListening,
  };
}
