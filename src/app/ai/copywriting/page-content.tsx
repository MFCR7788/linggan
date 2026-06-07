"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Copy, RefreshCw, Share2, Zap, ChevronDown, ChevronUp, Check, ImageIcon, Layers, Globe, Wand2, FileText, Sparkles, X, Mic, Grid3x3, Search } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useToast } from "@/components/Toast";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components";
import FormattedText from "@/components/FormattedText";
import { Step1MaterialRefineModal } from "@/components/Step1MaterialRefineModal";
import {
  COPYWRITING_TYPES,
  COPYWRITING_STYLES,
  COPYWRITING_INDUSTRIES,
  findIndustry,
} from "@/lib/preset-templates";
import { useContentHandoff } from "@/hooks/use-content-handoff";
import { useCopywriting } from "@/hooks/ai/use-copywriting";
import { useWorkflowSession } from "@/hooks/use-workflow-session";
import { useWorkHistory } from "@/hooks/use-work-history";
import { WorkflowSessionBar } from "@/components/WorkflowSessionBar";

const typeEmojis: Record<string, string> = {
  text: "📝", link: "🔗", image: "🖼️", video: "🎬", voice: "🎵", audio: "🎵", schedule: "📅",
};

const generateStandardContent = () => `✨ 你知道吗？15秒视频的完播率是60秒的4.3倍！

作为一个内容创作者，我最近研究了大量数据，发现了一个震惊的规律——

🎯 短视频的黄金法则：
1️⃣ 前3秒决定一切！强冲突开场最有效
2️⃣ 信息密度要高，每秒都要有价值
3️⃣ 15秒是甜蜜点，完播率最高

💡 今天就开始改变你的创作策略！从长视频思维切换到短视频思维，你的数据会给你惊喜的～

你觉得短视频时代还会继续吗？评论区聊聊！

#内容创作 #短视频运营 #涨粉技巧 #创作者必看`;

const generateNoAiContent = () => `姐妹们，今天翻手机相册突然看到这张图，心里一下子软了。

上个月去唐山，路北区那个小店里，老板娘把授权书递给我的时候，手都在抖。她说："姐，我从小就想开个魔法屋，现在终于敢了。"那张纸其实挺普通的，就是那种打印店统一出来的格式，可她愣是看了三遍才收起来。

赤壁店那个就更戳我了。老板是个90后小姑娘，她跟我说，本来家里人都觉得她疯了，辞了公务员去搞什么魔法主题。结果她妈看到授权书上"赤壁"两个字，突然说："哎，这不就是三国那个赤壁吗？有缘。"有时候啊，缘分就是这么莫名其妙来的，你都不好意思不信。

其实哪有什么魔法超人，不过是我们这些普通人，在柴米油盐里给自己留了一点点童心和勇气。授权书不过是一张纸，可那张纸背后，是有人真的愿意为你相信的东西，豁出去一次。

所以啊，别总觉得自己想做的事太小，或者太晚。你看，连赤壁那个小店都开起来了，你还有什么好怕的？

#唐山探店 #赤壁 #我的创业日记 #小店日常 #勇气`;

interface InspirationItem {
  id: string | number;
  title: string;
  type?: string;
  original_text?: string;
  ai_summary?: string;
  source_platform?: string;
  created_at?: string;
}

function scoreInspiration(item: InspirationItem, now: number = Date.now()): number {
  const created = item.created_at ? new Date(item.created_at).getTime() : now;
  const days = Math.max(0, (now - created) / (1000 * 60 * 60 * 24));
  const recency = Math.max(0, 1 - days / 7);
  const textLen = (item.original_text || '').length;
  const lengthScore = Math.min(1, textLen / 200);
  const summaryScore = (item.ai_summary && item.ai_summary.length > 50) ? 1 : 0;
  return 0.4 * recency + 0.35 * lengthScore + 0.25 * summaryScore;
}

const STYLE_CATEGORY_LABELS: Record<string, string> = {
  '情感': '🌸 情感', '专业': '📚 专业', '营销': '💰 营销', '搞笑': '😂 搞笑',
};

// ─── 内联样式常量 ──────────────────────────────
const S = {
  sectionTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: 600 } as React.CSSProperties,
  stepBadge: (color: string) => ({ color, fontSize: 13, fontWeight: 700 } as React.CSSProperties),
  label: { color: '#9CA3AF', fontSize: 11 } as React.CSSProperties,
  input: {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#E5E7EB', outline: 'none',
  } as React.CSSProperties,
  chip: (active: boolean, color = '#3B82F6') => ({
    padding: '4px 10px', borderRadius: 999, fontSize: 11,
    background: active ? `rgba(59,130,246,0.2)` : 'rgba(255,255,255,0.05)',
    border: active ? `1px solid rgba(59,130,246,0.5)` : '1px solid rgba(255,255,255,0.1)',
    color: active ? '#93C5FD' : '#9CA3AF',
  } as React.CSSProperties),
};

