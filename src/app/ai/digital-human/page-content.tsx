'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Zap, ChevronLeft, ChevronRight, Play, Download, Save, RefreshCw,
  AlertCircle, Loader2, CheckCircle2, XCircle, Wand2,
  ImageIcon, Upload, Link, Mic, Music, Volume2,
  FileText, Globe, BookOpen, Layers, ChevronDown, ChevronUp,
  Settings, Trash2, Plus, Square, Share2, Video as VideoIcon, ArrowRight,
  Sparkles, FolderOpen, UserCircle2, Check,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProtectedRoute } from '@/components';
import { Toast } from '@/components/Toast';
import { useContentHandoff } from '@/hooks/use-content-handoff';
import { useWorkflowSession } from '@/hooks/use-workflow-session';
import { useWorkHistory } from '@/hooks/use-work-history';
import { WorkflowSessionBar } from '@/components/WorkflowSessionBar';
import { apiClient } from '@/lib/api-client';

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

type DigitalHumanMode = 'manual' | 'ai-write' | 'one-click' | 'batch' | 'multi-lang' | 'animate' | 'avatar';

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
  { key: 'one-click', label: '一键生数字人', icon: '⚡', desc: '全自动流水线' },
  { key: 'ai-write', label: 'AI 写稿', icon: '✍️', desc: '主题→AI脚本' },
  { key: 'batch', label: '批量生成', icon: '📦', desc: '20s 短视频合集' },
  { key: 'multi-lang', label: '多语言', icon: '🌐', desc: '20s 多语种短讲解' },
  { key: 'animate', label: '用我的形象', icon: '🎭', desc: '角色动作迁移' },
  { key: 'avatar', label: '用我的分身', icon: '🧬', desc: '数字分身口播' },
  { key: 'manual', label: '手动配置', icon: '⚙️', desc: '逐步设置' },
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
  const { receive, handoff } = useContentHandoff();
  const workflowSessionId = searchParams.get('workflow_session_id') || undefined;
  const { session, isInWorkflow, completeCurrentStep, pauseSession, resumeSession, abandonSession } = useWorkflowSession(workflowSessionId);

  // ─── 模式 ─────────────────────────────────────────────
  const [dhMode, setDhMode] = useState<DigitalHumanMode>('one-click');

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
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null); // 声音克隆 ID

  // ─── Animate 模式（角色动作迁移，wan2.2-animate）──
  const [animateRefImageUrl, setAnimateRefImageUrl] = useState('');
  const [animateMotionVideoUrl, setAnimateMotionVideoUrl] = useState('');
  const [animateMode, setAnimateMode] = useState<'animate' | 'replace'>('animate');
  const [animateResolution, setAnimateResolution] = useState<'480P' | '720P'>('720P');
  const [animateTaskId, setAnimateTaskId] = useState<string | null>(null);
  const [animatePhase, setAnimatePhase] = useState<'idle' | 'submitting' | 'running' | 'done' | 'failed'>('idle');
  const [animateResultUrl, setAnimateResultUrl] = useState<string | null>(null);
  const [animateError, setAnimateError] = useState<string | null>(null);
  const animatePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 数字分身模式（HeyGen lookalike）────────────
  const [avatarInfo, setAvatarInfo] = useState<{ avatarId: string; name: string; status: string } | null>(null);
  const [avatarScript, setAvatarScript] = useState('');
  const [avatarVideoId, setAvatarVideoId] = useState<string | null>(null);
  const [avatarPhase, setAvatarPhase] = useState<'idle' | 'submitting' | 'processing' | 'done' | 'failed'>('idle');
  const [avatarResultUrl, setAvatarResultUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (dhMode !== 'avatar') return;
    try {
      const raw = localStorage.getItem('lingji_avatar_info');
      if (raw) {
        const info = JSON.parse(raw);
        setAvatarInfo({ avatarId: info.avatarId, name: info.name, status: info.status });
        if (searchParams.get('avatarId') && searchParams.get('avatarId') === info.avatarId) {
          // 从 profile/settings 跳转过来,自动滚动到表单
        }
      }
    } catch {}
  }, [dhMode, searchParams]);

  useEffect(() => () => {
    if (avatarPollRef.current) clearInterval(avatarPollRef.current);
  }, []);
  const [isUploadingMotionVideo, setIsUploadingMotionVideo] = useState(false);

  // 加载已保存的克隆音色
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('lingji_cloned_voice_id');
    if (stored) setClonedVoiceId(stored);
  }, []);

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
      measureAudioDuration(params.audioUrl).then(d => setAudioDuration(d)).catch(() => {});
    }
    if (params.text || params.script) {
      setTtsText((params.text || params.script || '').slice(0, 1000));
      setOcTopic((params.text || params.script || '').slice(0, 100));
    }
  }, []);

  // 工作流：从 session.accumulated_handoff 预填
  useEffect(() => {
    if (!session?.accumulated_handoff) return;
    const h = session.accumulated_handoff as Record<string, string>;
    if (h.imageUrl) {
      setImageUrl(h.imageUrl);
      setImagePreview(h.imageUrl);
      setImageTab('url');
    }
    if (h.audioUrl) {
      setAudioUrl(h.audioUrl);
      setAudioTab('upload');
      measureAudioDuration(h.audioUrl).then(d => setAudioDuration(d)).catch(() => {});
    }
    if (h.text || h.script) {
      setTtsText((h.text || h.script || '').slice(0, 1000));
      setOcTopic((h.text || h.script || '').slice(0, 100));
    }
  }, [session]);

  // ─── AI 写稿 ──────────────────────────────────────────
  const [aiTopic, setAiTopic] = useState('');
  const [aiStyle, setAiStyle] = useState('oral');
  const [aiLength, setAiLength] = useState(100);
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

  // ─── 通用 Step/生成状态 ────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);
  const [resolution, setResolution] = useState<'480P' | '720P'>('720P');
  const [generatePhase, setGeneratePhase] = useState<'idle' | 'uploading_audio' | 'submitting' | 'generating' | 'done' | 'error'>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const savedVideoUrls = useRef<Set<string>>(new Set()); // 防止重复自动保存
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { items: historyItems, isLoading: historyLoading } = useWorkHistory('视频', 'ai_digital_human');

  // 自动保存生成的数字人视频到灵感库(标签含"数字人")
  const autoSaveDigitalHuman = async (videoUrl: string, title?: string) => {
    if (!videoUrl || savedVideoUrls.current.has(videoUrl)) return;
    savedVideoUrls.current.add(videoUrl);
    try {
      const res = await fetch('/api/inspiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          title: title || `数字人视频 · ${resolution}`,
          media_urls: [videoUrl],
          tags: ['数字人', 'AI生成', 'video_material'],
          source_platform: 'ai_digital_human',
          workflow_session_id: workflowSessionId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: '已自动保存到灵感库', type: 'success' });
        if (isInWorkflow) {
          completeCurrentStep({
            text: ttsText,
            script: ttsText,
            topic: ocTopic || aiTopic,
            imageUrl: imageUrl || '',
            firstFrame: videoUrl,
          }, data.data?.id);
        }
      } else setToast({ message: '自动保存失败,可手动重试', type: 'error' });
    } catch { setToast({ message: '自动保存失败', type: 'error' }); }
  };

  // ─── 初始化 ───────────────────────────────────────────
  useEffect(() => {
    fetch('/api/inspiration?type=image&limit=30')
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
        body: JSON.stringify({
          text: txt,
          voice,
          speed,
          pitch,
          cloned_voice_id: voice === 'cloned_voice' ? clonedVoiceId : undefined,
        }),
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
      const res = await apiClient.post<{ taskId: string }>('/ai/digital-human', {
        imageUrl: imgUrl,
        audioUrl: audUrl,
        resolution: reso,
        audioDuration: typeof audDuration === 'number' ? audDuration : undefined,
      });
      if (!res.success) throw new Error(res.error || '提交失败');

      const tid = res.data!.taskId;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 120) {
          clearInterval(poll);
          onError('生成超时，请重试');
          return;
        }
        try {
          const pr = await apiClient.get<{ status: string; videoUrl?: string; message?: string }>(`/ai/digital-human?taskId=${tid}`);
          if (pr.success && pr.data) {
            const { status, videoUrl, message } = pr.data;
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
      (videoUrl) => { setFinalVideoUrl(videoUrl); setGeneratePhase('done'); autoSaveDigitalHuman(videoUrl, '手动配置数字人'); },
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

  // ─── Animate 模式:上传参考视频/头像 → 提交 → 轮询 ──
  const handleUploadMotionVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setToast({ message: '参考视频需 ≤ 100MB', type: 'error' });
      return;
    }
    setIsUploadingMotionVideo(true);
    try {
      const fd = new FormData();
      fd.append('file', file, `motion-${Date.now()}.${file.name.split('.').pop()}`);
      const res = await fetch('/api/upload/inspiration', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success && data.data?.url) {
        setAnimateMotionVideoUrl(data.data.url);
        setToast({ message: '参考视频已上传', type: 'success' });
      } else {
        setToast({ message: data.error || '上传失败', type: 'error' });
      }
    } catch {
      setToast({ message: '上传失败,请重试', type: 'error' });
    }
    setIsUploadingMotionVideo(false);
  };

  const handleAnimateSubmit = async () => {
    if (!animateRefImageUrl || !animateMotionVideoUrl) {
      setToast({ message: '请提供角色头像 + 参考视频', type: 'error' });
      return;
    }
    setAnimatePhase('submitting');
    setAnimateError(null);
    setAnimateResultUrl(null);
    try {
      const res = await fetch('/api/ai/digital-human/animate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: animateRefImageUrl,
          videoUrl: animateMotionVideoUrl,
          mode: animateMode,
          resolution: animateResolution,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setAnimatePhase('failed');
        setAnimateError(data.error || '提交失败');
        setToast({ message: data.error || '提交失败', type: 'error' });
        return;
      }
      setAnimateTaskId(data.data.taskId);
      setAnimatePhase('running');
      setToast({ message: 'Animate 任务已提交,通常 1-3 分钟', type: 'success' });
      // 开始轮询
      if (animatePollRef.current) clearInterval(animatePollRef.current);
      animatePollRef.current = setInterval(pollAnimateStatus, 6000);
      setTimeout(pollAnimateStatus, 2000);
    } catch (e: any) {
      setAnimatePhase('failed');
      setAnimateError(e?.message || '网络错误');
    }
  };

  const pollAnimateStatus = async () => {
    if (!animateTaskId) return;
    try {
      const res = await fetch(`/api/ai/digital-human/animate?taskId=${encodeURIComponent(animateTaskId)}`);
      const data = await res.json();
      if (data.success) {
        const s = data.data;
        if (s.status === 'succeeded') {
          setAnimateResultUrl(s.videoUrl);
          setAnimatePhase('done');
          if (animatePollRef.current) clearInterval(animatePollRef.current);
          setToast({ message: '🎉 Animate 角色动作生成完成', type: 'success' });
        } else if (s.status === 'failed') {
          setAnimateError(s.message || '生成失败');
          setAnimatePhase('failed');
          if (animatePollRef.current) clearInterval(animatePollRef.current);
        }
      }
    } catch {}
  };

  const handleAnimateSave = async () => {
    if (!animateResultUrl) return;
    try {
      const res = await fetch('/api/inspiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          title: `Animate 角色动作 · ${animateMode === 'animate' ? '动作迁移' : '角色替换'}`,
          media_urls: [animateResultUrl],
          tags: ['Animate', '角色动作', 'wan2.2-animate'],
          source_platform: 'ai_digital_human',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: '已存入灵感库', type: 'success' });
      } else {
        setToast({ message: data.error || '保存失败', type: 'error' });
      }
    } catch {
      setToast({ message: '保存失败', type: 'error' });
    }
  };

  // ─── 数字分身（HeyGen）handler ───────────────────
  const handleAvatarSubmit = async () => {
    if (!avatarInfo || avatarInfo.status !== 'ready') {
      setToast({ message: '请先在「账号设置」训练就绪一个数字分身', type: 'error' });
      return;
    }
    if (!avatarScript.trim()) {
      setToast({ message: '请填写口播脚本', type: 'error' });
      return;
    }
    if (avatarScript.length > 5000) {
      setToast({ message: '口播脚本不能超过 5000 字', type: 'error' });
      return;
    }
    setAvatarPhase('submitting');
    setAvatarError(null);
    try {
      const res = await fetch('/api/ai/digital-human/avatar/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarId: avatarInfo.avatarId,
          script: avatarScript.slice(0, 5000),
        }),
      });
      const data = await res.json();
      if (!data.success || !data.data?.videoId) {
        setAvatarPhase('failed');
        setAvatarError(data.error || '提交失败');
        return;
      }
      setAvatarVideoId(data.data.videoId);
      setAvatarPhase('processing');
      avatarPollRef.current = setInterval(pollAvatarStatus, 6000);
    } catch (e: any) {
      setAvatarPhase('failed');
      setAvatarError(e?.message || '网络错误');
    }
  };

  const pollAvatarStatus = async () => {
    if (!avatarVideoId) return;
    try {
      const res = await fetch(`/api/ai/digital-human/avatar/video?videoId=${encodeURIComponent(avatarVideoId)}`);
      const data = await res.json();
      const s = data.data;
      if (!s) return;
      if (s.status === 'completed') {
        setAvatarResultUrl(s.videoUrl || null);
        setAvatarPhase('done');
        if (avatarPollRef.current) clearInterval(avatarPollRef.current);
        setToast({ message: '🎉 数字分身口播视频生成完成', type: 'success' });
      } else if (s.status === 'failed') {
        setAvatarError(s.error || '生成失败');
        setAvatarPhase('failed');
        if (avatarPollRef.current) clearInterval(avatarPollRef.current);
      }
    } catch {}
  };

  const handleAvatarSave = async () => {
    if (!avatarResultUrl) return;
    try {
      const res = await fetch('/api/inspiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          title: `数字分身口播 · ${avatarInfo?.name || 'My Avatar'}`,
          media_urls: [avatarResultUrl],
          tags: ['数字分身', 'HeyGen', 'avatar_video'],
          source_platform: 'ai_digital_human',
        }),
      });
      const data = await res.json();
      setToast({
        message: data.success ? '已存入灵感库' : (data.error || '保存失败'),
        type: data.success ? 'success' : 'error',
      });
    } catch {
      setToast({ message: '保存失败', type: 'error' });
    }
  };

  useEffect(() => {
    return () => {
      if (animatePollRef.current) clearInterval(animatePollRef.current);
    };
  }, []);

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
          source_platform: 'ai_digital_human',
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
      const res = await apiClient.post<{ scripts: string[] }>('/ai/digital-human/script', {
        topic: aiTopic, style: aiStyle, targetLength: aiLength,
        variantCount: 3, language: dhMode === 'multi-lang' ? targetLang : 'zh',
      });
      const scripts = res.data?.scripts;
      if (res.success && scripts && scripts.length > 0) {
        setGeneratedScripts(scripts);
        setSelectedVariant(0);
        setTtsText(scripts[0]);
      } else {
        setToast({ message: res.error || '脚本生成失败', type: 'error' });
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
      const sRes = await apiClient.post<{ scripts: string[] }>('/ai/digital-human/script', { topic: ocTopic, style: ocStyle, targetLength: 100, variantCount: 1 });
      if (!sRes.success) throw new Error(sRes.error || '写稿失败');
      const script = sRes.data!.scripts[0];
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

      // Step 3: 上传音频 + 测真实时长
      setOcPhase('uploading');
      const audUrl = await base64ToUrl(ttsData.audioBase64);
      if (ocAbortRef.current) return;
      // 测真实 audio.duration, 一键成片流程不依赖 state.audioDuration
      let ocAudioDuration: number | undefined;
      try {
        ocAudioDuration = await measureAudioDuration(audUrl);
        setAudioDuration(ocAudioDuration);
        if (ocAudioDuration > MAX_AUDIO_SECONDS) {
          throw new Error(`音频时长 ${ocAudioDuration.toFixed(1)} 秒,超过 wan2.2-s2v 模型的 ${MAX_AUDIO_SECONDS} 秒限制,请精简主题或换更短的口播脚本`);
        }
      } catch (e: any) {
        if (e.message?.includes('超过') || e.message?.includes('限制')) throw e;
        // 测时长失败不阻塞, 让后端兜底
      }

      // Step 4-6: 提交 + 轮询
      setOcPhase('submitting');
      await new Promise<void>((resolve, reject) => {
        submitAndPoll(imageUrl, audUrl, resolution,
          (videoUrl) => { setFinalVideoUrl(videoUrl); setOcPhase('done'); autoSaveDigitalHuman(videoUrl, `数字人 · ${ocTopic}`); resolve(); },
          (msg) => { setOcError(msg); setOcPhase('error'); reject(new Error(msg)); },
          ocAudioDuration ?? audioDuration,
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
        const sRes = await apiClient.post<{ scripts: string[] }>('/ai/digital-human/script', { topic: item.topic, style: 'oral', targetLength: 100, variantCount: 1 });
        if (!sRes.success) throw new Error('写稿失败');
        const script = sRes.data!.scripts[0];
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
            (videoUrl) => { updateItem({ videoUrl, status: 'done' }); autoSaveDigitalHuman(videoUrl, `数字人 · ${item.topic}`); resolve(); },
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
        {clonedVoiceId && (
          <button onClick={() => setVoice('cloned_voice')}
            className="py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: voice === 'cloned_voice' ? 'rgba(236,72,153,0.2)' : 'rgba(255,255,255,0.06)',
              border: voice === 'cloned_voice' ? '1px solid rgba(236,72,153,0.4)' : '1px solid rgba(255,255,255,0.08)',
              color: voice === 'cloned_voice' ? '#F9A8D4' : '#9CA3AF',
            }}>⭐ 我的克隆</button>
        )}
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

      {/* 下一步:反向 handoff 到其他工作流 */}
      <div
        className="mt-3 p-3 rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(244,114,182,0.06), rgba(139,92,246,0.06))',
          border: '1px solid rgba(244,114,182,0.15)',
        }}
      >
        <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 8 }}>
          下一步:把数字人用到别处
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handoff('/ai/video', { firstFrame: videoUrl, topic: ocTopic || '我的数字人', imageUrl: imageUrl || '' })}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl"
            style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)' }}
          >
            <VideoIcon size={16} color="#F43F5E" />
            <span style={{ color: '#F43F5E', fontSize: 11, fontWeight: 600 }}>做更长视频</span>
          </button>
          <button
            onClick={() => handoff('/publish', { text: ocTopic || '我的数字人', topic: ocTopic || '我的数字人' })}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}
          >
            <Share2 size={16} color="#22C55E" />
            <span style={{ color: '#22C55E', fontSize: 11, fontWeight: 600 }}>多平台分发</span>
          </button>
        </div>
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
              <span style={{ color: '#93C5FD', fontSize: 11 }}>{aiLength}字 · ≈{Math.ceil(aiLength / 5)}秒</span>
            </div>
            <input type="range" min="50" max="300" step="10" value={aiLength}
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
              {clonedVoiceId && <option value="cloned_voice" style={{ background: '#0F172A' }}>⭐ 我的克隆</option>}
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
              <span style={{ color: '#86EFAC', fontSize: 11 }}>{aiLength}字 · ≈{Math.ceil(aiLength / 5)}秒</span>
            </div>
            <input type="range" min="50" max="300" step="10" value={aiLength}
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
  // 模式：用我的形象（wan2.2-animate 角色动作迁移）
  // ══════════════════════════════════════════════════════════

  const renderAnimateMode = () => (
    <>
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          <span style={{ color: '#EC4899' }}>🎭 角色动作迁移</span> · 静态头像 + 参考视频
        </p>
        <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.6, marginBottom: 12 }}>
          上传一张角色头像(创始人/虚拟形象) + 一段参考视频(任意人物动作/口播),AI 会让头像复刻视频里的动作、表情、口型。
          <br />适合: 创始人 IP 持续产出、虚拟主播预制动作库、产品发布会动画。
        </p>

        {/* 角色头像:复用 imagePreview / imageUrl 状态 */}
        <div className="mb-3">
          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>① 角色头像(必填)</p>
          {imagePreview || imageUrl ? (
            <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <img src={imagePreview || imageUrl} alt="角色" className="w-12 h-12 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p style={{ color: '#86EFAC', fontSize: 11, fontWeight: 600 }}>已选择</p>
                <p style={{ color: '#6B7280', fontSize: 10 }} className="truncate">{imagePreview || imageUrl}</p>
              </div>
              <button onClick={() => { setImagePreview(null); setImageUrl(''); setAnimateRefImageUrl(''); }}
                style={{ color: '#FCA5A5', fontSize: 11 }}>清除</button>
            </div>
          ) : (
            <button
              onClick={() => setImageTab('upload')}
              className="w-full py-2.5 rounded-lg text-xs"
              style={{ background: 'rgba(236,72,153,0.1)', border: '1px dashed rgba(236,72,153,0.4)', color: '#F9A8D4' }}
            >
              👆 请先在上方「选择图片」上传/选一张头像
            </button>
          )}
          {(imagePreview || imageUrl) && (
            <input
              value={animateRefImageUrl || imagePreview || imageUrl}
              onChange={(e) => setAnimateRefImageUrl(e.target.value)}
              placeholder="或直接粘贴图片 URL"
              className="w-full mt-2 px-2.5 py-1.5 rounded-lg bg-transparent text-xs outline-none"
              style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          )}
        </div>

        {/* 参考视频 */}
        <div className="mb-3">
          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>② 参考视频(必填, ≤100MB)</p>
          {animateMotionVideoUrl ? (
            <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <video src={animateMotionVideoUrl} className="w-12 h-12 rounded-lg object-cover" muted />
              <div className="flex-1 min-w-0">
                <p style={{ color: '#86EFAC', fontSize: 11, fontWeight: 600 }}>已上传参考视频</p>
                <p style={{ color: '#6B7280', fontSize: 10 }} className="truncate">{animateMotionVideoUrl}</p>
              </div>
              <button onClick={() => setAnimateMotionVideoUrl('')}
                style={{ color: '#FCA5A5', fontSize: 11 }}>清除</button>
            </div>
          ) : (
            <label className="flex flex-col items-center gap-1.5 py-3 rounded-lg cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.2)' }}>
              <Upload size={18} color="#9CA3AF" />
              <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                {isUploadingMotionVideo ? '上传中...' : '点击上传参考视频(mp4/mov)'}
              </span>
              <input type="file" accept="video/mp4,video/quicktime,video/*"
                onChange={handleUploadMotionVideo} style={{ display: 'none' }} />
            </label>
          )}
        </div>

        {/* 模式 + 分辨率 */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>迁移模式</p>
            <div className="flex gap-1">
              {(['animate', 'replace'] as const).map((m) => (
                <button key={m} onClick={() => setAnimateMode(m)}
                  className="flex-1 py-1.5 rounded-lg text-xs"
                  style={{
                    background: animateMode === m ? 'rgba(236,72,153,0.2)' : 'rgba(255,255,255,0.05)',
                    border: animateMode === m ? '1px solid rgba(236,72,153,0.4)' : '1px solid rgba(255,255,255,0.1)',
                    color: animateMode === m ? '#F9A8D4' : '#9CA3AF',
                  }}>
                  {m === 'animate' ? '动作迁移' : '角色替换'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>分辨率</p>
            <div className="flex gap-1">
              {(['480P', '720P'] as const).map((r) => (
                <button key={r} onClick={() => setAnimateResolution(r)}
                  className="flex-1 py-1.5 rounded-lg text-xs"
                  style={{
                    background: animateResolution === r ? 'rgba(236,72,153,0.2)' : 'rgba(255,255,255,0.05)',
                    border: animateResolution === r ? '1px solid rgba(236,72,153,0.4)' : '1px solid rgba(255,255,255,0.1)',
                    color: animateResolution === r ? '#F9A8D4' : '#9CA3AF',
                  }}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        {/* 提交 */}
        {animatePhase === 'idle' || animatePhase === 'failed' ? (
          <PrimaryButton fullWidth size="lg" onClick={handleAnimateSubmit}
            disabled={!animateRefImageUrl || !animateMotionVideoUrl}>
            <Sparkles size={16} /> {animatePhase === 'failed' ? '重试' : '开始 Animate'}
          </PrimaryButton>
        ) : animatePhase === 'submitting' || animatePhase === 'running' ? (
          <div className="flex flex-col items-center py-3 gap-2">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
            </div>
            <p style={{ color: '#F9A8D4', fontSize: 12 }}>
              {animatePhase === 'submitting' ? '提交中...' : '生成中(1-3 分钟)...'}
            </p>
          </div>
        ) : null}
        {animateError && (
          <p style={{ color: '#FCA5A5', fontSize: 11, marginTop: 8 }}>❌ {animateError}</p>
        )}
      </GlassCard>

      {/* 结果区 */}
      {animateResultUrl && (
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: '#22C55E' }}>✨ 生成结果</span> · 角色动作视频
          </p>
          <video src={animateResultUrl} controls className="w-full rounded-xl mb-3" />
          <div className="grid grid-cols-2 gap-2">
            <a href={animateResultUrl} target="_blank" rel="noreferrer"
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs"
              style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#86EFAC' }}>
              <Download size={16} /> 下载
            </a>
            <button onClick={handleAnimateSave}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs"
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#C4B5FD' }}>
              <FolderOpen size={16} /> 存灵感库
            </button>
          </div>
        </GlassCard>
      )}
    </>
  );

  const renderAvatarMode = () => {
    if (!avatarInfo) {
      return (
        <GlassCard>
          <div className="text-center py-8">
            <UserCircle2 size={48} color="#9CA3AF" className="mx-auto mb-3" />
            <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }} className="mb-1">
              还没有训练数字分身
            </p>
            <p style={{ color: '#9CA3AF', fontSize: 12 }} className="mb-4">
              训练 5-10 分钟个人形象视频,即可一键生成口播视频
            </p>
            <button
              onClick={() => router.push('/profile/settings')}
              className="px-4 py-2 rounded-lg"
              style={{ background: 'rgba(236,72,153,0.2)', color: '#F9A8D4', fontSize: 13 }}
            >
              去训练分身
            </button>
          </div>
        </GlassCard>
      );
    }

    if (avatarInfo.status !== 'ready') {
      return (
        <GlassCard>
          <div className="text-center py-6">
            <Loader2 size={32} color="#FBBF24" className="mx-auto mb-3 animate-spin" />
            <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }} className="mb-1">
              {avatarInfo.name} 正在训练中
            </p>
            <p style={{ color: '#9CA3AF', fontSize: 12 }} className="mb-3">
              训练完成通常需要 5-15 分钟,请耐心等待
            </p>
            <button
              onClick={() => router.push('/profile/settings')}
              style={{ color: '#67E8F9', fontSize: 12 }}
            >
              查看训练进度 →
            </button>
          </div>
        </GlassCard>
      );
    }

    return (
      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <UserCircle2 size={16} color="#F9A8D4" />
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>分身:{avatarInfo.name}</p>
          <span style={{
            color: '#34D399', fontSize: 11, marginLeft: 'auto',
            padding: '2px 8px', borderRadius: 6,
            background: 'rgba(52,211,153,0.15)',
          }}>
            ● 就绪
          </span>
        </div>

        <div className="mb-3">
          <label style={{ color: '#9CA3AF', fontSize: 11 }} className="block mb-1.5">
            口播脚本(中英文均可,5000 字以内)
          </label>
          <textarea
            value={avatarScript}
            onChange={(e) => setAvatarScript(e.target.value.slice(0, 5000))}
            rows={5}
            placeholder="大家好,我是 XXX,今天给大家分享..."
            className="w-full px-3 py-2 rounded-lg resize-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#FFFFFF', fontSize: 13,
            }}
          />
          <p style={{ color: '#6B7280', fontSize: 10 }} className="mt-1 text-right">
            {avatarScript.length} / 5000
          </p>
        </div>

        <button
          onClick={handleAvatarSubmit}
          disabled={avatarPhase === 'submitting' || avatarPhase === 'processing' || !avatarScript.trim()}
          className="w-full py-3 rounded-lg flex items-center justify-center gap-1.5"
          style={{
            background: avatarPhase === 'submitting' || avatarPhase === 'processing'
              ? 'rgba(236,72,153,0.3)'
              : 'rgba(236,72,153,0.5)',
            color: '#FFFFFF', fontSize: 14, fontWeight: 600,
            opacity: !avatarScript.trim() ? 0.5 : 1,
          }}
        >
          {avatarPhase === 'submitting' && <Loader2 size={14} className="animate-spin" />}
          {avatarPhase === 'processing' && <><Loader2 size={14} className="animate-spin" /> 渲染中...</>}
          {(avatarPhase === 'idle' || avatarPhase === 'failed') && <><Sparkles size={14} /> 生成口播视频</>}
          {avatarPhase === 'done' && <><Check size={14} /> 重新生成</>}
        </button>

        {avatarPhase === 'processing' && (
          <p style={{ color: '#FBBF24', fontSize: 11 }} className="mt-2 text-center">
            ⏳ HeyGen 渲染中,通常 1-3 分钟完成
          </p>
        )}

        {avatarError && (
          <p style={{ color: '#FCA5A5', fontSize: 11 }} className="mt-2">
            ❌ {avatarError}
          </p>
        )}

        {avatarResultUrl && (
          <div className="mt-3">
            <video
              src={avatarResultUrl}
              controls
              className="w-full rounded-lg"
              style={{ maxHeight: 320, background: '#000' }}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleDownload(avatarResultUrl)}
                className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: 12 }}
              >
                <Download size={12} /> 下载
              </button>
              <button
                onClick={handleAvatarSave}
                className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5"
                style={{ background: 'rgba(6,182,212,0.2)', color: '#67E8F9', fontSize: 12 }}
              >
                <FolderOpen size={12} /> 存灵感库
              </button>
            </div>
          </div>
        )}
      </GlassCard>
    );
  };

  // ══════════════════════════════════════════════════════════
  // 主渲染
  // ══════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <TopNav title="AI 数字人" showBack onBack={() => router.push('/ai')} />

      {isInWorkflow && session && (
        <WorkflowSessionBar session={session} onPause={pauseSession} onResume={resumeSession} onAbandon={abandonSession} />
      )}

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

        {/* ─── 数字分身模式（提取为函数） ─── */}
        {/* 模式内容 */}
        {dhMode === 'manual' && renderManualMode()}
        {dhMode === 'ai-write' && renderAIWriteMode()}
        {dhMode === 'one-click' && renderOneClickMode()}
        {dhMode === 'batch' && renderBatchMode()}
        {dhMode === 'multi-lang' && renderMultiLangMode()}
        {dhMode === 'animate' && renderAnimateMode()}
        {dhMode === 'avatar' && renderAvatarMode()}
      </div>

      {/* 历史生成 */}
      {!historyLoading && historyItems.length > 0 && (
        <div className="px-4 pb-20">
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>历史生成</p>
          <div className="grid grid-cols-2 gap-2">
            {historyItems.map((item) => (
              <div
                key={item.id}
                className="relative rounded-xl overflow-hidden cursor-pointer transition-all"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  aspectRatio: '9/16',
                }}
                onClick={() => {
                  if (item.videoUrl) window.open(item.videoUrl, '_blank');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                {item.videoUrl ? (
                  <video src={item.videoUrl} className="w-full h-full object-cover" preload="metadata" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span style={{ fontSize: 32 }}>👤</span>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
                  <p style={{ color: '#E5E7EB', fontSize: 11 }} className="truncate">{item.title}</p>
                  <span style={{ color: '#6B7280', fontSize: 10 }}>{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
