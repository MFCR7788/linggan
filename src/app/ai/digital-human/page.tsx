'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Zap, ChevronLeft, ChevronRight, Play, Download, Save, RefreshCw,
  AlertCircle, Loader2, CheckCircle2, XCircle, Wand2,
  ImageIcon, Upload, Link, Mic, Music, Volume2,
  FileText, Globe, BookOpen, Layers, ChevronDown, ChevronUp,
  Settings, Trash2, Plus, Square,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProtectedRoute } from '@/components';
import { Toast } from '@/components/Toast';
import { splitLongText } from '@/lib/text-utils';
import { useContentHandoff } from '@/hooks/use-content-handoff';

// ─── 类型 ────────────────────────────────────────────────

interface VoiceOption {
  key: string;
  label: string;
  id: string;
  language?: string;
}

interface InspirationItem {
  id: string | number;
  title: string;
  type?: string;
  media_urls?: string[];
  original_text?: string;
  ai_summary?: string;
}

type DigitalHumanMode = 'manual' | 'ai-write' | 'one-click' | 'batch' | 'multi-lang' | 'course';

interface BatchItem {
  id: string;
  topic: string;
  script: string;
  audioUrl: string | null;
  taskId: string | null;
  videoUrl: string | null;
  status: 'pending' | 'scripting' | 'tts' | 'uploading' | 'submitting' | 'generating' | 'done' | 'error';
  errorMsg?: string;
}

const STEPS = ['选择角色', '音频来源', '参数设置', '生成预览'];

const RESOLUTION_OPTIONS = [
  { key: '480P' as const, label: '480P', cost: '~0.30 元/秒' },
  { key: '720P' as const, label: '720P', cost: '~0.45 元/秒' },
];

const MODES: { key: DigitalHumanMode; label: string; icon: string; desc: string }[] = [
  { key: 'manual', label: '手动配置', icon: '⚙️', desc: '逐步设置' },
  { key: 'ai-write', label: 'AI 写稿', icon: '✍️', desc: '主题→AI脚本' },
  { key: 'one-click', label: '一键成片', icon: '⚡', desc: '全自动流水线' },
  { key: 'batch', label: '批量生成', icon: '📦', desc: '多主题串行' },
  { key: 'multi-lang', label: '多语言', icon: '🌐', desc: '英/日/韩播报' },
  { key: 'course', label: '课程/培训', icon: '📖', desc: '长文拆分' },
];

const ORAL_STYLES = [
  { key: 'oral', label: '自然口播', desc: '亲切聊天式' },
  { key: 'livestream', label: '直播带货', desc: '热情促销式' },
  { key: 'news', label: '新闻播报', desc: '正式专业式' },
  { key: 'emotional', label: '情感讲述', desc: '温柔舒缓式' },
];

const LANGUAGES = [
  { key: 'zh', label: '中文', native: '中文' },
  { key: 'en', label: 'English', native: 'English' },
  { key: 'ja', label: '日本語', native: '日本語' },
  { key: 'ko', label: '한국어', native: '한국어' },
];

const BATCH_STATUS_LABELS: Record<BatchItem['status'], { text: string; color: string; bg: string }> = {
  pending: { text: '等待中', color: '#9CA3AF', bg: 'rgba(255,255,255,0.05)' },
  scripting: { text: '写稿中', color: '#60A5FA', bg: 'rgba(59,130,246,0.1)' },
  tts: { text: '配音中', color: '#C4B5FD', bg: 'rgba(139,92,246,0.1)' },
  uploading: { text: '上传中', color: '#FCD34D', bg: 'rgba(245,158,11,0.1)' },
  submitting: { text: '提交中', color: '#FCD34D', bg: 'rgba(245,158,11,0.1)' },
  generating: { text: '生成中', color: '#67E8F9', bg: 'rgba(6,182,212,0.1)' },
  done: { text: '已完成', color: '#86EFAC', bg: 'rgba(34,197,94,0.1)' },
  error: { text: '失败', color: '#FCA5A5', bg: 'rgba(239,68,68,0.1)' },
};

function DigitalHumanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { receive } = useContentHandoff();

  // ─── 模式 ─────────────────────────────────────────────
  const [dhMode, setDhMode] = useState<DigitalHumanMode>('manual');

  // ─── Step 1: 角色图片（所有模式共用）────────────────────
  const [imageTab, setImageTab] = useState<'upload' | 'inspiration' | 'url'>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [inspirations, setInspirations] = useState<InspirationItem[]>([]);
  const [selectedInspId, setSelectedInspId] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // ─── Step 2: 音频 (manual/ai-write/multi-lang 共用) ─────
  const [audioTab, setAudioTab] = useState<'tts' | 'upload'>('tts');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioDuration, setAudioDuration] = useState<number | null>(null); // 音频实际秒数, null = 未测
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [ttsText, setTtsText] = useState('');
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voice, setVoice] = useState('female_natural');
  const [speed, setSpeed] = useState(1.15);
  const [pitch, setPitch] = useState(1.0);
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [ttsAudioBase64, setTtsAudioBase64] = useState<string | null>(null);

  // ─── 接收 handoff URL 参数（从 AI 生图 / AI 配音 带入） ──
  useEffect(() => {
    const params = receive(['imageUrl', 'audioUrl', 'text', 'script']);
    if (params.imageUrl) {
      setImageUrl(params.imageUrl);
      setImagePreview(params.imageUrl);
      setImageTab('url');
    }
    if (params.audioUrl) {
      setAudioUrl(params.audioUrl);
      setAudioTab('upload');
      // 测预填音频的时长
      measureAudioDuration(params.audioUrl).then(d => setAudioDuration(d)).catch(() => {});
    }
    if (params.text || params.script) {
      setTtsText((params.text || params.script || '').slice(0, 1000));
    }
  }, []);

  // ─── AI 写稿 ──────────────────────────────────────────
  const [aiTopic, setAiTopic] = useState('');
  const [aiStyle, setAiStyle] = useState('oral');
  const [aiLength, setAiLength] = useState(400);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScripts, setGeneratedScripts] = useState<string[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);

  // ─── 一键成片 ─────────────────────────────────────────
  const [ocTopic, setOcTopic] = useState('');
  const [ocStyle, setOcStyle] = useState('oral');
  const [ocPhase, setOcPhase] = useState('idle'); // idle|scripting|tts|uploading|submitting|generating|done|error
  const [ocError, setOcError] = useState<string | null>(null);
  const ocAbortRef = useRef(false);

  // ─── 批量生成 ─────────────────────────────────────────
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchInput, setBatchInput] = useState('');
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchShowDetail, setBatchShowDetail] = useState<Record<string, boolean>>({});
  const batchAbortRef = useRef(false);

  // ─── 多语言 ───────────────────────────────────────────
  const [targetLang, setTargetLang] = useState('zh');

  // ─── 课程 ─────────────────────────────────────────────
  const [courseText, setCourseText] = useState('');
  const [courseMaxChars, setCourseMaxChars] = useState(500);
  const [courseSegments, setCourseSegments] = useState<{ id: string; text: string; audioUrl: string | null; taskId: string | null; videoUrl: string | null; status: BatchItem['status']; errorMsg?: string; }[]>([]);
  const [isCourseRunning, setIsCourseRunning] = useState(false);
  const courseAbortRef = useRef(false);

  // ─── 通用 Step/生成状态 ────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);
  const [resolution, setResolution] = useState<'480P' | '720P'>('720P');
  const [generatePhase, setGeneratePhase] = useState<'idle' | 'uploading_audio' | 'submitting' | 'generating' | 'done' | 'error'>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ─── 初始化 ───────────────────────────────────────────
  useEffect(() => {
    fetch('/api/inspiration?limit=30')
      .then(r => r.json())
      .then(d => { if (d.success) setInspirations(d.data || []); })
      .catch(() => {});

    fetch('/api/ai/tts')
      .then(r => r.json())
      .then(d => { if (d.success && d.data?.voices) setVoices(d.data.voices); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // 切换语言时重新获取音色列表
  useEffect(() => {
    fetch(`/api/ai/tts?language=${targetLang}`)
      .then(r => r.json())
      .then(d => { if (d.success && d.data?.voices) setVoices(d.data.voices); })
      .catch(() => {});
  }, [targetLang]);

  // ─── 通用工具函数 ─────────────────────────────────────
  const uploadFile = async (file: File, type: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success && data.data.url) return data.data.url;
    throw new Error(data.error || '上传失败');
  };

  const base64ToUrl = async (base64: string): Promise<string> => {
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const file = new File([blob], `tts-${Date.now()}.mp3`, { type: 'audio/mpeg' });
    return uploadFile(file, 'audio');
  };

  // 测音频真实时长(秒), 支持 url 或 base64 dataURL
  const measureAudioDuration = (src: string): Promise<number> => new Promise((resolve, reject) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(a.duration);
    a.onerror = () => reject(new Error('音频时长解析失败'));
    a.src = src;
  });

  // wan2.2-s2v 硬限制 ≤ 20 秒, 超过会上游返 "input audio is longer than 20s"
  const MAX_AUDIO_SECONDS = 20;

  // ─── Step 1: 图片处理 ────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const url = await uploadFile(file, 'image');
      setImageUrl(url);
      setImagePreview(url);
    } catch (err: any) {
      setToast({ message: err.message || '图片上传失败', type: 'error' });
    }
    setIsUploadingImage(false);
  };

  const handleImageUrlConfirm = () => {
    if (imageUrl.startsWith('http')) {
      setImagePreview(imageUrl);
    } else {
      setToast({ message: '请输入有效的图片URL', type: 'error' });
    }
  };

  const selectInspirationImage = (item: InspirationItem) => {
    const imgUrl = item.media_urls?.[0];
    if (imgUrl) {
      setImageUrl(imgUrl);
      setImagePreview(imgUrl);
      setSelectedInspId(String(item.id));
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAudio(true);
    try {
      // 先测本地文件时长, 超过 20 秒直接拒收(避免上传浪费)
      const localUrl = URL.createObjectURL(file);
      const dur = await measureAudioDuration(localUrl);
      URL.revokeObjectURL(localUrl);
      if (dur > MAX_AUDIO_SECONDS) {
        setToast({ message: `音频时长 ${dur.toFixed(1)} 秒,超过 ${MAX_AUDIO_SECONDS} 秒限制,请用更短的音频`, type: 'error' });
        setIsUploadingAudio(false);
        e.target.value = '';
        return;
      }
      const url = await uploadFile(file, 'audio');
      setAudioUrl(url);
      setAudioDuration(dur);
    } catch (err: any) {
      setToast({ message: err.message || '音频上传失败', type: 'error' });
    }
    setIsUploadingAudio(false);
  };

  // ─── TTS 生成 ────────────────────────────────────────
  const handleTTSGenerate = async (text?: string) => {
    const txt = text || ttsText;
    if (!txt.trim()) {
      setToast({ message: '请输入文本', type: 'error' });
      return;
    }
    setIsGeneratingTTS(true);
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txt, voice, speed, pitch }),
      });
      const data = await res.json();
      if (data.success && data.audioBase64) {
        // 测真实音频时长, 超过 20 秒直接拒收(避免数字人 API 报错)
        const dataUrl = `data:audio/mpeg;base64,${data.audioBase64}`;
        let dur = 0;
        try { dur = await measureAudioDuration(dataUrl); } catch {}
        if (dur > MAX_AUDIO_SECONDS) {
          setToast({ message: `音频时长 ${dur.toFixed(1)} 秒,超过 ${MAX_AUDIO_SECONDS} 秒限制,请精简脚本(当前 ${txt.length} 字)`, type: 'error' });
          return null;
        }
        setTtsAudioBase64(data.audioBase64);
        setAudioDuration(dur || null);
        return data.audioBase64;
      } else {
        setToast({ message: data.error || 'TTS 生成失败', type: 'error' });
        return null;
      }
    } catch {
      setToast({ message: 'TTS 请求失败', type: 'error' });
      return null;
    } finally {
      setIsGeneratingTTS(false);
    }
  };

  const handleUseTTSAudio = async () => {
    if (!ttsAudioBase64) return;
    setIsUploadingAudio(true);
    try {
      const url = await base64ToUrl(ttsAudioBase64);
      setAudioUrl(url);
      setTtsAudioBase64(null);
      setToast({ message: '音频已准备就绪', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message || '音频上传失败', type: 'error' });
    }
    setIsUploadingAudio(false);
  };

  // ─── 数字人提交 + 轮询 ───────────────────────────────
  const submitAndPoll = async (
    imgUrl: string,
    audUrl: string,
    reso: '480P' | '720P',
    onDone: (videoUrl: string) => void,
    onError: (msg: string) => void,
    audDuration?: number | null,
  ) => {
    try {
      const res = await fetch('/api/ai/digital-human', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: imgUrl,
          audioUrl: audUrl,
          resolution: reso,
          audioDuration: typeof audDuration === 'number' ? audDuration : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '提交失败');

      const tid = data.data.taskId;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 120) {
          clearInterval(poll);
          onError('生成超时，请重试');
          return;
        }
        try {
          const pr = await fetch(`/api/ai/digital-human?taskId=${tid}`);
          const pd = await pr.json();
          if (pd.success) {
            const { status, videoUrl, message } = pd.data;
            if (status === 'succeeded' && videoUrl) {
              clearInterval(poll);
              onDone(videoUrl);
            } else if (status === 'failed') {
              clearInterval(poll);
              onError(message || '生成失败');
            }
          }
        } catch { /* 继续轮询 */ }
      }, 5000);
      return poll;
    } catch (err: any) {
      onError(err.message || '提交失败');
      return null;
    }
  };

  // ─── manual 模式: 开始生成 ───────────────────────────
  const handleGenerate = async () => {
    if (!imageUrl) { setToast({ message: '请先选择角色图片', type: 'error' }); return; }
    if (!audioUrl && !ttsAudioBase64) { setToast({ message: '请生成或上传音频', type: 'error' }); return; }

    let finalAudioUrl = audioUrl;
    if (!finalAudioUrl && ttsAudioBase64) {
      setGeneratePhase('uploading_audio');
      try { finalAudioUrl = await base64ToUrl(ttsAudioBase64); setAudioUrl(finalAudioUrl); }
      catch (err: any) { setErrorMsg(err.message || '音频上传失败'); setGeneratePhase('error'); return; }
    }

    setGeneratePhase('submitting');
    setErrorMsg(null);
    setFinalVideoUrl(null);

    const poll = await submitAndPoll(
      imageUrl, finalAudioUrl, resolution,
      (videoUrl) => { setFinalVideoUrl(videoUrl); setGeneratePhase('done'); },
      (msg) => { setErrorMsg(msg); setGeneratePhase('error'); },
      audioDuration,
    );
    pollingRef.current = poll;
    if (poll) setGeneratePhase('generating');
  };

  const handleCancel = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setGeneratePhase('idle');
    setTaskId(null);
  };

  const handleDownload = async (url?: string) => {
    const u = url || finalVideoUrl;
    if (!u) return;
    try {
      const res = await fetch(u);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `digital-human-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch { /* ignore */ }
  };

  const handleSave = async (videoUrl?: string, title?: string) => {
    const u = videoUrl || finalVideoUrl;
    if (!u) return;
    try {
      const res = await fetch('/api/inspiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          title: title || `数字人视频 · ${resolution}`,
          media_urls: [u],
          tags: ['数字人', 'AI生成', 'video_material'],
        }),
      });
      const data = await res.json();
      if (data.success) setToast({ message: '已保存到作品库', type: 'success' });
      else setToast({ message: '保存失败', type: 'error' });
    } catch { setToast({ message: '保存失败', type: 'error' }); }
  };

  // ─── AI 写稿 ─────────────────────────────────────────
  const handleGenerateScript = async () => {
    if (!aiTopic.trim()) { setToast({ message: '请输入主题', type: 'error' }); return; }
    setIsGeneratingScript(true);
    setGeneratedScripts([]);
    try {
      const res = await fetch('/api/ai/digital-human/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic, style: aiStyle, targetLength: aiLength,
          variantCount: 3, language: dhMode === 'multi-lang' ? targetLang : 'zh',
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.scripts?.length > 0) {
        setGeneratedScripts(data.data.scripts);
        setSelectedVariant(0);
        setTtsText(data.data.scripts[0]);
      } else {
        setToast({ message: data.error || '脚本生成失败', type: 'error' });
      }
    } catch {
      setToast({ message: '脚本生成请求失败', type: 'error' });
    }
    setIsGeneratingScript(false);
  };

  // ─── 一键成片 ────────────────────────────────────────
  const handleOneClick = async () => {
    if (!imageUrl) { setToast({ message: '请先选择角色图片', type: 'error' }); return; }
    if (!ocTopic.trim()) { setToast({ message: '请输入主题', type: 'error' }); return; }

    ocAbortRef.current = false;
    setOcError(null);

    // Step 1: 写稿
    setOcPhase('scripting');
    try {
      const sRes = await fetch('/api/ai/digital-human/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: ocTopic, style: ocStyle, targetLength: 500, variantCount: 1 }),
      });
      const sData = await sRes.json();
      if (!sData.success) throw new Error(sData.error || '写稿失败');
      const script = sData.data.scripts[0];
      if (ocAbortRef.current) return;

      // Step 2: TTS
      setOcPhase('tts');
      const ttsRes = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: script, voice, speed, pitch }),
      });
      const ttsData = await ttsRes.json();
      if (!ttsData.success || !ttsData.audioBase64) throw new Error(ttsData.error || '配音失败');
      if (ocAbortRef.current) return;

      // Step 3: 上传音频
      setOcPhase('uploading');
      const audUrl = await base64ToUrl(ttsData.audioBase64);
      if (ocAbortRef.current) return;

      // Step 4-6: 提交 + 轮询
      setOcPhase('submitting');
      await new Promise<void>((resolve, reject) => {
        submitAndPoll(imageUrl, audUrl, resolution,
          (videoUrl) => { setFinalVideoUrl(videoUrl); setOcPhase('done'); resolve(); },
          (msg) => { setOcError(msg); setOcPhase('error'); reject(new Error(msg)); },
          audioDuration,
        );
        if (ocAbortRef.current) { setOcPhase('idle'); resolve(); }
      });
    } catch (err: any) {
      if (ocAbortRef.current) { setOcPhase('idle'); return; }
      setOcError(err.message);
      setOcPhase('error');
    }
  };

  // ─── 批量生成 ────────────────────────────────────────
  const addBatchItem = () => {
    const text = batchInput.trim();
    if (!text) return;
    const items = text.split('\n').filter(l => l.trim());
    const newItems: BatchItem[] = items.map(t => ({
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      topic: t,
      script: '',
      audioUrl: null,
      taskId: null,
      videoUrl: null,
      status: 'pending' as const,
    }));
    setBatchItems(prev => [...prev, ...newItems]);
    setBatchInput('');
  };

  const removeBatchItem = (id: string) => {
    setBatchItems(prev => prev.filter(i => i.id !== id));
  };

  const runBatch = async () => {
    if (!imageUrl) { setToast({ message: '请先选择角色图片', type: 'error' }); return; }
    if (batchItems.length === 0) { setToast({ message: '请添加主题', type: 'error' }); return; }

    batchAbortRef.current = false;
    setIsBatchRunning(true);

    for (let i = 0; i < batchItems.length; i++) {
      if (batchAbortRef.current) break;
      const item = batchItems[i];

      const updateItem = (updates: Partial<BatchItem>) => {
        setBatchItems(prev => prev.map(it => it.id === item.id ? { ...it, ...updates } : it));
      };

      try {
        // AI 写稿
        updateItem({ status: 'scripting' });
        const sRes = await fetch('/api/ai/digital-human/script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: item.topic, style: 'oral', targetLength: 400, variantCount: 1 }),
        });
        const sData = await sRes.json();
        if (!sData.success) throw new Error('写稿失败');
        const script = sData.data.scripts[0];
        updateItem({ script });

        // TTS
        updateItem({ status: 'tts' });
        const tRes = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: script, voice, speed, pitch }),
        });
        const tData = await tRes.json();
        if (!tData.success || !tData.audioBase64) throw new Error('配音失败');

        // 上传
        updateItem({ status: 'uploading' });
        const aUrl = await base64ToUrl(tData.audioBase64);
        updateItem({ audioUrl: aUrl });

        // 提交 + 轮询
        updateItem({ status: 'submitting' });
        await new Promise<void>((resolve, reject) => {
          submitAndPoll(imageUrl, aUrl, resolution,
            (videoUrl) => { updateItem({ videoUrl, status: 'done' }); resolve(); },
            (msg) => { updateItem({ errorMsg: msg, status: 'error' }); reject(new Error(msg)); },
            audioDuration,
          );
          setTimeout(() => {
            if (batchAbortRef.current) { updateItem({ status: 'pending' }); resolve(); }
          }, 1000);
        });
      } catch {
        // 错误已在 updateItem 中处理
      }

      // 1秒间隔防止触发速率限制
      if (i < batchItems.length - 1 && !batchAbortRef.current) {
        await new Promise(r => setTimeout(r, 1100));
      }
    }

    setIsBatchRunning(false);
  };

  // ─── 课程拆分 ────────────────────────────────────────
  const handleSplitText = () => {
    if (!courseText.trim()) return;
    const segs = splitLongText(courseText, courseMaxChars);
    setCourseSegments(segs.map((text: string, i: number) => ({
      id: `c_${Date.now()}_${i}`,
      text,
      audioUrl: null,
      taskId: null,
      videoUrl: null,
      status: 'pending' as const,
    })));
  };

  useEffect(() => {
    if (courseText.trim()) handleSplitText();
  }, [courseMaxChars]);

  const runCourse = async () => {
    if (!imageUrl) { setToast({ message: '请先选择角色图片', type: 'error' }); return; }
    if (courseSegments.length === 0) { setToast({ message: '请粘贴文本并拆分', type: 'error' }); return; }

    courseAbortRef.current = false;
    setIsCourseRunning(true);

    for (let i = 0; i < courseSegments.length; i++) {
      if (courseAbortRef.current) break;
      const seg = courseSegments[i];

      const updateSeg = (updates: Partial<typeof courseSegments[0]>) => {
        setCourseSegments(prev => prev.map(s => s.id === seg.id ? { ...s, ...updates } : s));
      };

      try {
        // TTS
        updateSeg({ status: 'tts' });
        const tRes = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: seg.text, voice, speed, pitch }),
        });
        const tData = await tRes.json();
        if (!tData.success || !tData.audioBase64) throw new Error('配音失败');

        // 上传
        updateSeg({ status: 'uploading' });
        const aUrl = await base64ToUrl(tData.audioBase64);
        updateSeg({ audioUrl: aUrl });

        // 提交 + 轮询
        updateSeg({ status: 'submitting' });
        await new Promise<void>((resolve, reject) => {
          submitAndPoll(imageUrl, aUrl, resolution,
            (videoUrl) => { updateSeg({ videoUrl, status: 'done' }); resolve(); },
            (msg) => { updateSeg({ errorMsg: msg, status: 'error' }); reject(new Error(msg)); },
            audioDuration,
          );
          setTimeout(() => {
            if (courseAbortRef.current) { updateSeg({ status: 'pending' }); resolve(); }
          }, 1000);
        });
      } catch { /* handled in updateSeg */ }

      if (i < courseSegments.length - 1 && !courseAbortRef.current) {
        await new Promise(r => setTimeout(r, 1100));
      }
    }

    setIsCourseRunning(false);
  };

  // ─── 导航 ────────────────────────────────────────────
  const handleNavigate = (page: PageKey) => {
    const routes: Record<string, string> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(routes[page] || '/home');
  };

  const canNext = () => {
    if (currentStep === 1) return !!imageUrl;
    if (currentStep === 2) return !!(audioUrl || ttsAudioBase64);
    return true;
  };

  const showProgress = generatePhase === 'uploading_audio' || generatePhase === 'submitting' || generatePhase === 'generating';

  // ══════════════════════════════════════════════════════════
  // 共用：角色图片选择器
  // ══════════════════════════════════════════════════════════

  const renderImagePicker = (compact = false) => (
    <GlassCard>
      {!compact && (
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#06B6D4' }}>Step 1</span> · 选择角色图片
        </p>
      )}
      <div className="flex rounded-lg overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {([
          { key: 'upload' as const, label: '上传', icon: <Upload size={12} /> },
          { key: 'inspiration' as const, label: '灵感库', icon: <ImageIcon size={12} /> },
          { key: 'url' as const, label: '粘贴URL', icon: <Link size={12} /> },
        ]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setImageTab(key)}
            className="flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-all"
            style={{
              background: imageTab === key ? 'rgba(6,182,212,0.2)' : 'transparent',
              color: imageTab === key ? '#67E8F9' : '#9CA3AF',
              fontWeight: imageTab === key ? 600 : 400,
            }}
          >
            {icon} {compact ? '' : label}
          </button>
        ))}
      </div>

      {imageTab === 'upload' && (
        <div className="text-center py-3">
          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="dh-img-upload" />
          <label htmlFor="dh-img-upload" className="flex flex-col items-center gap-2 py-4 px-4 rounded-xl cursor-pointer"
            style={{ border: '2px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}>
            {isUploadingImage ? <Loader2 size={20} color="#67E8F9" className="animate-spin" /> : <Upload size={20} color="#67E8F9" />}
            <span style={{ color: '#9CA3AF', fontSize: 12 }}>{isUploadingImage ? '上传中...' : '点击上传角色照片'}</span>
          </label>
        </div>
      )}

      {imageTab === 'inspiration' && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {inspirations.filter(i => i.type === 'image').length === 0 ? (
            <p style={{ color: '#6B7280', fontSize: 12, textAlign: 'center', padding: 16 }}>暂无图片类灵感</p>
          ) : (
            inspirations.filter(i => i.type === 'image').slice(0, 12).map(item => (
              <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer"
                onClick={() => selectInspirationImage(item)}
                style={{
                  background: selectedInspId === String(item.id) ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.05)',
                  border: selectedInspId === String(item.id) ? '1px solid rgba(6,182,212,0.4)' : '1px solid rgba(255,255,255,0.1)',
                }}>
                {item.media_urls?.[0] ? (
                  <img src={item.media_urls[0]} alt="" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <ImageIcon size={16} color="#6B7280" />
                  </div>
                )}
                <span style={{ color: '#E5E7EB', fontSize: 12 }} className="truncate">{item.title || '未命名'}</span>
              </div>
            ))
          )}
        </div>
      )}

      {imageTab === 'url' && (
        <div className="flex gap-2">
          <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="粘贴图片URL..."
            className="flex-1 px-3 py-2 rounded-xl bg-transparent text-sm outline-none"
            style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
          <button onClick={handleImageUrlConfirm}
            className="px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ background: 'rgba(6,182,212,0.2)', color: '#67E8F9', border: '1px solid rgba(6,182,212,0.3)' }}>
            确认
          </button>
        </div>
      )}

      {imagePreview && (
        <div className="mt-3 flex items-center gap-3">
          <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ border: '2px solid rgba(6,182,212,0.4)' }}>
            <img src={imagePreview} alt="角色" className="w-full h-full object-cover" />
          </div>
          <div>
            <span style={{ color: '#86EFAC', fontSize: 11 }}>✓ 角色已选</span>
            <button onClick={() => { setImageUrl(''); setImagePreview(null); }}
              className="block text-xs mt-0.5" style={{ color: '#F87171' }}>移除</button>
          </div>
        </div>
      )}
    </GlassCard>
  );

  // ══════════════════════════════════════════════════════════
  // 共用：TTS 面板
  // ══════════════════════════════════════════════════════════

  const renderTTSPanel = (text: string, onTextChange: (v: string) => void) => {
    // 火山引擎限制 ≤1000 字节 (utf-8), 中文字符 3 字节 ≈ 300 字上限
    const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length;
    const overBytes = bytes > 1000;
    // 估算时长(中文常见 5 字/秒, speed 1.15 系数, 默认)
    const estimatedSec = Math.ceil(text.length / 5);
    const overSec = estimatedSec > MAX_AUDIO_SECONDS;
    return (
    <>
      <textarea value={text} onChange={e => onTextChange(e.target.value)}
        placeholder="输入要播报的文本内容(建议 300 字以内)..." rows={3} maxLength={1000}
        className="w-full bg-transparent p-3 rounded-xl resize-none outline-none text-sm mb-2"
        style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
      <p style={{ color: (overBytes || overSec) ? '#EF4444' : '#6B7280', fontSize: 10, marginBottom: 8 }}>
        {text.length} 字 / {bytes} 字节 / 预计 {estimatedSec} 秒{overSec ? ` (超过 ${MAX_AUDIO_SECONDS} 秒, 请精简)` : overBytes ? ' (超过 1000 字节)' : ' (建议 300 字以内)'}
      </p>

      <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>音色</p>
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {voices.map(v => (
          <button key={v.key} onClick={() => setVoice(v.key)}
            className="py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: voice === v.key ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
              border: voice === v.key ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
              color: voice === v.key ? '#C4B5FD' : '#9CA3AF',
            }}>{v.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="flex justify-between mb-1">
            <span style={{ color: '#9CA3AF', fontSize: 11 }}>语速</span>
            <span style={{ color: '#C4B5FD', fontSize: 11 }}>{speed.toFixed(2)}x</span>
          </div>
          <input type="range" min="0.5" max="2.0" step="0.05" value={speed}
            onChange={e => setSpeed(parseFloat(e.target.value))} className="w-full accent-purple-500" />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span style={{ color: '#9CA3AF', fontSize: 11 }}>音调</span>
            <span style={{ color: '#C4B5FD', fontSize: 11 }}>{pitch.toFixed(2)}</span>
          </div>
          <input type="range" min="0.5" max="2.0" step="0.05" value={pitch}
            onChange={e => setPitch(parseFloat(e.target.value))} className="w-full accent-purple-500" />
        </div>
      </div>

      <PrimaryButton size="md" onClick={() => handleTTSGenerate(text)} disabled={isGeneratingTTS || !text.trim()}>
        {isGeneratingTTS ? <><Loader2 size={14} className="animate-spin" /> 生成中...</> : <><Mic size={14} /> 生成语音</>}
      </PrimaryButton>

      {ttsAudioBase64 && (
        <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <audio src={`data:audio/mpeg;base64,${ttsAudioBase64}`} controls className="w-full mb-2" style={{ height: 32 }} />
          {audioDuration !== null && (
            <p style={{ color: audioDuration > MAX_AUDIO_SECONDS ? '#EF4444' : '#86EFAC', fontSize: 10, marginBottom: 6 }}>
              实际时长 {audioDuration.toFixed(1)} 秒 {audioDuration > MAX_AUDIO_SECONDS ? `(超过 ${MAX_AUDIO_SECONDS} 秒限制)` : `(${MAX_AUDIO_SECONDS} 秒内 OK)`}
            </p>
          )}
          <button onClick={handleUseTTSAudio} disabled={isUploadingAudio || (audioDuration !== null && audioDuration > MAX_AUDIO_SECONDS)}
            className="w-full py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.3)' }}>
            {isUploadingAudio ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            {isUploadingAudio ? '上传中...' : '使用此音频'}
          </button>
        </div>
      )}
    </>
    );
  };

  // ══════════════════════════════════════════════════════════
  // 共用：音频上传面板
  // ══════════════════════════════════════════════════════════

  const renderAudioUploadPanel = () => (
    <div className="text-center py-4">
      <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" id="dh-audio-up" />
      <label htmlFor="dh-audio-up" className="flex flex-col items-center gap-2 py-6 px-4 rounded-xl cursor-pointer"
        style={{ border: '2px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}>
        {isUploadingAudio ? <Loader2 size={24} color="#C4B5FD" className="animate-spin" /> : <Music size={24} color="#C4B5FD" />}
        <span style={{ color: '#9CA3AF', fontSize: 12 }}>{isUploadingAudio ? '上传中...' : '上传音频文件'}</span>
        <span style={{ color: '#6B7280', fontSize: 10 }}>支持 MP3 / WAV</span>
      </label>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // 共用：音频就绪指示器
  // ══════════════════════════════════════════════════════════

  const renderAudioReady = () => (
    audioUrl ? (
      <div className="mt-3 p-3 rounded-xl flex items-center gap-3" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <CheckCircle2 size={16} color="#22C55E" />
        <div className="flex-1">
          <span style={{ color: '#86EFAC', fontSize: 12 }}>音频已就绪</span>
          {audioDuration !== null && (
            <span style={{ color: audioDuration > MAX_AUDIO_SECONDS ? '#EF4444' : '#9CA3AF', fontSize: 10, marginLeft: 8 }}>
              {audioDuration.toFixed(1)} 秒 {audioDuration > MAX_AUDIO_SECONDS ? `⚠️ 超过 ${MAX_AUDIO_SECONDS} 秒` : ''}
            </span>
          )}
        </div>
        <audio src={audioUrl} controls className="ml-auto" style={{ height: 28, maxWidth: 160 }} />
      </div>
    ) : null
  );

  // ══════════════════════════════════════════════════════════
  // 共用：生成结果
  // ══════════════════════════════════════════════════════════

  const renderVideoResult = (videoUrl: string, onSave?: () => void) => (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2 p-2 rounded-lg"
        style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
        <CheckCircle2 size={14} color="#22C55E" />
        <span style={{ color: '#86EFAC', fontSize: 12 }}>数字人视频生成完成</span>
      </div>
      <video src={videoUrl} controls playsInline className="w-full rounded-xl mb-3"
        style={{ background: '#000', maxHeight: 360 }} />
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: <Download size={15} />, label: '下载', action: () => handleDownload(videoUrl) },
          { icon: <Save size={15} />, label: '保存', action: () => onSave ? onSave() : handleSave(videoUrl) },
          { icon: <RefreshCw size={15} />, label: '重新生成', action: () => { setFinalVideoUrl(null); setGeneratePhase('idle'); setOcPhase('idle'); setOcError(null); } },
        ].map(({ icon, label, action }) => (
          <button key={label} onClick={action}
            className="flex flex-col items-center gap-1 py-2 rounded-xl text-xs"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#E5E7EB' }}>
            <span style={{ color: '#06B6D4' }}>{icon}</span> {label}
          </button>
        ))}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // 模式：manual
  // ══════════════════════════════════════════════════════════

  const renderManualMode = () => (
    <>
      {/* Step 指示器 */}
      <div className="overflow-x-auto">
        <div className="flex gap-0 min-w-max justify-center">
          {STEPS.map((step, i) => {
            const si = i + 1;
            return (
              <button key={step} onClick={() => { if (si <= currentStep && !showProgress) setCurrentStep(si); }}
                className="flex flex-col items-center gap-1 px-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: si === currentStep ? '#06B6D4' : si < currentStep ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)',
                    border: si === currentStep ? 'none' : si < currentStep ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.2)',
                    color: si === currentStep ? '#FFFFFF' : si < currentStep ? '#86EFAC' : '#9CA3AF',
                    boxShadow: si === currentStep ? '0 0 12px rgba(6,182,212,0.5)' : 'none',
                  }}>{si < currentStep ? '✓' : si}</div>
                <span style={{
                  color: si === currentStep ? '#06B6D4' : si < currentStep ? '#86EFAC' : '#9CA3AF',
                  fontSize: 10, whiteSpace: 'nowrap',
                }}>{step}</span>
              </button>
            );
          })}
        </div>
      </div>

      {currentStep === 1 && renderImagePicker()}

      {currentStep === 2 && (
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: '#8B5CF6' }}>Step 2</span> · 音频来源
          </p>
          <div className="flex rounded-lg overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
            {([
              { key: 'tts' as const, label: '文字转语音', icon: <Mic size={12} /> },
              { key: 'upload' as const, label: '上传音频', icon: <Music size={12} /> },
            ]).map(({ key, label, icon }) => (
              <button key={key} onClick={() => setAudioTab(key)}
                className="flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-all"
                style={{
                  background: audioTab === key ? 'rgba(139,92,246,0.2)' : 'transparent',
                  color: audioTab === key ? '#C4B5FD' : '#9CA3AF',
                  fontWeight: audioTab === key ? 600 : 400,
                }}>{icon} {label}</button>
            ))}
          </div>
          {audioTab === 'tts' ? renderTTSPanel(ttsText, setTtsText) : renderAudioUploadPanel()}
          {renderAudioReady()}
        </GlassCard>
      )}

      {currentStep === 3 && (
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: '#F59E0B' }}>Step 3</span> · 参数设置
          </p>
          <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>分辨率</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {RESOLUTION_OPTIONS.map(({ key, label, cost }) => (
              <button key={key} onClick={() => setResolution(key)}
                className="flex flex-col items-center gap-1 py-3 rounded-xl transition-all"
                style={{
                  background: resolution === key ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                  border: resolution === key ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.1)',
                }}>
                <span style={{ color: resolution === key ? '#FCD34D' : '#E5E7EB', fontSize: 16, fontWeight: 700 }}>{label}</span>
                <span style={{ color: '#9CA3AF', fontSize: 10 }}>{cost}</span>
              </button>
            ))}
          </div>
          <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>生成摘要</p>
            <div className="flex items-center gap-3">
              {imagePreview && <img src={imagePreview} alt="" className="w-10 h-10 rounded-lg object-cover" />}
              <div>
                <span style={{ color: '#E5E7EB', fontSize: 12 }}>数字人口播视频 · {resolution}</span>
                <br />
                <span style={{ color: '#FCD34D', fontSize: 11 }}>预估 {resolution === '720P' ? '~0.45' : '~0.30'} 元/秒</span>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {currentStep === 4 && (
        <GlassCard>
          {generatePhase === 'idle' ? (
            <div className="text-center py-4">
              <Wand2 size={32} color="#06B6D4" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>准备生成数字人视频</p>
              <p style={{ color: '#9CA3AF', fontSize: 12 }}>{resolution} · 音频驱动数字人</p>
            </div>
          ) : generatePhase === 'done' ? (
            renderVideoResult(finalVideoUrl!)
          ) : generatePhase === 'error' ? (
            <div className="flex flex-col items-center py-8 gap-4">
              <XCircle size={40} color="#EF4444" />
              <p style={{ color: '#FCA5A5', fontSize: 14 }}>{errorMsg || '生成失败'}</p>
              <PrimaryButton size="sm" onClick={() => { setGeneratePhase('idle'); setErrorMsg(null); }}>
                <RefreshCw size={14} /> 重试
              </PrimaryButton>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                <div className="absolute inset-3 rounded-full border-2 border-purple-400 border-b-transparent animate-spin"
                  style={{ animationDuration: '0.7s', animationDirection: 'reverse' }} />
              </div>
              <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>
                {generatePhase === 'uploading_audio' ? '正在上传音频...' :
                 generatePhase === 'submitting' ? '正在提交任务...' : '正在生成数字人视频...'}
              </p>
              <button onClick={handleCancel}
                className="px-4 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>取消</button>
            </div>
          )}
        </GlassCard>
      )}

      {/* 导航按钮 */}
      {!showProgress && generatePhase !== 'done' && (
        <div className="flex gap-3">
          {currentStep > 1 && (
            <PrimaryButton variant="ghost" size="md" onClick={() => setCurrentStep(currentStep - 1)}>
              <ChevronLeft size={16} /> 上一步
            </PrimaryButton>
          )}
          {currentStep < 4 && (
            <PrimaryButton fullWidth size="md" onClick={() => setCurrentStep(currentStep + 1)} disabled={!canNext()}>
              下一步 <ChevronRight size={16} />
            </PrimaryButton>
          )}
          {currentStep === 4 && generatePhase === 'idle' && (
            <PrimaryButton fullWidth size="lg" onClick={handleGenerate} disabled={!canNext()}>
              <Wand2 size={18} /> 开始生成数字人
            </PrimaryButton>
          )}
        </div>
      )}
    </>
  );

  // ══════════════════════════════════════════════════════════
  // 模式：AI 写稿
  // ══════════════════════════════════════════════════════════

  const renderAIWriteMode = () => (
    <>
      {renderImagePicker()}

      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#3B82F6' }}>AI 写稿</span> · 生成口播脚本
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>主题</p>
            <input value={aiTopic} onChange={e => setAiTopic(e.target.value)}
              placeholder="输入主题，例如：AI如何改变教育"
              className="w-full bg-transparent px-3 py-2 rounded-xl text-sm outline-none"
              style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>风格</p>
            <div className="grid grid-cols-2 gap-2">
              {ORAL_STYLES.map(({ key, label, desc }) => (
                <button key={key} onClick={() => setAiStyle(key)}
                  className="py-2 px-3 rounded-xl text-xs text-left transition-all"
                  style={{
                    background: aiStyle === key ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                    border: aiStyle === key ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  }}>
                  <span style={{ color: aiStyle === key ? '#93C5FD' : '#E5E7EB', fontWeight: 600 }}>{label}</span>
                  <span style={{ color: '#9CA3AF', fontSize: 10, display: 'block' }}>{desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span style={{ color: '#9CA3AF', fontSize: 11 }}>字数</span>
              <span style={{ color: '#93C5FD', fontSize: 11 }}>{aiLength}字</span>
            </div>
            <input type="range" min="100" max="1500" step="50" value={aiLength}
              onChange={e => setAiLength(parseInt(e.target.value))} className="w-full accent-blue-500" />
          </div>
        </div>

        <PrimaryButton size="md" onClick={handleGenerateScript} disabled={isGeneratingScript || !aiTopic.trim()}>
          {isGeneratingScript ? <><Loader2 size={14} className="animate-spin" /> 生成中...</> : <><Wand2 size={14} /> AI 生成脚本</>}
        </PrimaryButton>

        {generatedScripts.length > 0 && (
          <div className="mt-4 space-y-2">
            <p style={{ color: '#9CA3AF', fontSize: 11 }}>选择脚本变体</p>
            {generatedScripts.map((s, i) => (
              <div key={i} onClick={() => { setSelectedVariant(i); setTtsText(s); }}
                className="p-3 rounded-xl cursor-pointer text-sm transition-all"
                style={{
                  background: selectedVariant === i ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
                  border: selectedVariant === i ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  color: '#E5E7EB', maxHeight: 120, overflowY: 'auto',
                }}>
                <span style={{ color: selectedVariant === i ? '#93C5FD' : '#9CA3AF', fontSize: 10, fontWeight: 600 }}>
                  变体 {i + 1} {selectedVariant === i ? '✓' : ''}
                </span>
                <p className="mt-1 whitespace-pre-wrap" style={{ lineHeight: 1.5 }}>{s}</p>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* TTS + 生成 */}
      {selectedVariant >= 0 && generatedScripts[selectedVariant] && (
        <>
          <GlassCard>
            <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              <span style={{ color: '#8B5CF6' }}>配音 & 生成</span>
            </p>
            {renderTTSPanel(ttsText, setTtsText)}
            {renderAudioReady()}
          </GlassCard>

          <GlassCard>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>分辨率</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {RESOLUTION_OPTIONS.map(({ key, label, cost }) => (
                <button key={key} onClick={() => setResolution(key)}
                  className="flex flex-col items-center gap-1 py-2 rounded-xl transition-all"
                  style={{
                    background: resolution === key ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                    border: resolution === key ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  }}>
                  <span style={{ color: resolution === key ? '#FCD34D' : '#E5E7EB', fontSize: 14, fontWeight: 700 }}>{label}</span>
                </button>
              ))}
            </div>

            {generatePhase === 'done' ? renderVideoResult(finalVideoUrl!) :
             generatePhase === 'error' ? (
              <div className="flex flex-col items-center py-4 gap-2">
                <XCircle size={30} color="#EF4444" />
                <p style={{ color: '#FCA5A5', fontSize: 13 }}>{errorMsg || '生成失败'}</p>
                <PrimaryButton size="sm" onClick={() => { setGeneratePhase('idle'); setErrorMsg(null); }}>
                  <RefreshCw size={14} /> 重试
                </PrimaryButton>
              </div>
            ) : showProgress ? (
              <div className="flex flex-col items-center py-6 gap-3">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                </div>
                <p style={{ color: '#FFFFFF', fontSize: 14 }}>
                  {generatePhase === 'uploading_audio' ? '上传音频...' : generatePhase === 'submitting' ? '提交中...' : '生成中...'}
                </p>
                <button onClick={handleCancel} className="px-3 py-1 rounded-lg text-xs"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#FCA5A5' }}>取消</button>
              </div>
            ) : (
              <PrimaryButton fullWidth size="lg" onClick={handleGenerate} disabled={!imageUrl || !audioUrl}>
                <Wand2 size={18} /> 开始生成数字人
              </PrimaryButton>
            )}
          </GlassCard>
        </>
      )}
    </>
  );

  // ══════════════════════════════════════════════════════════
  // 模式：一键成片
  // ══════════════════════════════════════════════════════════

  const OC_PHASES: Record<string, string> = {
    idle: '准备中', scripting: 'AI 写稿中', tts: '语音合成中',
    uploading: '上传音频中', submitting: '提交任务中', generating: '生成视频中',
    done: '完成', error: '出错',
  };

  const renderOneClickMode = () => (
    <>
      {renderImagePicker()}

      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#F43F5E' }}>⚡ 一键成片</span> · 全自动流水线
        </p>
        <input value={ocTopic} onChange={e => setOcTopic(e.target.value)}
          placeholder="输入主题，例如：产品发布介绍、知识科普..."
          className="w-full bg-transparent px-3 py-3 rounded-xl text-sm outline-none mb-3"
          style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>风格</p>
            <div className="grid grid-cols-2 gap-1">
              {ORAL_STYLES.map(({ key, label }) => (
                <button key={key} onClick={() => setOcStyle(key)}
                  className="py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: ocStyle === key ? 'rgba(244,63,94,0.15)' : 'rgba(255,255,255,0.06)',
                    border: ocStyle === key ? '1px solid rgba(244,63,94,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    color: ocStyle === key ? '#FDA4AF' : '#9CA3AF',
                  }}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>音色</p>
            <div className="grid grid-cols-2 gap-1 max-h-28 overflow-y-auto">
              {voices.slice(0, 4).map(v => (
                <button key={v.key} onClick={() => setVoice(v.key)}
                  className="py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: voice === v.key ? 'rgba(244,63,94,0.15)' : 'rgba(255,255,255,0.06)',
                    border: voice === v.key ? '1px solid rgba(244,63,94,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    color: voice === v.key ? '#FDA4AF' : '#9CA3AF',
                  }}>{v.label}</button>
              ))}
            </div>
          </div>
        </div>

        <p style={{ color: '#9CA3AF', fontSize: 10, marginBottom: 12 }}>
          分辨率: {resolution} · 预估 ~{resolution === '720P' ? '0.45' : '0.30'} 元/秒
        </p>

        {ocPhase === 'idle' ? (
          <PrimaryButton fullWidth size="lg" onClick={handleOneClick} disabled={!imageUrl || !ocTopic.trim()}>
            <Zap size={18} /> 一键成片
          </PrimaryButton>
        ) : ocPhase === 'done' ? (
          renderVideoResult(finalVideoUrl!)
        ) : ocPhase === 'error' ? (
          <div className="flex flex-col items-center py-4 gap-2">
            <XCircle size={30} color="#EF4444" />
            <p style={{ color: '#FCA5A5', fontSize: 13 }}>{ocError || '生成失败'}</p>
            <button onClick={() => { setOcPhase('idle'); setOcError(null); }}
              className="px-4 py-1.5 rounded-lg text-xs"
              style={{ background: 'rgba(244,63,94,0.15)', color: '#FDA4AF', border: '1px solid rgba(244,63,94,0.3)' }}>
              重试
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-2 border-rose-400 border-t-transparent animate-spin" />
              <div className="absolute inset-3 rounded-full border-2 border-amber-400 border-b-transparent animate-spin"
                style={{ animationDuration: '0.7s', animationDirection: 'reverse' }} />
            </div>
            <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>{OC_PHASES[ocPhase]}</p>
            <p style={{ color: '#9CA3AF', fontSize: 11 }}>
              {ocPhase === 'generating' ? '唇形同步 + 表情生成，预计 2-5 分钟' : '请稍候...'}
            </p>
            <button onClick={() => { ocAbortRef.current = true; setOcPhase('idle'); }}
              className="px-4 py-1.5 rounded-lg text-xs"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>取消</button>
          </div>
        )}
      </GlassCard>
    </>
  );

  // ══════════════════════════════════════════════════════════
  // 模式：批量生成
  // ══════════════════════════════════════════════════════════

  const renderBatchMode = () => (
    <>
      {renderImagePicker()}

      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#F59E0B' }}>📦 批量生成</span> · {batchItems.length} 个主题
        </p>

        {/* 添加主题 */}
        <div className="flex gap-2 mb-3">
          <input value={batchInput} onChange={e => setBatchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addBatchItem(); }}
            placeholder="输入主题，每行一个..."
            className="flex-1 bg-transparent px-3 py-2 rounded-xl text-sm outline-none"
            style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
          <button onClick={addBatchItem} className="px-4 py-2 rounded-xl text-xs flex items-center gap-1"
            style={{ background: 'rgba(245,158,11,0.2)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.3)' }}>
            <Plus size={14} /> 添加
          </button>
        </div>

        {/* 音色 + 分辨率 */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 10, marginBottom: 2 }}>音色</p>
            <select value={voice} onChange={e => setVoice(e.target.value)}
              className="w-full bg-transparent px-2 py-1.5 rounded-lg text-xs outline-none"
              style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}>
              {voices.map(v => <option key={v.key} value={v.key} style={{ background: '#0F172A' }}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 10, marginBottom: 2 }}>分辨率</p>
            <select value={resolution} onChange={e => setResolution(e.target.value as '480P' | '720P')}
              className="w-full bg-transparent px-2 py-1.5 rounded-lg text-xs outline-none"
              style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}>
              <option value="720P" style={{ background: '#0F172A' }}>720P (~0.45元/秒)</option>
              <option value="480P" style={{ background: '#0F172A' }}>480P (~0.30元/秒)</option>
            </select>
          </div>
        </div>

        {/* 主题列表 */}
        {batchItems.length > 0 && (
          <div className="space-y-2 max-h-80 overflow-y-auto mb-3">
            {batchItems.map((item, idx) => {
              const st = BATCH_STATUS_LABELS[item.status];
              return (
                <div key={item.id} className="p-2.5 rounded-xl"
                  style={{ background: st.bg, border: item.status === 'done' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span style={{ color: '#6B7280', fontSize: 11, flexShrink: 0 }}>#{idx + 1}</span>
                      <span className="truncate" style={{ color: '#E5E7EB', fontSize: 12 }}>{item.topic}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.status === 'done' ? (
                        <CheckCircle2 size={14} color="#22C55E" />
                      ) : item.status === 'error' ? (
                        <XCircle size={14} color="#EF4444" />
                      ) : item.status !== 'pending' ? (
                        <Loader2 size={14} color={st.color} className="animate-spin" />
                      ) : null}
                      <span style={{ color: st.color, fontSize: 10, fontWeight: 600 }}>{st.text}</span>
                      {!isBatchRunning && (
                        <button onClick={() => removeBatchItem(item.id)}>
                          <Trash2 size={12} color="#6B7280" />
                        </button>
                      )}
                    </div>
                  </div>
                  {item.videoUrl && (
                    <div className="mt-2">
                      <video src={item.videoUrl} controls playsInline className="w-full rounded-lg"
                        style={{ background: '#000', maxHeight: 200 }} />
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => handleDownload(item.videoUrl!)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs"
                          style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF' }}>
                          <Download size={11} /> 下载
                        </button>
                        <button onClick={() => handleSave(item.videoUrl!, item.topic)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs"
                          style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF' }}>
                          <Save size={11} /> 保存
                        </button>
                      </div>
                    </div>
                  )}
                  {item.status === 'error' && item.errorMsg && (
                    <p style={{ color: '#FCA5A5', fontSize: 10, marginTop: 4 }}>{item.errorMsg}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 操作按钮 */}
        {isBatchRunning ? (
          <button onClick={() => { batchAbortRef.current = true; }}
            className="w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            <Square size={14} /> 停止生成
          </button>
        ) : (
          <PrimaryButton fullWidth size="lg" onClick={runBatch}
            disabled={batchItems.length === 0 || !imageUrl}>
            <Zap size={18} /> 开始批量生成 ({batchItems.length} 个)
          </PrimaryButton>
        )}

        {/* 进度统计 */}
        {batchItems.length > 0 && (
          <div className="mt-2 flex gap-3 text-xs" style={{ color: '#9CA3AF' }}>
            <span>总计: {batchItems.length}</span>
            <span style={{ color: '#86EFAC' }}>完成: {batchItems.filter(i => i.status === 'done').length}</span>
            <span style={{ color: '#FCA5A5' }}>失败: {batchItems.filter(i => i.status === 'error').length}</span>
            <span style={{ color: '#FCD34D' }}>等待: {batchItems.filter(i => i.status === 'pending').length}</span>
          </div>
        )}
      </GlassCard>
    </>
  );

  // ══════════════════════════════════════════════════════════
  // 模式：多语言
  // ══════════════════════════════════════════════════════════

  const renderMultiLangMode = () => (
    <>
      {renderImagePicker()}

      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#22C55E' }}>🌐 多语言播报</span> · 同一角色多语种
        </p>

        {/* 语言选择 */}
        <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>目标语言</p>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {LANGUAGES.map(({ key, label, native }) => (
            <button key={key} onClick={() => setTargetLang(key)}
              className="flex flex-col items-center gap-1 py-2 rounded-xl transition-all"
              style={{
                background: targetLang === key ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                border: targetLang === key ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.1)',
              }}>
              <span style={{ fontSize: 16 }}>{native}</span>
              <span style={{ color: targetLang === key ? '#86EFAC' : '#9CA3AF', fontSize: 10 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* AI 写稿（多语言） */}
        <div className="space-y-3 mb-4">
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>主题（用{targetLang === 'zh' ? '中文' : targetLang === 'en' ? 'English' : targetLang === 'ja' ? '日本語' : '한국어'}输入）</p>
            <input value={aiTopic} onChange={e => setAiTopic(e.target.value)}
              placeholder={targetLang === 'en' ? 'Enter a topic...' : targetLang === 'ja' ? 'トピックを入力...' : targetLang === 'ko' ? '주제를 입력...' : '输入主题...'}
              className="w-full bg-transparent px-3 py-2 rounded-xl text-sm outline-none"
              style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span style={{ color: '#9CA3AF', fontSize: 11 }}>字数</span>
              <span style={{ color: '#86EFAC', fontSize: 11 }}>{aiLength}字</span>
            </div>
            <input type="range" min="100" max="1500" step="50" value={aiLength}
              onChange={e => setAiLength(parseInt(e.target.value))} className="w-full accent-green-500" />
          </div>
        </div>

        <PrimaryButton size="md" onClick={handleGenerateScript} disabled={isGeneratingScript || !aiTopic.trim()}>
          {isGeneratingScript ? <><Loader2 size={14} className="animate-spin" /> 生成中...</> : <><Globe size={14} /> 生成{targetLang === 'zh' ? '中文' : targetLang === 'en' ? '英文' : targetLang === 'ja' ? '日文' : '韩文'}脚本</>}
        </PrimaryButton>

        {generatedScripts.length > 0 && (
          <div className="mt-4 space-y-2">
            <p style={{ color: '#9CA3AF', fontSize: 11 }}>脚本预览</p>
            {generatedScripts.map((s, i) => (
              <div key={i} onClick={() => { setSelectedVariant(i); setTtsText(s); }}
                className="p-3 rounded-xl cursor-pointer text-sm transition-all"
                style={{
                  background: selectedVariant === i ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                  border: selectedVariant === i ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  color: '#E5E7EB', maxHeight: 100, overflowY: 'auto',
                }}>
                <span style={{ color: selectedVariant === i ? '#86EFAC' : '#9CA3AF', fontSize: 10 }}>
                  变体 {i + 1} {selectedVariant === i ? '✓' : ''}
                </span>
                <p className="mt-1 whitespace-pre-wrap" style={{ lineHeight: 1.5 }}>{s}</p>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {selectedVariant >= 0 && generatedScripts[selectedVariant] && (
        <>
          <GlassCard>
            <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              <span style={{ color: '#8B5CF6' }}>配音 & 生成</span> · {LANGUAGES.find(l => l.key === targetLang)?.label}
            </p>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 8 }}>
              提示：当前音色为中文音色，朗读非中文文本时可能带有口音
            </p>
            {renderTTSPanel(ttsText, setTtsText)}
            {renderAudioReady()}
          </GlassCard>

          <GlassCard>
            {generatePhase === 'done' ? renderVideoResult(finalVideoUrl!) :
             generatePhase === 'error' ? (
              <div className="flex flex-col items-center py-4 gap-2">
                <XCircle size={30} color="#EF4444" />
                <p style={{ color: '#FCA5A5', fontSize: 13 }}>{errorMsg || '生成失败'}</p>
                <PrimaryButton size="sm" onClick={() => { setGeneratePhase('idle'); setErrorMsg(null); }}>
                  <RefreshCw size={14} /> 重试
                </PrimaryButton>
              </div>
            ) : showProgress ? (
              <div className="flex flex-col items-center py-4 gap-3">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                </div>
                <p style={{ color: '#FFFFFF', fontSize: 13 }}>生成中...</p>
                <button onClick={handleCancel} className="px-3 py-1 rounded-lg text-xs"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#FCA5A5' }}>取消</button>
              </div>
            ) : (
              <PrimaryButton fullWidth size="lg" onClick={handleGenerate} disabled={!imageUrl || !audioUrl}>
                <Wand2 size={18} /> 生成{targetLang === 'zh' ? '中文' : targetLang === 'en' ? '英文' : targetLang === 'ja' ? '日文' : '韩文'}数字人
              </PrimaryButton>
            )}
          </GlassCard>
        </>
      )}
    </>
  );

  // ══════════════════════════════════════════════════════════
  // 模式：课程/培训
  // ══════════════════════════════════════════════════════════

  const renderCourseMode = () => (
    <>
      {renderImagePicker()}

      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <span style={{ color: '#8B5CF6' }}>📖 课程/培训</span> · 长文本拆分口播
        </p>

        {/* 文本输入 */}
        <textarea value={courseText} onChange={e => { setCourseText(e.target.value); }}
          onBlur={handleSplitText}
          placeholder="粘贴课件、培训材料、演讲稿等长文本内容..."
          rows={6} maxLength={10000}
          className="w-full bg-transparent p-3 rounded-xl resize-none outline-none text-sm mb-2"
          style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
        <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 10 }}>{courseText.length}/10000</p>

        {/* 分段设置 */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="flex justify-between mb-1">
              <span style={{ color: '#9CA3AF', fontSize: 11 }}>每段最大字数</span>
              <span style={{ color: '#C4B5FD', fontSize: 11 }}>{courseMaxChars}字</span>
            </div>
            <input type="range" min="200" max="2000" step="50" value={courseMaxChars}
              onChange={e => setCourseMaxChars(parseInt(e.target.value))} className="w-full accent-purple-500" />
          </div>
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 10, marginBottom: 2 }}>音色</p>
            <select value={voice} onChange={e => setVoice(e.target.value)}
              className="w-full bg-transparent px-2 py-1.5 rounded-lg text-xs outline-none"
              style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}>
              {voices.map(v => <option key={v.key} value={v.key} style={{ background: '#0F172A' }}>{v.label}</option>)}
            </select>
          </div>
        </div>

        {/* 拆分预览 */}
        {courseSegments.length > 0 && (
          <div className="mb-3 space-y-2 max-h-64 overflow-y-auto">
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>
              拆分预览 · {courseSegments.length} 段 · 总字数 {courseSegments.reduce((s, seg) => s + seg.text.length, 0)}
            </p>
            {courseSegments.map((seg, idx) => (
              <div key={seg.id} className="p-2.5 rounded-xl" style={{
                background: seg.status === 'done' ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
                border: seg.status === 'done' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.08)',
              }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'rgba(139,92,246,0.2)', color: '#C4B5FD' }}>{idx + 1}</span>
                    <span style={{ color: '#9CA3AF', fontSize: 10 }}>{seg.text.length}字</span>
                  </div>
                  {seg.status === 'done' && <CheckCircle2 size={12} color="#22C55E" />}
                  {seg.status === 'error' && <XCircle size={12} color="#EF4444" />}
                  {(seg.status !== 'pending' && seg.status !== 'done' && seg.status !== 'error') && (
                    <Loader2 size={12} color="#C4B5FD" className="animate-spin" />
                  )}
                </div>
                <p style={{ color: '#D1D5DB', fontSize: 11, lineHeight: 1.4 }} className="line-clamp-2">
                  {seg.text.substring(0, 100)}{seg.text.length > 100 ? '...' : ''}
                </p>
                {seg.videoUrl && (
                  <div className="mt-2">
                    <video src={seg.videoUrl} controls playsInline className="w-full rounded-lg"
                      style={{ background: '#000', maxHeight: 160 }} />
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => handleDownload(seg.videoUrl!)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                        style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF' }}>
                        <Download size={11} /> 下载
                      </button>
                      <button onClick={() => handleSave(seg.videoUrl ?? undefined, `课程段落 ${idx + 1}`)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                        style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF' }}>
                        <Save size={11} /> 保存
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        {isCourseRunning ? (
          <button onClick={() => { courseAbortRef.current = true; }}
            className="w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            <Square size={14} /> 停止生成
          </button>
        ) : (
          <>
            <PrimaryButton size="sm" variant="ghost" onClick={handleSplitText} disabled={!courseText.trim()}>
              <RefreshCw size={14} /> 重新拆分
            </PrimaryButton>
            <div className="mt-2">
              <PrimaryButton fullWidth size="lg" onClick={runCourse}
                disabled={courseSegments.length === 0 || !imageUrl || isCourseRunning}>
                <Zap size={18} /> 生成全部 {courseSegments.length} 段
              </PrimaryButton>
            </div>
          </>
        )}
      </GlassCard>
    </>
  );

  // ══════════════════════════════════════════════════════════
  // 主渲染
  // ══════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <TopNav title="AI 数字人" showBack onBack={() => router.push('/ai')} />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* 模式选择 chip bar */}
        <div className="overflow-x-auto -mx-4 px-4 pb-1">
          <div className="flex gap-2 min-w-max">
            {MODES.map(({ key, label, icon, desc }) => (
              <button key={key} onClick={() => {
                setDhMode(key);
                setGeneratePhase('idle');
                setFinalVideoUrl(null);
                setErrorMsg(null);
                setOcPhase('idle');
                setOcError(null);
              }}
                className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all flex-shrink-0"
                style={{
                  background: dhMode === key ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)',
                  border: dhMode === key ? '1px solid rgba(6,182,212,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: dhMode === key ? '0 0 12px rgba(6,182,212,0.2)' : 'none',
                }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <span style={{
                  color: dhMode === key ? '#67E8F9' : '#9CA3AF',
                  fontSize: 11, fontWeight: dhMode === key ? 700 : 400,
                }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 模式内容 */}
        {dhMode === 'manual' && renderManualMode()}
        {dhMode === 'ai-write' && renderAIWriteMode()}
        {dhMode === 'one-click' && renderOneClickMode()}
        {dhMode === 'batch' && renderBatchMode()}
        {dhMode === 'multi-lang' && renderMultiLangMode()}
        {dhMode === 'course' && renderCourseMode()}
      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function DigitalHumanPage() {
  return (
    <ProtectedRoute>
      <DigitalHumanContent />
    </ProtectedRoute>
  );
}