function AICopywritingContent() {
  const { showToast } = useToast();
  const router = useRouter();
  const { handoff, receive, searchParams } = useContentHandoff();
  const workflowSessionId = searchParams.get('workflow_session_id') || undefined;
  const { session, isInWorkflow, completeCurrentStep, pauseSession, resumeSession, abandonSession } = useWorkflowSession(workflowSessionId);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickMode, setQuickMode] = useState(true);

  // ─── Step 1 state ──────────────────────────────
  const [inspirations, setInspirations] = useState<InspirationItem[]>([]);
  const [selectedInspirations, setSelectedInspirations] = useState<Set<string | number>>(new Set());
  const [userInput, setUserInput] = useState('');
  const [refinedMessage, setRefinedMessage] = useState('');
  const { generate: generateCopywriting, refine: refineCopywriting, rewriteMulti: rewriteMultiCopy, researching } = useCopywriting();
  const [isRefining, setIsRefining] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'text' | 'image' | 'video' | 'audio'>('text');
  const [hideAiWorks, setHideAiWorks] = useState(false);
  const [sortMode, setSortMode] = useState<'smart' | 'recent'>('smart');
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [refineModalInput, setRefineModalInput] = useState({ userInput: '', inspirations: [] as InspirationItem[], result: '' });
  const [refineModalResult, setRefineModalResult] = useState('');
  const [analyzingUrl, setAnalyzingUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const urlDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Step 2-4 state ────────────────────────────
  const [selectedType, setSelectedType] = useState('xiaohongshu');
  const [selectedStyle, setSelectedStyle] = useState('planting');
  const [selectedIndustry, setSelectedIndustry] = useState('general');

  // ─── Options ───────────────────────────────────
  const [batchMode, setBatchMode] = useState(false);
  const [noAiMode, setNoAiMode] = useState(true);

  // ─── Result state ──────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [researchResults, setResearchResults] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<"standard" | "noai">("standard");
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [standardContents, setStandardContents] = useState<string[]>([generateStandardContent()]);
  const [noAiContents, setNoAiContents] = useState<string[]>([generateNoAiContent()]);
  const [copied, setCopied] = useState(false);
  const [rewriteContents, setRewriteContents] = useState<Record<string, string>>({});
  const [rewriteTab, setRewriteTab] = useState('xiaohongshu');
  const [isRewriting, setIsRewriting] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const { items: historyItems, isLoading: historyLoading } = useWorkHistory('文案');

  const userInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (userInputRef.current) {
      userInputRef.current.style.height = 'auto';
      userInputRef.current.style.height = Math.min(userInputRef.current.scrollHeight, 200) + 'px';
    }
  }, [userInput]);

  // ─── 加载灵感列表 ──────────────────────────────
  const loadInspirations = useCallback(async (type: string, hideAi: boolean) => {
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (type !== 'all') params.set('type', type);
      if (hideAi) params.set('excludeSourcePlatforms', 'ai');
      const inspRes = await fetch(`/api/inspiration?${params.toString()}`);
      if (inspRes.ok) {
        const data = await inspRes.json();
        setInspirations(data.data || []);
      }
    } catch (e) {
      console.error('Failed to load inspirations', e);
    }
  }, []);

  useEffect(() => { loadInspirations(typeFilter, hideAiWorks); }, [typeFilter, hideAiWorks, loadInspirations]);

  // ─── URL 自动检测 ──────────────────────────────
  useEffect(() => {
    if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current);
    setUrlError(null);
    const trimmed = userInput.trim();
    const urlMatch = trimmed.match(/^https?:\/\/\S+$/);
    if (!urlMatch) return;
    const url = trimmed;
    urlDebounceRef.current = setTimeout(async () => {
      setAnalyzingUrl(url);
      try {
        const res = await fetch('/api/ai/analyze-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (data.success) {
          const inspirationType = data.linkType === 'image' ? 'image' : data.linkType === 'video' ? 'video' : 'link';
          const inspirationRes = await fetch('/api/inspiration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: inspirationType, title: data.title,
              original_text: data.summary || data.keyPoints?.join(' / '),
              ai_summary: data.summary, source_url: url, source_platform: 'link',
              media_urls: data.mediaUrl ? [data.mediaUrl] : null,
            }),
          });
          const inspData = await inspirationRes.json();
          if (inspData.success && inspData.data?.id) {
            setSelectedInspirations(prev => { const next = new Set(prev); next.add(inspData.data.id); return next; });
          }
          setRefinedMessage(data.summary || '');
          setUserInput('');
          loadInspirations(typeFilter, hideAiWorks);
          showToast(`已解析: ${data.title}`, 'success');
        } else {
          setUrlError(data.error || '链接解析失败');
        }
      } catch (e: any) {
        setUrlError(e?.message || '网络错误');
      } finally {
        setAnalyzingUrl(null);
      }
    }, 500);
    return () => { if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current); };
  }, [userInput, loadInspirations, typeFilter, hideAiWorks, showToast]);

  // ─── 图片处理 ──────────────────────────────────
  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setImageError('只支持图片文件'); return; }
    setUploadingImage(true);
    setImageError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const upRes = await fetch('/api/upload/inspiration', { method: 'POST', body: formData });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.success) throw new Error(upData.error || '上传失败');
      const imageUrl = upData.data.url;

      const analyzeRes = await fetch('/api/ai/copywriting/analyze-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeData.success) throw new Error(analyzeData.error || '图片分析失败');

      const itemId = upData.data.id;
      await fetch(`/api/inspiration/${itemId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_summary: analyzeData.data.description,
          title: analyzeData.data.text?.substring(0, 50) || analyzeData.data.description?.substring(0, 50) || '图片素材',
        }),
      }).catch(() => {});

      setSelectedInspirations(prev => { const next = new Set(prev); next.add(itemId); return next; });
      setRefinedMessage(analyzeData.data.description);
      showToast(`已分析图片: ${analyzeData.data.tags?.slice(0, 2).join(' / ') || '已加入灵感库'}`, 'success');
      loadInspirations(typeFilter, hideAiWorks);
    } catch (e: any) {
      setImageError(e?.message || '图片处理失败');
    } finally {
      setUploadingImage(false);
    }
  }, [loadInspirations, typeFilter, hideAiWorks, showToast]);

  // ─── Handoff 接收 ──────────────────────────────
  useEffect(() => {
    const params = receive(['text', 'topic', 'inspirationId', 'industry', 'style']);
    if (params.text) setUserInput(params.text);
    if (params.topic && COPYWRITING_TYPES.some(t => t.id === params.topic)) setSelectedType(params.topic);
    if (params.inspirationId) {
      const ids = params.inspirationId.split(',').filter(Boolean);
      setSelectedInspirations(new Set(ids));
    }
    if (params.industry && findIndustry(params.industry)) setSelectedIndustry(params.industry);
    if (params.style && COPYWRITING_STYLES.some(s => s.id === params.style)) setSelectedStyle(params.style);
  }, []);

  // ─── 工作流预填 ────────────────────────────────
  useEffect(() => {
    if (!session?.accumulated_handoff) return;
    const h = session.accumulated_handoff as Record<string, string>;
    if (h.text) setUserInput(h.text);
    else if (h.prompt) setUserInput(h.prompt);
    if (h.topic && COPYWRITING_TYPES.some(t => t.id === h.topic)) setSelectedType(h.topic);
    if (h.industry && findIndustry(h.industry)) setSelectedIndustry(h.industry);
    if (h.style && COPYWRITING_STYLES.some(s => s.id === h.style)) setSelectedStyle(h.style);
  }, [session]);

  // ─── 恢复上次设置 ──────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('copywriting_last_settings');
      if (saved) {
        const last = JSON.parse(saved);
        if (last.selectedType) setSelectedType(last.selectedType);
        if (last.selectedStyle) setSelectedStyle(last.selectedStyle);
        if (last.selectedIndustry) setSelectedIndustry(last.selectedIndustry);
        if (typeof last.noAiMode === 'boolean') setNoAiMode(last.noAiMode);
      }
    } catch {}
  }, []);

  const toggleInspiration = (id: string | number) => {
    const next = new Set(selectedInspirations);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedInspirations(next);
  };

  const standardContent = standardContents[currentBatchIndex] || standardContents[0];
  const noAiContent = noAiContents[currentBatchIndex] || noAiContents[0];
  const currentContent = resultTab === "standard" ? standardContent : noAiContent;

  // ─── 智能助手提炼 ──────────────────────────────
  const handleRefine = async () => {
    if (!userInput.trim() && selectedInspirations.size === 0) {
      showToast('请先输入主题或选择素材', 'error');
      return;
    }
    setIsRefining(true);
    try {
      const selectedItems = inspirations.filter(i => selectedInspirations.has(i.id));
      const inspData = selectedItems.map(i => ({
        title: i.title, originalText: i.original_text, aiSummary: i.ai_summary,
      }));
      const refined = await refineCopywriting({ inspirations: inspData, userInput });
      setRefineModalInput({ userInput, inspirations: selectedItems, result: refined });
      setRefineModalResult(refined);
      setRefineModalOpen(true);
    } catch (e: any) {
      showToast('提炼失败：' + (e.message || '未知错误'), 'error');
    } finally { setIsRefining(false); }
  };

  const handleConfirmRefine = () => {
    setRefinedMessage(refineModalResult);
    setRefineModalOpen(false);
    showToast('已提炼核心信息', 'success');
  };

  const saveLastSettings = () => {
    try {
      localStorage.setItem('copywriting_last_settings', JSON.stringify({
        selectedType, selectedStyle, selectedIndustry, noAiMode,
      }));
    } catch {}
  };

  // ─── 生成 ──────────────────────────────────────
  const handleGenerate = async () => {
    setIsLoading(true);
    saveLastSettings();
    try {
      const selectedData = inspirations
        .filter(item => selectedInspirations.has(item.id))
        .map(item => ({ title: item.title, originalText: item.original_text || '', aiSummary: item.ai_summary || '' }));

      if (selectedData.length === 0 && !userInput.trim() && !refinedMessage) {
        showToast('请先选择灵感、输入主题,或粘贴链接/图片', 'error');
        setIsLoading(false);
        return;
      }

      const finalInstruction = refinedMessage || userInput.trim() || undefined;
      const batchN = batchMode ? 3 : 1;
      const styleLabel = COPYWRITING_STYLES.find(s => s.id === selectedStyle)?.label || selectedStyle;

      const [standardResult, noAiResult] = await Promise.all([
        generateCopywriting({
          inspirations: selectedData, type: selectedType,
          style: styleLabel, noAiTaste: false, n: batchN,
          industry: selectedIndustry, userInstruction: finalInstruction,
        }).then(r => { if (r.researchResults) setResearchResults(r.researchResults); return r.content; }).catch(() => generateStandardContent()),
        noAiMode
          ? generateCopywriting({
              inspirations: selectedData, type: selectedType,
              style: styleLabel, noAiTaste: true, n: batchN,
              industry: selectedIndustry, userInstruction: finalInstruction,
            }).then(r => r.content).catch(() => null as string | string[] | null)
          : Promise.resolve(null),
      ]);

      const standardContent = typeof standardResult === 'string' ? [standardResult] : standardResult;
      setStandardContents(Array.isArray(standardContent) ? standardContent : [standardContent]);
      setCurrentBatchIndex(0);

      if (noAiResult) {
        const resolved = typeof noAiResult === 'string' ? [noAiResult] : noAiResult;
        setNoAiContents(Array.isArray(resolved) ? resolved : [resolved]);
      } else {
        setNoAiContents(Array.isArray(standardContent) ? standardContent : [standardContent]);
      }

      setRewriteContents({});

      // 自动保存到灵感库
      const content = Array.isArray(standardContent) ? standardContent[0] : standardContent;
      if (content) {
        fetch('/api/inspiration', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'text', title: content.substring(0, 50), original_text: content,
            source_platform: 'ai',
            tags: ['AI作品', selectedType === 'xiaohongshu' ? '小红书' : selectedType === 'wechat_article' ? '公众号' : '文案'],
            workflow_session_id: workflowSessionId || undefined,
          }),
        }).then(r => r.json()).then(data => {
          if (isInWorkflow && data.success) {
            completeCurrentStep(
              { text: content.substring(0, 1000), topic: selectedType, style: selectedStyle, industry: selectedIndustry },
              data.data?.id
            );
          }
        }).catch(() => {});
      }
    } catch (error) {
      setStandardContents([generateStandardContent()]);
      setNoAiContents([generateNoAiContent()]);
      setCurrentBatchIndex(0);
    } finally {
      setIsLoading(false);
      setIsGenerated(true);
    }
  };

  const handleRewriteMulti = async () => {
    setIsRewriting(true);
    try {
      const versions = await rewriteMultiCopy(currentContent);
      setRewriteContents(versions || {});
    } catch (e) { console.error('Multi-platform rewrite failed:', e); }
    setIsRewriting(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) { console.error('Copy failed:', error); }
  };

  const handleTTS = async () => {
    setIsPlayingAudio(true);
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: currentContent.slice(0, 500), voice: 'female_natural', speed: 1.15 }),
      });
      if (!res.ok) throw new Error('配音失败');
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => { setIsPlayingAudio(false); URL.revokeObjectURL(audio.src); };
      audio.onerror = () => { setIsPlayingAudio(false); showToast('播放失败', 'error'); };
      await audio.play();
    } catch {
      setIsPlayingAudio(false);
      showToast('配音失败', 'error');
    }
  };

  const handleImportToImage = () => { handoff('/ai/image', { prompt: currentContent.slice(0, 300), topic: selectedType, industry: selectedIndustry, style: COPYWRITING_STYLES.find(s => s.id === selectedStyle)?.label }); };
  const handleImportToAds = () => { handoff('/ai/ads', { topic: currentContent.slice(0, 200), text: currentContent, industry: selectedIndustry }); };

  const handleNavigate = (page: PageKey) => {
    const map: Record<string, string> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai', hotspot: '/hotspot', profile: '/profile',
    };
    router.push(map[page] || '/home');
  };

  const currentSelectedCount = selectedInspirations.size;
  const currentIndustry = findIndustry(selectedIndustry);

  const selectedAiCount = useMemo(() =>
    inspirations.filter(i => selectedInspirations.has(i.id) && i.source_platform === 'ai').length,
    [inspirations, selectedInspirations]
  );

  const displayedInspirations = useMemo(() => {
    if (sortMode === 'recent') return inspirations;
    return [...inspirations].sort((a, b) => {
      const sb = scoreInspiration(b) - scoreInspiration(a);
      if (sb !== 0) return sb;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [inspirations, sortMode]);

  const stylesByCategory = COPYWRITING_STYLES.reduce<Record<string, typeof COPYWRITING_STYLES>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  // ─── 渲染 ──────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen pb-24">
      <TopNav title="AI 文案创作" showBack onBack={() => router.back()} />

      {isInWorkflow && session && (
        <WorkflowSessionBar session={session} onPause={pauseSession} onResume={resumeSession} onAbandon={abandonSession} />
      )}

      <div className="flex-1 px-4 pt-4 space-y-4">

        {/* 快速/完整模式切换 */}
        <div className="flex rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => { setQuickMode(true); setSettingsOpen(false); }}
            className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1"
            style={{
              background: quickMode ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)' : 'transparent',
              color: quickMode ? '#FFFFFF' : '#6B7280',
            }}
          >
            <Zap size={12} /> 快速模式
          </button>
          <button
            onClick={() => { setQuickMode(false); }}
            className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              background: !quickMode ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: !quickMode ? '#FFFFFF' : '#6B7280',
            }}
          >
            完整模式
          </button>
        </div>
        {quickMode && (
          <p style={{ color: '#6B7280', fontSize: 10, textAlign: 'center', marginTop: 4, marginBottom: 0 }}>
            AI 自动选择最佳平台、风格和行业，输入主题即可生成
          </p>
        )}

        {/* 快速模式：简洁输入框 */}
        {quickMode && (
          <GlassCard className="!p-3 space-y-3">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="输入你想写的话题，例如：推荐一款适合干皮的粉底液..."
              rows={10}
              className="w-full p-3 rounded-lg text-sm resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB', outline: 'none' }}
            />
            <PrimaryButton size="md" onClick={handleGenerate} disabled={isLoading || !userInput.trim()} className="!w-full !justify-center">
              <Zap size={14} /> {isLoading ? '生成中...' : '一键生成文案'}
            </PrimaryButton>
          </GlassCard>
        )}

        {/* ──── Step 1: 选材与意图 ──── */}
        {!quickMode && (
        <GlassCard>
          <p style={S.sectionTitle}>
            <span style={S.stepBadge('#3B82F6')}>Step 1</span> · 选材与意图
          </p>

          {/* 灵感库 */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                灵感库 ({currentSelectedCount}/{inspirations.length})
              </span>
              <div className="flex items-center gap-1.5">
                {currentSelectedCount >= 3 && (
                  <span style={{ color: '#FDE68A', fontSize: 10 }}>已选 {currentSelectedCount} 条，建议 ≤3</span>
                )}
                <button
                  onClick={() => setSortMode(sortMode === 'smart' ? 'recent' : 'smart')}
                  className="px-1.5 py-0.5 rounded text-[10px]"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF' }}
                >
                  {sortMode === 'smart' ? '✨ 智能' : '🕐 最新'}
                </button>
              </div>
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap gap-1 mb-2">
              {([
                { key: 'all', label: '全部' },
                { key: 'text', label: '📝 灵感' },
                { key: 'image', label: '🖼️ 图片' },
                { key: 'video', label: '🎬 视频' },
                { key: 'audio', label: '🎵 音频' },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setTypeFilter(key)} style={S.chip(typeFilter === key)}>
                  {label}
                </button>
              ))}
              <button
                onClick={() => setHideAiWorks(!hideAiWorks)}
                className="px-2.5 py-0.5 rounded-full text-[10px] ml-auto"
                style={{
                  background: hideAiWorks ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                  border: hideAiWorks ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  color: hideAiWorks ? '#FDE68A' : '#6B7280',
                }}
              >
                {hideAiWorks ? '已隐藏 AI' : '隐藏 AI'}
              </button>
            </div>

            {/* AI 作品警告 */}
            {selectedAiCount > 0 && (
              <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded text-[10px]"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#FDE68A' }}>
                ⚠️ 选中 {selectedAiCount} 条 AI 作品，二次创作会放大 AI 味
              </div>
            )}

            {/* Inspiration list */}
            <div className="space-y-1 overflow-y-auto custom-scrollbar" style={{ maxHeight: 140 }}>
              {displayedInspirations.length > 0 ? (
                displayedInspirations.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 p-2 rounded-lg cursor-pointer"
                    onClick={() => toggleInspiration(item.id)}
                    style={{
                      background: selectedInspirations.has(item.id) ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
                      border: selectedInspirations.has(item.id) ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                      style={{
                        background: selectedInspirations.has(item.id) ? '#3B82F6' : 'transparent',
                        border: selectedInspirations.has(item.id) ? 'none' : '1px solid rgba(255,255,255,0.3)',
                        fontSize: 8, color: '#fff',
                      }}
                    >
                      {selectedInspirations.has(item.id) ? '✓' : ''}
                    </div>
                    <span style={{ fontSize: 14 }}>{typeEmojis[item.type || 'text']}</span>
                    <span style={{ color: '#E5E7EB', fontSize: 11 }} className="truncate flex-1">
                      {item.title || item.ai_summary || item.original_text?.substring(0, 30) || '未命名'}
                    </span>
                    {item.source_platform === 'ai' && (
                      <span style={{ color: '#FDE68A', fontSize: 9, padding: '0px 4px', borderRadius: 3, background: 'rgba(245,158,11,0.15)', flexShrink: 0 }}>
                        AI
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <p style={{ color: '#6B7280', fontSize: 11, textAlign: 'center', padding: 12 }}>
                  {hideAiWorks ? '暂无灵感（已隐藏 AI 作品）' : '暂无灵感，输入主题或粘贴链接开始'}
                </p>
              )}
            </div>
          </div>

          {/* 输入框 */}
          <div className="mt-3">
            <textarea
              ref={userInputRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) { e.preventDefault(); handleImageFile(file); return; }
                  }
                }
              }}
              placeholder="写一篇面向 25-30 岁职场女性的抗老精华推荐…（可粘贴链接或图片）"
              className="w-full p-2.5 rounded-lg text-sm resize-none custom-scrollbar"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB', minHeight: 100, maxHeight: 200, outline: 'none' }}
            />

            {/* URL/图片状态 */}
            {(analyzingUrl || urlError || uploadingImage || imageError) && (
              <div className="mt-1.5 px-2 py-1 rounded text-[10px] flex items-center gap-1.5"
                style={{
                  background: (urlError || imageError) ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)',
                  border: `1px solid ${(urlError || imageError) ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)'}`,
                  color: (urlError || imageError) ? '#FCA5A5' : '#93C5FD',
                }}>
                {(analyzingUrl || uploadingImage) && <div className="w-2.5 h-2.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />}
                {analyzingUrl ? '解析链接中...' : uploadingImage ? '分析图片中...' : (urlError || imageError)}
              </div>
            )}

            {/* 拖拽/上传图片 */}
            <label
              className="mt-1.5 flex items-center justify-center gap-1 px-2 py-1 rounded-lg cursor-pointer"
              style={{
                background: isDraggingImage ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.02)',
                border: isDraggingImage ? '1px dashed rgba(59,130,246,0.5)' : '1px dashed rgba(255,255,255,0.12)',
                color: isDraggingImage ? '#93C5FD' : '#6B7280', fontSize: 10,
              }}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingImage(true); }}
              onDragLeave={() => setIsDraggingImage(false)}
              onDrop={(e) => { e.preventDefault(); setIsDraggingImage(false); const file = e.dataTransfer.files?.[0]; if (file?.type.startsWith('image/')) handleImageFile(file); }}
            >
              <ImageIcon size={11} /> 点击或拖入图片（自动识别文字与场景）
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageFile(file); e.target.value = ''; }}
              />
            </label>
          </div>

          {/* 智能助手 */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleRefine}
              disabled={isRefining}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium"
              style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.15))',
                border: '1px solid rgba(139,92,246,0.35)', color: '#C4B5FD',
              }}
            >
              {isRefining ? (
                <><div className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" /> 提炼中...</>
              ) : (
                <><Wand2 size={14} /> 智能提炼</>
              )}
            </button>
            <PrimaryButton size="md" onClick={handleGenerate} disabled={isLoading} className="!px-4">
              <Zap size={14} /> {isLoading ? '生成中...' : '生成'}
            </PrimaryButton>
          </div>

          {refinedMessage && (
            <div className="mt-3 p-2.5 rounded-lg flex items-start gap-2"
              style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)' }}>
              <Sparkles size={12} color="#A78BFA" style={{ marginTop: 1 }} />
              <div className="flex-1 min-w-0">
                <p style={{ color: '#C4B5FD', fontSize: 11, lineHeight: 1.5 }}>{refinedMessage}</p>
              </div>
              <button onClick={() => setRefinedMessage('')}><X size={12} color="#6B7280" /></button>
            </div>
          )}
        </GlassCard>
        )}

        {/* ──── 配置区（折叠）──── */}
        {!quickMode && (
        <GlassCard className="!p-0">
          <button
            className="flex items-center justify-between w-full px-3 py-2.5"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <span style={{ color: '#9CA3AF', fontSize: 11 }}>
              {selectedType && COPYWRITING_TYPES.find(t => t.id === selectedType)?.label} · {findIndustry(selectedIndustry)?.name} · {COPYWRITING_STYLES.find(s => s.id === selectedStyle)?.label}
              {batchMode && ' · 批量'} {noAiMode && ' · 去AI味'}
            </span>
            {settingsOpen ? <ChevronUp size={14} color="#6B7280" /> : <ChevronDown size={14} color="#6B7280" />}
          </button>
          {settingsOpen && (
            <div className="px-3 pb-3 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

              {/* Step 2: 平台 */}
              <div>
                <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 6, marginTop: 10 }}>
                  <span style={{ color: '#3B82F6' }}>Step 2</span> · 平台与内容类型
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {COPYWRITING_TYPES.map(({ id, label, emoji, scenario }) => (
                    <button
                      key={id}
                      onClick={() => setSelectedType(id)}
                      className="flex flex-col items-center gap-1 py-2 rounded-lg transition-all"
                      style={{
                        background: selectedType === id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                        border: selectedType === id ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                      }}
                      title={scenario}
                    >
                      <span style={{ fontSize: 16 }}>{emoji}</span>
                      <span style={{ color: selectedType === id ? '#93C5FD' : '#9CA3AF', fontSize: 10, fontWeight: selectedType === id ? 600 : 400, textAlign: 'center', lineHeight: 1.2 }}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: 文风 */}
              <div>
                <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 6 }}>
                  <span style={{ color: '#3B82F6' }}>Step 3</span> · 文风
                </p>
                {Object.entries(stylesByCategory).map(([cat, styles]) => (
                  <div key={cat} className="mb-2 last:mb-0">
                    <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>{STYLE_CATEGORY_LABELS[cat] || cat}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {styles.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedStyle(s.id)}
                          className="px-2 py-1 rounded-md text-[11px] transition-all"
                          style={S.chip(selectedStyle === s.id)}
                          title={s.hint}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Step 4: 行业 */}
              <div>
                <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 6 }}>
                  <span style={{ color: '#3B82F6' }}>Step 4</span> · 行业
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {COPYWRITING_INDUSTRIES.map((ind) => (
                    <button
                      key={ind.id}
                      onClick={() => setSelectedIndustry(ind.id)}
                      className="flex flex-col items-center gap-1 py-2 rounded-lg transition-all"
                      style={{
                        background: selectedIndustry === ind.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                        border: selectedIndustry === ind.id ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                      }}
                      title={ind.audience}
                    >
                      <span style={{ fontSize: 16 }}>{ind.emoji}</span>
                      <span style={{ color: selectedIndustry === ind.id ? '#93C5FD' : '#9CA3AF', fontSize: 10, fontWeight: selectedIndustry === ind.id ? 600 : 400 }}>
                        {ind.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center gap-4 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span style={{ color: '#9CA3AF', fontSize: 11 }}>去 AI 味</span>
                  <button
                    onClick={() => setNoAiMode(!noAiMode)}
                    className="w-9 h-5 rounded-full transition-all relative"
                    style={{ background: noAiMode ? '#3B82F6' : 'rgba(255,255,255,0.2)' }}
                  >
                    <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: noAiMode ? 'calc(100% - 18px)' : 1 }} />
                  </button>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span style={{ color: '#9CA3AF', fontSize: 11 }}>批量 ×3</span>
                  <button
                    onClick={() => setBatchMode(!batchMode)}
                    className="w-9 h-5 rounded-full transition-all relative"
                    style={{ background: batchMode ? '#F59E0B' : 'rgba(255,255,255,0.2)' }}
                  >
                    <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: batchMode ? 'calc(100% - 18px)' : 1 }} />
                  </button>
                </label>
              </div>
            </div>
          )}
        </GlassCard>
        )}

        {/* ──── 生成结果 ──── */}
        {(isLoading || isGenerated) && (
          <GlassCard>
            {isLoading ? (
              <div className="flex flex-col items-center py-8 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>
                  {researching ? '正在搜索最新资料...' : 'AI 正在创作...'}
                </p>
              </div>
            ) : (
              <>
                {/* Batch tabs */}
                {standardContents.length > 1 && (
                  <div className="flex gap-1.5 mb-3">
                    {standardContents.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentBatchIndex(i)}
                        className="px-3 py-1 rounded-lg text-xs"
                        style={S.chip(currentBatchIndex === i)}
                      >
                        版本 {i + 1}
                      </button>
                    ))}
                  </div>
                )}

                {/* Standard / NoAI tabs */}
                <div className="flex rounded-lg overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  {(['standard', 'noai'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setResultTab(tab)}
                      className="flex-1 py-2 text-xs transition-all"
                      style={{
                        color: resultTab === tab ? '#3B82F6' : '#9CA3AF',
                        background: resultTab === tab ? 'rgba(59,130,246,0.15)' : 'transparent',
                        fontWeight: resultTab === tab ? 600 : 400,
                      }}
                    >
                      {tab === 'standard' ? '标准版' : '去 AI 味版'}
                    </button>
                  ))}
                </div>

                {/* Research Results */}
                {researchResults && (
                  <details className="mb-3">
                    <summary className="cursor-pointer py-2 px-3 rounded-lg text-xs flex items-center gap-1.5" style={{ background: 'rgba(59,130,246,0.1)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.2)' }}>
                      <Search size={14} /> 研究参考资料
                    </summary>
                    <div className="mt-2 p-3 rounded-lg text-xs leading-relaxed" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#9CA3AF', whiteSpace: 'pre-wrap' }}>
                      {researchResults}
                    </div>
                  </details>
                )}

                {/* Content */}
                <div className="p-4 rounded-xl mb-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <FormattedText text={currentContent} color="#E5E7EB" fontSize={13} lineHeight={1.8} />
                </div>

                {/* Primary actions */}
                <div className="flex gap-2 mb-3">
                  <button onClick={handleCopy} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#E5E7EB' }}>
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? '已复制' : '复制'}
                  </button>
                  <button onClick={handleGenerate} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#E5E7EB' }}>
                    <RefreshCw size={14} /> 重新生成
                  </button>
                  <button onClick={() => {
                    fetch('/api/inspiration', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'text', title: currentContent.substring(0, 50), original_text: currentContent, source_platform: 'ai', tags: ['AI作品'] }),
                    }).then(() => showToast('已存为灵感', 'success')).catch(() => showToast('保存失败', 'error'));
                  }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#E5E7EB' }}>
                    <FileText size={14} /> 存为灵感
                  </button>
                </div>

                {/* 下一步：导入到其他模块 */}
                <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 6 }}>导入到下一步</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { icon: <ImageIcon size={14} />, label: 'AI 生图', onClick: handleImportToImage, color: '#8B5CF6' },
                    { icon: <Mic size={14} />, label: 'AI 配音', onClick: handleTTS, color: '#10B981', loading: isPlayingAudio },
                    { icon: <Grid3x3 size={14} />, label: '9 宫格', onClick: handleImportToAds, color: '#F59E0B' },
                  ]).map(({ icon, label, onClick, color, loading }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      disabled={loading}
                      className="flex flex-col items-center gap-1 py-2 rounded-lg text-[10px]"
                      style={{ background: `rgba(255,255,255,0.05)`, border: '1px solid rgba(255,255,255,0.08)', color: '#9CA3AF', opacity: loading ? 0.6 : 1 }}
                    >
                      <span style={{ color }}>{loading ? <div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> : icon}</span>
                      {loading ? '播放中' : label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </GlassCard>
        )}

        {/* ──── 多平台改写 ──── */}
        {isGenerated && !isLoading && (
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600 }}>
                <Globe size={14} color="#8B5CF6" style={{ display: 'inline', marginRight: 4 }} />
                多平台改写
              </p>
              <button
                onClick={handleRewriteMulti}
                disabled={isRewriting}
                className="px-3 py-1 rounded-lg text-[11px] flex items-center gap-1.5"
                style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#C4B5FD' }}
              >
                {isRewriting ? <><div className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" /> 改写中</> : <><RefreshCw size={12} /> 一键改写</>}
              </button>
            </div>

            {Object.keys(rewriteContents).length > 0 ? (
              <>
                <div className="flex gap-1 mb-3 overflow-x-auto">
                  {[
                    { key: 'xiaohongshu', label: '小红书' },
                    { key: 'douyin', label: '抖音' },
                    { key: 'wechat_article', label: '公众号' },
                    { key: 'weibo', label: '微博' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setRewriteTab(key)}
                      className="px-3 py-1.5 rounded-lg text-xs flex-shrink-0"
                      style={rewriteTab === key
                        ? { background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#C4B5FD' }
                        : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#9CA3AF' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="p-3 rounded-xl mb-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <FormattedText text={rewriteContents[rewriteTab] || '暂无内容'} color="#E5E7EB" fontSize={13} lineHeight={1.8} />
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(rewriteContents[rewriteTab] || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="w-full py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
                  style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#C4B5FD' }}
                >
                  <Copy size={12} /> 复制
                </button>
              </>
            ) : (
              <p style={{ color: '#6B7280', fontSize: 12, textAlign: 'center', padding: 12 }}>
                点击「一键改写」将文案转为四个平台版本
              </p>
            )}
          </GlassCard>
        )}
      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />

      <Step1MaterialRefineModal
        open={refineModalOpen}
        userInput={refineModalInput.userInput}
        inspirations={refineModalInput.inspirations}
        initialResult={refineModalInput.result}
        onClose={() => setRefineModalOpen(false)}
        onConfirm={(finalText) => {
          setRefineModalResult(finalText);
          handleConfirmRefine();
        }}
      />

      {/* 历史生成 */}
      {!historyLoading && historyItems.length > 0 && (
        <div className="px-4 pb-4">
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>历史生成</p>
          <div className="space-y-2">
            {historyItems.map((item) => (
              <GlassCard key={item.id} hover className="!p-3 cursor-pointer"
                onClick={() => {
                  const fullText = item.fullContent || item.content || '';
                  if (fullText) setUserInput(fullText);
                  if (item.prompt) setRefinedMessage(item.prompt);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 20 }}>{item.metadata?.generatedImage ? '🖼️' : '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: '#E5E7EB', fontSize: 13 }} className="truncate">{item.title}</p>
                    <p style={{ color: '#9CA3AF', fontSize: 11 }} className="truncate mt-0.5">{item.content?.substring(0, 80) || ''}</p>
                  </div>
                  <span style={{ color: '#6B7280', fontSize: 10 }}>{item.time}</span>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AICopywritingPage() {
  return (
    <ProtectedRoute>
      <AICopywritingContent />
    </ProtectedRoute>
  );
}
