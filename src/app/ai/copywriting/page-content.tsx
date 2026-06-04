"use client";


import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Copy, RefreshCw, Share2, Zap, ChevronDown, ChevronUp, Check, ImageIcon, VideoIcon, Layers, Globe, Wand2, FileText, Sparkles, X, Mic, Grid3x3 } from "lucide-react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
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
import { useWorkflowSession } from "@/hooks/use-workflow-session";
import { WorkflowSessionBar } from "@/components/WorkflowSessionBar";

const typeEmojis: Record<string, string> = {
  text: "📝",
  link: "🔗",
  image: "🖼️",
  video: "🎬",
  voice: "🎵",
  schedule: "📅",
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

// ─── 智能排序评分(只在 client 算,后端返 created_at desc) ─────────
function scoreInspiration(item: InspirationItem, now: number = Date.now()): number {
  // recency: 7 天内 = 1,线性衰减
  const created = item.created_at ? new Date(item.created_at).getTime() : now;
  const days = Math.max(0, (now - created) / (1000 * 60 * 60 * 24));
  const recency = Math.max(0, 1 - days / 7);
  // 内容长度
  const textLen = (item.original_text || '').length;
  const lengthScore = Math.min(1, textLen / 200);
  // 有 ai_summary 加分
  const summaryScore = (item.ai_summary && item.ai_summary.length > 50) ? 1 : 0;
  return 0.4 * recency + 0.35 * lengthScore + 0.25 * summaryScore;
}

const STYLE_CATEGORY_LABELS: Record<string, string> = {
  '情感': '🌸 情感',
  '专业': '📚 专业',
  '营销': '💰 营销',
  '搞笑': '😂 搞笑',
};

function AICopywritingContent() {
  const { showToast } = useToast();
  const router = useRouter();
  const { handoff, receive, searchParams } = useContentHandoff();
  const workflowSessionId = searchParams.get('workflow_session_id') || undefined;
  const { session, isInWorkflow, completeCurrentStep, pauseSession, resumeSession, abandonSession } = useWorkflowSession(workflowSessionId);

  // ─── 用户偏好持久化 ─────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ─── Step 1: 选材 + 输入 + 智能助手 ─────────────────────
  const [inspirations, setInspirations] = useState<InspirationItem[]>([]);
  const [selectedInspirations, setSelectedInspirations] = useState<Set<string | number>>(new Set());
  const [userInput, setUserInput] = useState('');
  const [refinedMessage, setRefinedMessage] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // 第二层新增:Step 1 过滤 + 排序 state(方案 B:默认显示全部,AI 加 ⚠️ 标签警示)
  const [typeFilter, setTypeFilter] = useState<'all' | 'text' | 'image' | 'video'>('all');
  const [hideAiWorks, setHideAiWorks] = useState(false);  // 用户可手动隐藏 AI 作品
  const [sortMode, setSortMode] = useState<'smart' | 'recent'>('smart');
  // 智能助手产物对比 Modal
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [refineModalInput, setRefineModalInput] = useState({ userInput: '', inspirations: [] as InspirationItem[], result: '' });
  const [refineModalResult, setRefineModalResult] = useState('');

  // 第三层新增:URL 自动检测 + 图片粘贴/拖拽
  const [analyzingUrl, setAnalyzingUrl] = useState<string | null>(null);  // 正在解析的 URL
  const [urlError, setUrlError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const urlDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Step 2: 平台类型 ─────────────────────────────────
  const [selectedType, setSelectedType] = useState('xiaohongshu');

  // ─── Step 3: 文风 ─────────────────────────────────────
  const [selectedStyle, setSelectedStyle] = useState('planting');

  // ─── Step 4: 行业 ─────────────────────────────────────
  const [selectedIndustry, setSelectedIndustry] = useState('general');

  // ─── 开关 ─────────────────────────────────────────────
  const [batchMode, setBatchMode] = useState(false);
  const [noAiMode, setNoAiMode] = useState(true);

  // ─── 生成结果 ─────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [resultTab, setResultTab] = useState<"standard" | "noai">("standard");
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [standardContents, setStandardContents] = useState<string[]>([generateStandardContent()]);
  const [noAiContents, setNoAiContents] = useState<string[]>([generateNoAiContent()]);
  const [copied, setCopied] = useState(false);

  // ─── 多平台改写 ───────────────────────────────────────
  const [rewriteContents, setRewriteContents] = useState<Record<string, string>>({});
  const [rewriteTab, setRewriteTab] = useState('xiaohongshu');
  const [isRewriting, setIsRewriting] = useState(false);

  // 智能助手：textarea 自动撑高
  const userInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (userInputRef.current) {
      userInputRef.current.style.height = 'auto';
      userInputRef.current.style.height = Math.min(userInputRef.current.scrollHeight, 200) + 'px';
    }
  }, [userInput]);

  // ─── 加载灵感列表(支持 type / hideAiWorks) ─────────────
  // 方案 B:默认显示全部(包含 AI);用户可手动开启「隐藏 AI」开关过滤掉
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

  // typeFilter / hideAiWorks 变化时重新 fetch
  useEffect(() => {
    loadInspirations(typeFilter, hideAiWorks);
  }, [typeFilter, hideAiWorks, loadInspirations]);

  // 第三层:URL 自动检测 — 500ms debounce 后调 analyze-link
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
          // 1. 入库到 content_items
          const inspirationType = data.linkType === 'image' ? 'image'
            : data.linkType === 'video' ? 'video' : 'link';
          const inspirationRes = await fetch('/api/inspiration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: inspirationType,
              title: data.title,
              original_text: data.summary || data.keyPoints?.join(' / '),
              ai_summary: data.summary,
              source_url: url,
              source_platform: 'link',
              media_urls: data.mediaUrl ? [data.mediaUrl] : null,
            }),
          });
          const inspData = await inspirationRes.json();
          if (inspData.success && inspData.data?.id) {
            // 2. 自动加入选中
            setSelectedInspirations(prev => {
              const next = new Set(prev);
              next.add(inspData.data.id);
              return next;
            });
          }
          // 3. 顺手把 summary 写入提炼结果
          setRefinedMessage(data.summary || '');
          // 4. 清空输入框(URL 已经被处理)
          setUserInput('');
          // 5. 重新拉灵感库
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

    return () => {
      if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current);
    };
  }, [userInput, loadInspirations, typeFilter, hideAiWorks, showToast]);

  // 第三层:处理图片文件(粘贴/拖拽/选择)
  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setImageError('只支持图片文件');
      return;
    }
    setUploadingImage(true);
    setImageError(null);
    try {
      // 1. 上传到 Supabase Storage
      const formData = new FormData();
      formData.append('file', file);
      const upRes = await fetch('/api/upload/inspiration', {
        method: 'POST',
        body: formData,
      });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.success) {
        throw new Error(upData.error || '上传失败');
      }
      const imageUrl = upData.data.url;

      // 2. 调豆包视觉理解
      const analyzeRes = await fetch('/api/ai/copywriting/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeData.success) {
        throw new Error(analyzeData.error || '图片分析失败');
      }

      // 3. 更新已上传的灵感记录(写 ai_summary,替换占位标题)
      //    上传 API 已建好 content_item,这里用 PUT 补一下
      const itemId = upData.data.id;
      await fetch(`/api/inspiration/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_summary: analyzeData.data.description,
          title: analyzeData.data.text?.substring(0, 50) || analyzeData.data.description?.substring(0, 50) || '图片素材',
        }),
      }).catch(() => {});

      // 4. 自动加入选中 + 写入提炼
      setSelectedInspirations(prev => {
        const next = new Set(prev);
        next.add(itemId);
        return next;
      });
      setRefinedMessage(analyzeData.data.description);
      showToast(`已分析图片: ${analyzeData.data.tags?.slice(0, 2).join(' / ') || '已加入灵感库'}`, 'success');

      // 5. 重新拉灵感库
      loadInspirations(typeFilter, hideAiWorks);
    } catch (e: any) {
      console.error('[image] 处理失败:', e);
      setImageError(e?.message || '图片处理失败');
    } finally {
      setUploadingImage(false);
    }
  }, [loadInspirations, typeFilter, hideAiWorks, showToast]);

  // 从 URL 接收上游页面带入的参数
  useEffect(() => {
    const params = receive(['text', 'topic', 'inspirationId', 'industry', 'style']);
    if (params.text) setUserInput(params.text);
    if (params.topic) {
      if (COPYWRITING_TYPES.some(t => t.id === params.topic)) {
        setSelectedType(params.topic);
      }
    }
    if (params.inspirationId) {
      const ids = params.inspirationId.split(',').filter(Boolean);
      setSelectedInspirations(new Set(ids));
    }
    if (params.industry && findIndustry(params.industry)) {
      setSelectedIndustry(params.industry);
    }
    if (params.style && COPYWRITING_STYLES.some(s => s.id === params.style)) {
      setSelectedStyle(params.style);
    }
  }, []);

  // 工作流：从 session.accumulated_handoff 预填
  useEffect(() => {
    if (!session?.accumulated_handoff) return;
    const h = session.accumulated_handoff as Record<string, string>;
    if (h.text) setUserInput(h.text);
    else if (h.prompt) setUserInput(h.prompt);
    if (h.topic && COPYWRITING_TYPES.some(t => t.id === h.topic)) {
      setSelectedType(h.topic);
    }
    if (h.industry && findIndustry(h.industry)) {
      setSelectedIndustry(h.industry);
    }
    if (h.style && COPYWRITING_STYLES.some(s => s.id === h.style)) {
      setSelectedStyle(h.style);
    }
  }, [session]);

  // 应用上次设置
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

  // 智能助手：把"素材 + 输入"提炼成核心信息(弹 Modal 让用户确认/编辑)
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

      const res = await fetch('/api/ai/copywriting/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspirations: inspData, userInput }),
      });
      const data = await res.json();
      if (data.success) {
        // 打开对比 Modal,让用户在确认前编辑
        setRefineModalInput({ userInput, inspirations: selectedItems, result: data.data.refined });
        setRefineModalResult(data.data.refined);
        setRefineModalOpen(true);
      } else {
        showToast('提炼失败：' + (data.error || '未知错误'), 'error');
      }
    } catch (e) {
      showToast('提炼失败，请稍后重试', 'error');
    } finally {
      setIsRefining(false);
    }
  };

  // 确认 Modal 提炼结果
  const handleConfirmRefine = () => {
    setRefinedMessage(refineModalResult);
    setRefineModalOpen(false);
    showToast('已提炼核心信息', 'success');
  };

  // 保存最近设置
  const saveLastSettings = () => {
    try {
      localStorage.setItem('copywriting_last_settings', JSON.stringify({
        selectedType,
        selectedStyle,
        selectedIndustry,
        noAiMode,
      }));
    } catch {}
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    saveLastSettings();
    try {
      const selectedData = inspirations
        .filter(item => selectedInspirations.has(item.id))
        .map(item => ({
          title: item.title,
          originalText: item.original_text || '',
          aiSummary: item.ai_summary || '',
        }));

      if (selectedData.length === 0 && !userInput.trim() && !refinedMessage) {
        showToast('请先选择灵感、输入主题,或粘贴链接/图片', 'error');
        setIsLoading(false);
        return;
      }

      const finalInstruction = refinedMessage || userInput.trim() || undefined;
      const batchN = batchMode ? 3 : 1;

      const [standardRes, noAiRes] = await Promise.all([
        fetch('/api/ai/copywriting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inspirations: selectedData,
            type: selectedType,
            style: COPYWRITING_STYLES.find(s => s.id === selectedStyle)?.label || selectedStyle,
            noAiTaste: false,
            n: batchN,
            industry: selectedIndustry,
            userInstruction: finalInstruction,
          }),
        }),
        noAiMode
          ? fetch('/api/ai/copywriting', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                inspirations: selectedData,
                type: selectedType,
                style: COPYWRITING_STYLES.find(s => s.id === selectedStyle)?.label || selectedStyle,
                noAiTaste: true,
                n: batchN,
                industry: selectedIndustry,
                userInstruction: finalInstruction,
              }),
            })
          : null,
      ]);

      const standardData = await standardRes.json();
      const standardResult = standardData.success ? standardData.data.content : generateStandardContent();
      setStandardContents(Array.isArray(standardResult) ? standardResult : [standardResult]);
      setCurrentBatchIndex(0);

      if (noAiRes) {
        const noAiData = await noAiRes.json();
        const noAiResult = noAiData.success ? noAiData.data.content : (Array.isArray(standardResult) ? standardResult[0] : standardResult);
        setNoAiContents(Array.isArray(noAiResult) ? noAiResult : [noAiResult]);
      } else {
        setNoAiContents(Array.isArray(standardResult) ? standardResult : [standardResult]);
      }

      setRewriteContents({});

      // 自动保存到灵感库
      const content = Array.isArray(standardResult) ? standardResult[0] : standardResult;
      if (content) {
        fetch('/api/inspiration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'text',
            title: content.substring(0, 50),
            original_text: content,
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
      console.error('Generation failed:', error);
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
      const res = await fetch('/api/ai/copywriting/rewrite-multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentContent }),
      });
      const data = await res.json();
      if (data.success) {
        setRewriteContents(data.data.versions || {});
      }
    } catch (e) {
      console.error('Multi-platform rewrite failed:', e);
    }
    setIsRewriting(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const handleRegenerate = () => handleGenerate();

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'AI 生成的文案', text: currentContent });
      } else {
        await handleCopy();
        showToast('链接已复制到剪贴板！', 'success');
      }
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  // 跳到 AI 生图，带上 prompt + 行业
  const handleImportToImage = () => {
    handoff('/ai/image', {
      prompt: currentContent.slice(0, 300),
      topic: selectedType,
      industry: selectedIndustry,
      style: COPYWRITING_STYLES.find(s => s.id === selectedStyle)?.label,
    });
  };

  // 跳到 AI 视频
  const handleImportToVideo = () => {
    handoff('/ai/video', {
      text: currentContent.slice(0, 300),
      topic: selectedType,
      style: COPYWRITING_STYLES.find(s => s.id === selectedStyle)?.label,
    });
  };

  // 跳到 AI 数字人 — 用文案做口播脚本
  const handleImportToDigitalHuman = () => {
    handoff('/ai/digital-human', {
      topic: currentContent.slice(0, 100), // 数字人 20s 限制,取前 100 字
      script: currentContent,
      style: selectedStyle,
      industry: selectedIndustry,
    });
  };

  // 跳到朋友圈 9 宫格 — 用文案做产品/卖点
  const handleImportToAds = () => {
    handoff('/ai/ads', {
      topic: currentContent.slice(0, 200),
      text: currentContent,
      industry: selectedIndustry,
    });
  };

  const handleNavigate = (page: PageKey) => {
    switch (page) {
      case "home": router.push("/home"); break;
      case "inspiration": router.push("/inspiration"); break;
      case "ai": router.push("/ai"); break;
      case "hotspot": router.push("/hotspot"); break;
      case "profile": router.push("/profile"); break;
      default: router.push("/home");
    }
  };

  const currentSelectedCount = selectedInspirations.size;
  const currentIndustry = findIndustry(selectedIndustry);

  // 选中的 AI 作品数(用于顶部黄色警告)
  const selectedAiCount = useMemo(() => {
    return inspirations
      .filter(i => selectedInspirations.has(i.id) && i.source_platform === 'ai')
      .length;
  }, [inspirations, selectedInspirations]);

  // 应用智能排序
  const displayedInspirations = useMemo(() => {
    if (sortMode === 'recent') return inspirations;
    return [...inspirations].sort((a, b) => {
      const sb = scoreInspiration(b) - scoreInspiration(a);
      if (sb !== 0) return sb;
      // tie-break: 新的在前
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [inspirations, sortMode]);

  // 按 category 分组文风
  const stylesByCategory = COPYWRITING_STYLES.reduce<Record<string, typeof COPYWRITING_STYLES>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <TopNav title="AI 文案创作" showBack onBack={() => router.back()} />

      {isInWorkflow && session && (
        <WorkflowSessionBar session={session} onPause={pauseSession} onResume={resumeSession} onAbandon={abandonSession} />
      )}

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* 快捷设置 */}
        <GlassCard className="!p-3">
          <button
            className="flex items-center justify-between w-full"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <span style={{ color: "#9CA3AF", fontSize: 12 }}>快捷设置</span>
            {settingsOpen ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
          </button>
          {settingsOpen && (
            <div className="mt-3 pt-3 flex flex-wrap gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ color: "#6B7280", fontSize: 11, lineHeight: '28px' }}>
                上次：{findIndustry(JSON.parse(localStorage.getItem('copywriting_last_settings') || '{}')?.selectedIndustry || 'general')?.name}
                {' · '}
                {COPYWRITING_TYPES.find(t => t.id === (JSON.parse(localStorage.getItem('copywriting_last_settings') || '{}')?.selectedType || 'xiaohongshu'))?.label}
              </span>
            </div>
          )}
        </GlassCard>

        {/* Step 1: 选材 + 输入 + 智能助手 */}
        <GlassCard>
          <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            <span style={{ color: "#3B82F6" }}>Step 1</span> · 选材与意图
          </p>

          {/* 1.0 选 3 提示 */}
          {currentSelectedCount >= 3 && (
            <div
              className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
            >
              <span style={{ color: '#FDE047', fontSize: 11 }}>💡</span>
              <span style={{ color: '#FDE68A', fontSize: 11, lineHeight: 1.4 }}>
                选了 {currentSelectedCount} 条素材,AI 容易分心。3 条以内最佳,多余的会稀释核心信息。
              </span>
            </div>
          )}

          {/* 1.0b AI 作品警告(选中 AI 作品时) */}
          {selectedAiCount > 0 && (
            <div
              className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
            >
              <span style={{ color: '#FDE047', fontSize: 11 }}>⚠️</span>
              <span style={{ color: '#FDE68A', fontSize: 11, lineHeight: 1.4 }}>
                选了 {selectedAiCount} 条 AI 作品,二次创作会放大 AI 味,建议开启「去 AI 味」开关(下方)。
              </span>
            </div>
          )}

          {/* 1a. 灵感库多选 */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <p style={{ color: "#9CA3AF", fontSize: 11 }}>
                📚 灵感库多选（{currentSelectedCount} / {inspirations.length}）
              </p>
              {/* 排序下拉 */}
              <button
                onClick={() => setSortMode(sortMode === 'smart' ? 'recent' : 'smart')}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#9CA3AF',
                }}
                title={sortMode === 'smart' ? '当前:智能排序' : '当前:最新优先'}
              >
                {sortMode === 'smart' ? <>✨ 智能</> : <>🕐 最新</>}
              </button>
            </div>

            {/* 类型 chips + 显示 AI 开关 */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {([
                { key: 'all', label: '全部' },
                { key: 'text', label: '📝 灵感' },
                { key: 'image', label: '🖼️ 图片' },
                { key: 'video', label: '🎬 视频' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTypeFilter(key)}
                  className="px-2.5 py-0.5 rounded-full text-[10px]"
                  style={{
                    background: typeFilter === key ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                    border: typeFilter === key ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                    color: typeFilter === key ? '#93C5FD' : '#9CA3AF',
                  }}
                >
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
                title={hideAiWorks ? '当前:已隐藏 AI 作品' : '当前:显示所有(含 AI 作品)'}
              >
                {hideAiWorks ? '⚠️ AI 已隐藏' : '⚠️ 隐藏 AI 作品'}
              </button>
            </div>
            <div
              className="space-y-2 overflow-y-auto custom-scrollbar"
              style={{ maxHeight: 180 }}
            >
              {displayedInspirations.length > 0 ? (
                displayedInspirations.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer"
                    onClick={() => toggleInspiration(item.id)}
                    style={{
                      background: selectedInspirations.has(item.id) ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.05)",
                      border: selectedInspirations.has(item.id) ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 text-white"
                      style={{
                        background: selectedInspirations.has(item.id) ? "#3B82F6" : "transparent",
                        border: selectedInspirations.has(item.id) ? "none" : "1px solid rgba(255,255,255,0.3)",
                        fontSize: 9,
                      }}
                    >
                      {selectedInspirations.has(item.id) ? "✓" : ""}
                    </div>
                    <span style={{ fontSize: 16 }}>{typeEmojis[item.type || "text"]}</span>
                    <span style={{ color: "#E5E7EB", fontSize: 12 }} className="truncate flex-1">
                      {item.title || item.ai_summary || item.original_text?.substring(0, 30) || "未命名灵感"}
                    </span>
                    {item.source_platform === 'ai' && (
                      <span
                        style={{
                          color: '#FDE68A',
                          fontSize: 9,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: 'rgba(245,158,11,0.15)',
                          border: '1px solid rgba(245,158,11,0.3)',
                          flexShrink: 0,
                        }}
                        title="AI 作品 — 二次创作会放大 AI 味"
                      >
                        AI
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <p style={{ color: "#6B7280", fontSize: 11, textAlign: 'center', padding: 8 }}>
                  {hideAiWorks ? '暂无灵感数据(已隐藏 AI 作品,试试关掉「隐藏 AI 作品」开关)' : '暂无灵感数据'}
                </p>
              )}
            </div>
          </div>

          {/* 1b. 用户输入框 */}
          <div className="mb-3">
            <p style={{ color: "#9CA3AF", fontSize: 11, marginBottom: 6 }}>
              ✏️ 自由输入（主题 / 粘贴链接自动解析 / 粘贴或拖入图片自动识别）
            </p>
            <textarea
              ref={userInputRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onPaste={(e) => {
                // 检测剪贴板里的图片
                const items = e.clipboardData?.items;
                if (!items) return;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) {
                      e.preventDefault();
                      handleImageFile(file);
                      return;
                    }
                  }
                }
              }}
              placeholder="例：写一篇面向 25-30 岁职场女性的抗老精华推荐... 也可直接粘贴 URL 或图片"
              className="w-full p-3 rounded-lg text-sm resize-none custom-scrollbar"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#E5E7EB",
                minHeight: 60,
                maxHeight: 200,
              }}
            />
            {/* URL 解析 / 上传中提示 */}
            {(analyzingUrl || urlError || uploadingImage || imageError) && (
              <div
                className="mt-1.5 px-2 py-1.5 rounded-lg flex items-center gap-1.5"
                style={{
                  background: (urlError || imageError) ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)',
                  border: `1px solid ${(urlError || imageError) ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.25)'}`,
                }}
              >
                {analyzingUrl ? (
                  <>
                    <div className="w-2.5 h-2.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                    <span style={{ color: '#93C5FD', fontSize: 10 }}>🔗 正在解析链接...</span>
                  </>
                ) : uploadingImage ? (
                  <>
                    <div className="w-2.5 h-2.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                    <span style={{ color: '#93C5FD', fontSize: 10 }}>🖼️ 正在上传并分析图片...</span>
                  </>
                ) : (
                  <span style={{ color: '#FCA5A5', fontSize: 10 }}>❌ {urlError || imageError}</span>
                )}
              </div>
            )}

            {/* 拖拽上传 hint */}
            <div
              className="mt-1.5 flex items-center gap-1.5"
              onDragOver={(e) => { e.preventDefault(); setIsDraggingImage(true); }}
              onDragLeave={() => setIsDraggingImage(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingImage(false);
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('image/')) handleImageFile(file);
              }}
            >
              <label
                className="flex-1 px-2 py-1 rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                style={{
                  background: isDraggingImage ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                  border: isDraggingImage ? '1px dashed rgba(59,130,246,0.6)' : '1px dashed rgba(255,255,255,0.15)',
                  color: isDraggingImage ? '#93C5FD' : '#6B7280',
                  fontSize: 10,
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingImage(true); }}
                onDragLeave={() => setIsDraggingImage(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && file.type.startsWith('image/')) handleImageFile(file);
                }}
              >
                <ImageIcon size={11} />
                <span>点击或拖入图片 (自动识别文字与场景)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageFile(file);
                    e.target.value = ''; // 允许重复选同一张
                  }}
                />
              </label>
            </div>
          </div>

          {/* 1c. 智能助手按钮 */}
          <button
            onClick={handleRefine}
            disabled={isRefining}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.2))',
              border: '1px solid rgba(139,92,246,0.4)',
              color: '#C4B5FD',
            }}
          >
            {isRefining ? (
              <><div className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" /> 提炼中...</>
            ) : (
              <><Wand2 size={14} /> 智能助手：把素材+输入提炼成核心信息</>
            )}
          </button>

          {refinedMessage && (
            <div
              className="mt-3 p-3 rounded-lg"
              style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)' }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <p style={{ color: "#A78BFA", fontSize: 11, fontWeight: 600 }}>✨ 已提炼的核心信息</p>
                <button onClick={() => setRefinedMessage('')} className="text-gray-500">
                  <X size={12} />
                </button>
              </div>
              <p style={{ color: "#E5E7EB", fontSize: 12, lineHeight: 1.6 }}>{refinedMessage}</p>
            </div>
          )}
        </GlassCard>

        {/* Step 2: 内容类型 */}
        <GlassCard>
          <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: "#3B82F6" }}>Step 2</span> · 平台与内容类型
          </p>
          <div className="grid grid-cols-4 gap-2">
            {COPYWRITING_TYPES.map(({ id, label, emoji, scenario }) => (
              <button
                key={id}
                onClick={() => setSelectedType(id)}
                className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg transition-all"
                style={{
                  background: selectedType === id ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                  border: selectedType === id ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.1)",
                }}
                title={scenario}
              >
                <span style={{ fontSize: 18 }}>{emoji}</span>
                <span style={{ color: selectedType === id ? "#93C5FD" : "#9CA3AF", fontSize: 10, fontWeight: selectedType === id ? 600 : 400, textAlign: 'center', lineHeight: 1.2 }}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Step 3: 文风 */}
        <GlassCard>
          <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            <span style={{ color: "#3B82F6" }}>Step 3</span> · 文风
          </p>
          {Object.entries(stylesByCategory).map(([cat, styles]) => (
            <div key={cat} className="mb-3 last:mb-0">
              <p style={{ color: "#6B7280", fontSize: 11, marginBottom: 6 }}>{STYLE_CATEGORY_LABELS[cat] || cat}</p>
              <div className="flex flex-wrap gap-1.5">
                {styles.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStyle(s.id)}
                    className="px-2.5 py-1 rounded-md text-xs transition-all"
                    style={{
                      background: selectedStyle === s.id ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                      border: selectedStyle === s.id ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.1)",
                      color: selectedStyle === s.id ? "#93C5FD" : "#9CA3AF",
                    }}
                    title={s.hint}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </GlassCard>

        {/* Step 4: 行业 */}
        <GlassCard>
          <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            <span style={{ color: "#3B82F6" }}>Step 4</span> · 行业
          </p>
          <div className="grid grid-cols-5 gap-2">
            {COPYWRITING_INDUSTRIES.map((ind) => (
              <button
                key={ind.id}
                onClick={() => setSelectedIndustry(ind.id)}
                className="flex flex-col items-center gap-1 py-2.5 rounded-lg transition-all"
                style={{
                  background: selectedIndustry === ind.id ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                  border: selectedIndustry === ind.id ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.1)",
                }}
                title={ind.audience}
              >
                <span style={{ fontSize: 18 }}>{ind.emoji}</span>
                <span style={{ color: selectedIndustry === ind.id ? "#93C5FD" : "#9CA3AF", fontSize: 11, fontWeight: selectedIndustry === ind.id ? 600 : 400 }}>{ind.name}</span>
              </button>
            ))}
          </div>

          {/* 行业模板预览（折叠） */}
          {currentIndustry && currentIndustry.id !== 'general' && (
            <details className="mt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
              <summary style={{ color: '#9CA3AF', fontSize: 11, cursor: 'pointer', listStyle: 'none' }}>
                🔍 查看该行业的 AI 写作模板
              </summary>
              <div className="mt-2 p-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <p style={{ color: '#93C5FD', fontSize: 11, lineHeight: 1.7 }}>
                  <strong>受众：</strong>{currentIndustry.audience}<br />
                  <strong>必含：</strong>{currentIndustry.mustInclude}<br />
                  <strong>避坑：</strong>{currentIndustry.avoidList}<br />
                  <strong>开头：</strong>{currentIndustry.opener}<br />
                  <strong>CTA：</strong>{currentIndustry.cta}<br />
                  <strong>长度：</strong>{currentIndustry.recLength}
                </p>
              </div>
            </details>
          )}
        </GlassCard>

        {/* 开关 + 生成按钮 */}
        <GlassCard className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex flex-col gap-1">
              <span style={{ color: "#E5E7EB", fontSize: 14 }}>去 AI 味</span>
              <span style={{ color: "#9CA3AF", fontSize: 11 }}>让文案更像真人写的</span>
            </div>
            <button
              onClick={() => setNoAiMode(!noAiMode)}
              className="w-10 h-6 rounded-full transition-all relative"
              style={{ background: noAiMode ? "#3B82F6" : "rgba(255,255,255,0.2)" }}
            >
              <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: noAiMode ? "calc(100% - 22px)" : 2 }} />
            </button>
          </div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5" style={{ color: "#E5E7EB", fontSize: 14 }}>
                <Layers size={14} color="#F59E0B" /> 批量生成
              </span>
              <span style={{ color: "#9CA3AF", fontSize: 11 }}>同时生成 3 个不同角度版本</span>
            </div>
            <button
              onClick={() => setBatchMode(!batchMode)}
              className="w-10 h-6 rounded-full transition-all relative"
              style={{ background: batchMode ? "#F59E0B" : "rgba(255,255,255,0.2)" }}
            >
              <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: batchMode ? "calc(100% - 22px)" : 2 }} />
            </button>
          </div>
          <PrimaryButton fullWidth size="lg" onClick={handleGenerate}>
            <Zap size={18} /> {isLoading ? "生成中..." : batchMode ? "批量生成 (3篇)" : "立即生成"}
          </PrimaryButton>
        </GlassCard>

        {/* 生成结果 */}
        {(isLoading || isGenerated) && (
          <GlassCard>
            {isLoading ? (
              <div className="flex flex-col items-center py-8 gap-4">
                <div className="w-10 h-10 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                <p style={{ color: "#9CA3AF", fontSize: 14 }}>AI 正在创作中...</p>
              </div>
            ) : (
              <>
                {standardContents.length > 1 && (
                  <div className="flex gap-1.5 mb-3 overflow-x-auto">
                    {standardContents.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentBatchIndex(i)}
                        className="px-3 py-1 rounded-lg text-xs flex-shrink-0"
                        style={{
                          background: currentBatchIndex === i ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                          border: currentBatchIndex === i ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                          color: currentBatchIndex === i ? '#93C5FD' : '#9CA3AF',
                        }}
                      >
                        版本 {i + 1}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex rounded-xl overflow-hidden mb-4" style={{ background: "rgba(255,255,255,0.05)" }}>
                  {(["standard", "noai"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setResultTab(tab)}
                      className="flex-1 py-2 text-xs transition-all"
                      style={{
                        color: resultTab === tab ? "#3B82F6" : "#9CA3AF",
                        background: resultTab === tab ? "rgba(59,130,246,0.15)" : "transparent",
                        fontWeight: resultTab === tab ? 600 : 400,
                      }}
                    >
                      {tab === "standard" ? "标准版" : "去 AI 味版"}
                    </button>
                  ))}
                </div>
                <div
                  className="p-4 rounded-xl mb-4"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <FormattedText text={currentContent} color="#E5E7EB" fontSize={13} lineHeight={1.8} />
                </div>

                {/* 6 个操作按钮 */}
                <div className="grid grid-cols-3 gap-2">
                  <ActionButton
                    icon={copied ? <Check size={15} /> : <Copy size={15} />}
                    label={copied ? "已复制" : "复制"}
                    onClick={handleCopy}
                  />
                  <ActionButton
                    icon={<RefreshCw size={15} />}
                    label="重新生成"
                    onClick={handleRegenerate}
                  />
                  <ActionButton
                    icon={<Share2 size={15} />}
                    label="分享"
                    onClick={handleShare}
                  />
                  <ActionButton
                    icon={<ImageIcon size={15} />}
                    label="导入 AI 生图"
                    onClick={handleImportToImage}
                    highlight
                  />
                  <ActionButton
                    icon={<VideoIcon size={15} />}
                    label="导入 AI 视频"
                    onClick={handleImportToVideo}
                    highlight
                  />
                  <ActionButton
                    icon={<Mic size={15} />}
                    label="导入数字人"
                    onClick={handleImportToDigitalHuman}
                    highlight
                  />
                  <ActionButton
                    icon={<Grid3x3 size={15} />}
                    label="导入 9 宫格"
                    onClick={handleImportToAds}
                    highlight
                  />
                  <ActionButton
                    icon={<FileText size={15} />}
                    label="存为灵感"
                    onClick={() => {
                      fetch('/api/inspiration', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          type: 'text',
                          title: currentContent.substring(0, 50),
                          original_text: currentContent,
                          source_platform: 'ai',
                          tags: ['AI作品'],
                        }),
                      }).then(() => showToast('已存为灵感', 'success')).catch(() => showToast('保存失败', 'error'));
                    }}
                  />
                </div>
              </>
            )}
          </GlassCard>
        )}

        {/* 多平台改写 */}
        {isGenerated && !isLoading && (
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>
                <Globe size={14} color="#8B5CF6" style={{ display: 'inline', marginRight: 4 }} />
                <span style={{ color: '#8B5CF6' }}>多平台</span> · 一键改写
              </p>
              <button
                onClick={handleRewriteMulti}
                disabled={isRewriting}
                className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                style={{
                  background: 'rgba(139,92,246,0.15)',
                  border: '1px solid rgba(139,92,246,0.3)',
                  color: '#C4B5FD',
                }}
              >
                {isRewriting ? (
                  <><div className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" /> 改写中...</>
                ) : (
                  <><RefreshCw size={12} /> 改写全部</>
                )}
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
                      style={{
                        background: rewriteTab === key ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
                        border: rewriteTab === key ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                        color: rewriteTab === key ? '#C4B5FD' : '#9CA3AF',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div
                  className="p-4 rounded-xl mb-3"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <FormattedText text={rewriteContents[rewriteTab] || '暂无内容'} color="#E5E7EB" fontSize={13} lineHeight={1.8} />
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(rewriteContents[rewriteTab] || '');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="w-full py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
                  style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#C4B5FD' }}
                >
                  <Copy size={12} /> 复制当前版本
                </button>
              </>
            ) : (
              <p style={{ color: '#6B7280', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                点击「改写全部」将当前文案改写为四个平台版本
              </p>
            )}
          </GlassCard>
        )}
      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />

      {/* 智能助手产物对比 Modal */}
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
    </div>
  );
}

// 操作按钮小组件
function ActionButton({ icon, label, onClick, highlight }: { icon: React.ReactNode; label: string; onClick: () => void; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs transition-all active:scale-95"
      style={{
        background: highlight ? "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.2))" : "rgba(255,255,255,0.07)",
        border: highlight ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.12)",
        color: highlight ? "#C4B5FD" : "#E5E7EB",
      }}
    >
      <span style={{ color: highlight ? "#A78BFA" : "#3B82F6" }}>{icon}</span>
      {label}
    </button>
  );
}

export default function AICopywritingPage() {
  return (
    <ProtectedRoute>
      <AICopywritingContent />
    </ProtectedRoute>
  );
}
