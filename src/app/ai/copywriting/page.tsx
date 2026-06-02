"use client";


import { useState, useEffect, useRef } from "react";
import { Copy, RefreshCw, Share2, Zap, ChevronDown, ChevronUp, Check, ImageIcon, VideoIcon, Layers, Globe, Wand2, FileText, Sparkles, X } from "lucide-react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useToast } from "@/components/Toast";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components";
import FormattedText from "@/components/FormattedText";
import {
  COPYWRITING_TYPES,
  COPYWRITING_STYLES,
  COPYWRITING_INDUSTRIES,
  findIndustry,
} from "@/lib/preset-templates";
import { useContentHandoff } from "@/hooks/use-content-handoff";

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
  const { handoff, receive } = useContentHandoff();

  // ─── 用户偏好持久化 ─────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ─── Step 1: 选材 + 输入 + 智能助手 ─────────────────────
  const [inspirations, setInspirations] = useState<InspirationItem[]>([]);
  const [selectedInspirations, setSelectedInspirations] = useState<Set<string | number>>(new Set());
  const [userInput, setUserInput] = useState('');
  const [refinedMessage, setRefinedMessage] = useState('');
  const [isRefining, setIsRefining] = useState(false);

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

  // ─── 初始化：加载灵感 + URL 参数 ──────────────────────
  useEffect(() => {
    (async () => {
      try {
        const inspRes = await fetch('/api/inspiration?limit=20');
        if (inspRes.ok) {
          const data = await inspRes.json();
          setInspirations(data.data || []);
        }
      } catch (e) {
        console.error('Failed to load inspirations', e);
      }
    })();
  }, []);

  // 从 URL 接收上游页面带入的参数
  useEffect(() => {
    const params = receive(['text', 'topic', 'inspirationId', 'industry', 'style']);
    if (params.text) setUserInput(params.text);
    if (params.topic) {
      // topic 可能是文案类型 id
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

  // 智能助手：把"素材 + 输入"提炼成核心信息
  const handleRefine = async () => {
    if (!userInput.trim() && selectedInspirations.size === 0) {
      showToast('请先输入主题或选择素材', 'error');
      return;
    }
    setIsRefining(true);
    try {
      const inspData = inspirations
        .filter(i => selectedInspirations.has(i.id))
        .map(i => ({ title: i.title, originalText: i.original_text, aiSummary: i.ai_summary }));

      const res = await fetch('/api/ai/copywriting/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspirations: inspData, userInput }),
      });
      const data = await res.json();
      if (data.success) {
        setRefinedMessage(data.data.refined);
        showToast('已提炼核心信息', 'success');
      } else {
        showToast('提炼失败：' + (data.error || '未知错误'), 'error');
      }
    } catch (e) {
      showToast('提炼失败，请稍后重试', 'error');
    } finally {
      setIsRefining(false);
    }
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
        selectedData.push({ title: '通用内容创作', originalText: '用户未提供具体素材', aiSummary: '' });
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
          }),
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

  // 按 category 分组文风
  const stylesByCategory = COPYWRITING_STYLES.reduce<Record<string, typeof COPYWRITING_STYLES>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <TopNav title="AI 文案创作" showBack onBack={() => router.back()} />

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
          <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: "#3B82F6" }}>Step 1</span> · 选材与意图
          </p>

          {/* 1a. 灵感库多选 */}
          <div className="mb-3">
            <p style={{ color: "#9CA3AF", fontSize: 11, marginBottom: 6 }}>
              📚 灵感库多选（{currentSelectedCount} / {inspirations.length}）
            </p>
            <div
              className="space-y-2 overflow-y-auto custom-scrollbar"
              style={{ maxHeight: 180 }}
            >
              {inspirations.length > 0 ? (
                inspirations.map((item) => (
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
                  </div>
                ))
              ) : (
                <p style={{ color: "#6B7280", fontSize: 11, textAlign: 'center', padding: 8 }}>暂无灵感数据</p>
              )}
            </div>
          </div>

          {/* 1b. 用户输入框 */}
          <div className="mb-3">
            <p style={{ color: "#9CA3AF", fontSize: 11, marginBottom: 6 }}>
              ✏️ 自由输入（主题/补充信息）
            </p>
            <textarea
              ref={userInputRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="例：写一篇面向 25-30 岁职场女性的抗老精华推荐..."
              className="w-full p-3 rounded-lg text-sm resize-none custom-scrollbar"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#E5E7EB",
                minHeight: 60,
                maxHeight: 200,
              }}
            />
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
