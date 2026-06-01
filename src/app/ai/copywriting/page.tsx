"use client";


import { useState, useEffect } from "react";
import { Copy, RefreshCw, Share2, Zap, ChevronDown, ChevronUp, Check, ImageIcon, VideoIcon, Layers, Globe } from "lucide-react";
import { GlassCard, GlassBadge } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useToast } from "@/components/Toast";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute } from "@/components";
import FormattedText from "@/components/FormattedText";

const contentTypes = [
  { id: "xiaohongshu", label: "小红书文案", emoji: "📱" },
  { id: "script", label: "短视频脚本", emoji: "🎬" },
  { id: "wechat", label: "公众号文章", emoji: "📰" },
];

const styles = [
  "小红书博主风", "专业权威感", "幽默轻松", "情感共鸣",
  "干货知识", "故事叙述", "极简简洁",
];

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

function AICopywritingContent() {
  const { showToast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("xiaohongshu");
  const [selectedStyle, setSelectedStyle] = useState("小红书博主风");
  const [isGenerated, setIsGenerated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [noAiMode, setNoAiMode] = useState(true);
  const [resultTab, setResultTab] = useState<"standard" | "noai">("standard");
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [standardContents, setStandardContents] = useState<string[]>([generateStandardContent()]);
  const [noAiContents, setNoAiContents] = useState<string[]>([generateNoAiContent()]);
  const [inspirations, setInspirations] = useState<InspirationItem[]>([]);
  const [selectedInspirations, setSelectedInspirations] = useState<Set<string | number>>(new Set());
  const [copied, setCopied] = useState(false);

  // 多平台改写
  const [rewriteContents, setRewriteContents] = useState<Record<string, string>>({});
  const [rewriteTab, setRewriteTab] = useState('xiaohongshu');
  const [isRewriting, setIsRewriting] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  // 从 API 加载灵感数据
  useEffect(() => {
    const loadData = async () => {
      try {
        const inspRes = await fetch('/api/inspiration?limit=20');
        if (inspRes.ok) {
          const inspData = await inspRes.json();
          const items = inspData.data || [];
          setInspirations(items);
          const inspIdParam = searchParams.get('inspirationId');
          if (inspIdParam) {
            const inspIds = inspIdParam.split(',').filter(Boolean);
            const autoSelected = new Set<string | number>();
            items.forEach((item: InspirationItem) => {
              if (inspIds.includes(String(item.id))) {
                autoSelected.add(item.id);
              }
            });
            if (autoSelected.size > 0) {
              setSelectedInspirations(autoSelected);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };

    loadData();
  }, []);

  // 从 URL 参数读取 type，自动切换内容类型
  useEffect(() => {
    const typeParam = searchParams.get('type');
    if (typeParam && contentTypes.some(t => t.id === typeParam)) {
      setSelectedType(typeParam);
    }
  }, [searchParams]);

  const standardContent = standardContents[currentBatchIndex] || standardContents[0];
  const noAiContent = noAiContents[currentBatchIndex] || noAiContents[0];
  const currentContent = resultTab === "standard" ? standardContent : noAiContent;

  // 切换灵感选择
  const toggleInspiration = (id: string | number) => {
    const newSelected = new Set(selectedInspirations);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedInspirations(newSelected);
  };

  const saveLastSettings = () => {
    try {
      localStorage.setItem('copywriting_last_settings', JSON.stringify({
        selectedType,
        selectedStyle,
        noAiMode,
      }));
    } catch {}
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    saveLastSettings();
    try {
      // 收集选中的灵感内容
      const selectedData = inspirations
          .filter(item => selectedInspirations.has(item.id))
          .map(item => ({
            title: item.title,
            originalText: item.original_text || '',
            aiSummary: item.ai_summary || '',
          }));

      if (selectedData.length === 0) {
        // 没有选择素材时，传一个占位
        selectedData.push({ title: '通用内容创作', originalText: '用户未选择特定素材，请生成通用参考内容', aiSummary: '' });
      }

      const batchN = batchMode ? 3 : 1;
      // 并行请求标准版和去AI味版
      const [standardRes, noAiRes] = await Promise.all([
        fetch('/api/ai/copywriting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inspirations: selectedData, type: selectedType, style: selectedStyle, noAiTaste: false, n: batchN }),
        }),
        noAiMode
          ? fetch('/api/ai/copywriting', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ inspirations: selectedData, type: selectedType, style: selectedStyle, noAiTaste: true, n: batchN }),
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

      // 重置改写
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
            tags: ['AI作品', selectedType === 'xiaohongshu' ? '小红书' : selectedType === 'wechat' ? '公众号' : '文案'],
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

  const handleRegenerate = () => {
    handleGenerate();
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'AI 生成的文案',
          text: currentContent,
        });
      } else {
        await handleCopy();
        showToast('链接已复制到剪贴板！', 'success');
      }
    } catch (error) {
      console.error('Share failed:', error);
    }
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

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <TopNav title="AI 文案创作" showBack onBack={() => router.back()} />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* Quick Settings */}
        <GlassCard className="!p-3">
          <button
            className="flex items-center justify-between w-full"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <span style={{ color: "#9CA3AF", fontSize: 12 }}>快捷设置</span>
            {settingsOpen ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
          </button>
          {settingsOpen && (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <button
                onClick={() => {
                  try {
                    const saved = localStorage.getItem('copywriting_last_settings');
                    if (saved) {
                      const { selectedType: lastType, selectedStyle: lastStyle, noAiMode: lastNoAi } = JSON.parse(saved);
                      if (lastType) setSelectedType(lastType);
                      if (lastStyle) setSelectedStyle(lastStyle);
                      if (typeof lastNoAi === 'boolean') setNoAiMode(lastNoAi);
                    }
                  } catch {}
                }}
                className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "rgba(59,130,246,0.2)", color: "#93C5FD", border: "1px solid rgba(59,130,246,0.3)" }}>
                应用上次设置
              </button>
            </div>
          )}
        </GlassCard>

        {/* Step 1: 从灵感库选材 */}
        <GlassCard>
          <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: "#3B82F6" }}>Step 1</span> · 从灵感库选材
          </p>
          <div
            className="space-y-2 overflow-y-auto custom-scrollbar"
            style={{ maxHeight: 232 }}
          >
            {inspirations.length > 0 ? (
              inspirations.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                  onClick={() => toggleInspiration(item.id)}
                  style={{
                    background: selectedInspirations.has(item.id) ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.05)",
                    border: selectedInspirations.has(item.id) ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{
                      background: selectedInspirations.has(item.id) ? "#3B82F6" : "transparent",
                      border: selectedInspirations.has(item.id) ? "none" : "1px solid rgba(255,255,255,0.3)",
                      fontSize: 10, color: "#fff"
                    }}
                  >
                    {selectedInspirations.has(item.id) ? "✓" : ""}
                  </div>
                  <span style={{ fontSize: 20 }}>{typeEmojis[item.type || "text"]}</span>
                  <span style={{ color: "#E5E7EB", fontSize: 13 }} className="truncate">
                    {item.title || item.ai_summary || item.original_text?.substring(0, 30) || "未命名灵感"}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-4 text-center" style={{ color: "#9CA3AF" }}>
                <p>暂无灵感数据</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>去灵感库添加一些灵感吧</p>
              </div>
            )}
          </div>
          <p style={{ color: "#9CA3AF", fontSize: 11, marginTop: 8 }}>
            已选 {currentSelectedCount} 个 · 为您推荐最近 {inspirations.length} 个灵感
          </p>
        </GlassCard>

        {/* Step 2: Content Type */}
        <GlassCard>
          <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: "#3B82F6" }}>Step 2</span> · 选择内容类型
          </p>
          <div className="grid grid-cols-3 gap-2">
            {contentTypes.map(({ id, label, emoji }) => (
              <button
                key={id}
                onClick={() => setSelectedType(id)}
                className="flex flex-col items-center gap-2 py-3 rounded-xl transition-all"
                style={{
                  background: selectedType === id ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                  border: selectedType === id ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <span style={{ fontSize: 22 }}>{emoji}</span>
                <span style={{ color: selectedType === id ? "#93C5FD" : "#9CA3AF", fontSize: 11, fontWeight: selectedType === id ? 600 : 400 }}>{label}</span>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Step 3: Writing Style */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600 }}>
              <span style={{ color: "#3B82F6" }}>Step 3</span> · 选择文风
            </p>
            <span style={{ color: "#9CA3AF", fontSize: 11 }}>您最常用：{selectedStyle}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {styles.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedStyle(s)}
                className="px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{
                  background: selectedStyle === s ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.07)",
                  border: selectedStyle === s ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.12)",
                  color: selectedStyle === s ? "#93C5FD" : "#9CA3AF",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Generate */}
        <GlassCard className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex flex-col gap-1">
              <span style={{ color: "#E5E7EB", fontSize: 14 }}>去 AI 味</span>
              <span style={{ color: "#9CA3AF", fontSize: 11 }}>让文案更像真人写的，减少AI痕迹</span>
            </div>
            <button
              onClick={() => setNoAiMode(!noAiMode)}
              className="w-10 h-6 rounded-full transition-all"
              style={{
                background: noAiMode ? "#3B82F6" : "rgba(255,255,255,0.2)",
                position: "relative",
              }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                style={{ left: noAiMode ? "calc(100% - 22px)" : 2 }}
              />
            </button>
          </div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5" style={{ color: "#E5E7EB", fontSize: 14 }}>
                <Layers size={14} color="#F59E0B" /> 批量生成
              </span>
              <span style={{ color: "#9CA3AF", fontSize: 11 }}>同时生成 3 个不同角度的版本</span>
            </div>
            <button
              onClick={() => setBatchMode(!batchMode)}
              className="w-10 h-6 rounded-full transition-all"
              style={{
                background: batchMode ? "#F59E0B" : "rgba(255,255,255,0.2)",
                position: "relative",
              }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                style={{ left: batchMode ? "calc(100% - 22px)" : 2 }}
              />
            </button>
          </div>
          <PrimaryButton fullWidth size="lg" onClick={handleGenerate}>
            <Zap size={18} /> {isLoading ? "生成中..." : batchMode ? "批量生成 (3篇)" : "立即生成"}
          </PrimaryButton>
        </GlassCard>

        {/* Results */}
        {(isLoading || isGenerated) && (
          <GlassCard>
            {isLoading ? (
              <div className="flex flex-col items-center py-8 gap-4">
                <div className="w-10 h-10 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                <p style={{ color: "#9CA3AF", fontSize: 14 }}>AI 正在创作中...</p>
              </div>
            ) : (
              <>
                {/* Batch version picker */}
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
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { icon: copied ? <Check size={15} /> : <Copy size={15} />, label: copied ? "已复制" : "复制", action: handleCopy, highlight: false },
                    { icon: <RefreshCw size={15} />, label: "重新生成", action: handleRegenerate, highlight: false },
                    { icon: <Share2 size={15} />, label: "分享", action: handleShare, highlight: false },
                    { icon: selectedType === "script" ? <VideoIcon size={15} /> : <ImageIcon size={15} />, label: selectedType === "script" ? "AI生视频" : "AI生图", action: () => router.push(selectedType === "script" ? '/ai/video' : '/ai/image'), highlight: true },
                  ].map(({ icon, label, action, highlight }, index) => (
                    <button
                      key={index}
                      onClick={action}
                      className="flex flex-col items-center gap-1 py-2 rounded-xl text-xs transition-all active:scale-95"
                      style={{
                        background: highlight ? "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.2))" : "rgba(255,255,255,0.07)",
                        border: highlight ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.12)",
                        color: highlight ? "#C4B5FD" : "#E5E7EB"
                      }}
                    >
                      <span style={{ color: highlight ? "#A78BFA" : "#3B82F6" }}>{icon}</span>
                      {label}
                    </button>
                  ))}
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

export default function AICopywritingPage() {
  return (
    <ProtectedRoute>
      <AICopywritingContent />
    </ProtectedRoute>
  );
}
