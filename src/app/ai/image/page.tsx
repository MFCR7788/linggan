'use client';


import { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, ChevronDown, ChevronUp, Download, Save, RefreshCw, Palette, Ratio, AlertCircle, ImageIcon, Check, Sparkles, Layers, Wand2, VideoIcon, X, FileText, CheckCircle2, HelpCircle, Copy, RotateCcw } from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProtectedRoute } from '@/components';
import { Toast } from '@/components/Toast';
import { useInspirations } from '@/hooks/use-inspiration';
import { useContentHandoff } from '@/hooks/use-content-handoff';
import {
  IMAGE_PRESETS,
  IMAGE_PALETTES,
  findImagePreset,
  findImagePalette,
} from '@/lib/preset-templates';
import { syncDevAuthCookie } from '@/lib/dev-auth';

const STYLE_OPTIONS = ['写实摄影', '插画风格', '赛博朋克', '极简主义', '水彩手绘', '3D渲染', '复古胶片', '国潮风格'];
const RATIO_OPTIONS = ['1:1', '16:9', '9:16', '4:3', '3:4'];

function formatRelativeTime(time: string): string {
  if (!time) return '';
  const d = new Date(time);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}天前`;
  return d.toLocaleDateString('zh-CN');
}

const typeEmojis: Record<string, string> = {
  text: '📝', link: '🔗', image: '🖼️', video: '🎬', voice: '🎵', schedule: '📅',
};

function AIImageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { handoff, receive } = useContentHandoff();

  // ─── 8 个快捷预设（联动 ratio/style/palette）─────────
  const [selectedPresetId, setSelectedPresetId] = useState('xiaohongshu');
  const [presetsOpen, setPresetsOpen] = useState(true);

  // ─── 1. 选材 + 输入 + 智能提示 ─────────────────────
  const [userInput, setUserInput] = useState('');
  const [refinedPrompt, setRefinedPrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const userInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (userInputRef.current) {
      userInputRef.current.style.height = 'auto';
      userInputRef.current.style.height = Math.min(userInputRef.current.scrollHeight, 160) + 'px';
    }
  }, [userInput]);

  const [selectedInspirations, setSelectedInspirations] = useState<Set<string>>(new Set());
  const { data: inspirations } = useInspirations({ limit: 30 });

  // ─── 2. 参数（联动预设） ────────────────────────────
  const [selectedStyle, setSelectedStyle] = useState('写实摄影');
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [selectedPaletteId, setSelectedPaletteId] = useState<string | null>('coral');

  // ─── 3. 高级（折叠） ────────────────────────────────
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [seed, setSeed] = useState<number | ''>('');
  const [seedHelpOpen, setSeedHelpOpen] = useState(false);
  const [negativePrompt, setNegativePrompt] = useState('');

  // ─── 生成结果（续） ───────────────────────────────────
  const [lastUsedSeed, setLastUsedSeed] = useState<number | null>(null);

  // ─── 生成结果 ────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [batchImages, setBatchImages] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // ─── 历史 ───────────────────────────────────────────
  const [historyWorks, setHistoryWorks] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // ─── 初始化：URL 接收 + 灵感同步 ────────────────────
  useEffect(() => {
    const params = receive(['prompt', 'topic', 'inspirationId', 'preset', 'style', 'industry']);
    if (params.prompt) setUserInput(params.prompt);
    if (params.preset && IMAGE_PRESETS.some(p => p.id === params.preset)) {
      handlePresetChange(params.preset);
    }
    if (params.style && STYLE_OPTIONS.includes(params.style)) {
      setSelectedStyle(params.style);
    }
    if (params.inspirationId) {
      const ids = params.inspirationId.split(',').filter(Boolean);
      setSelectedInspirations(new Set(ids));
    }
  }, []);

  useEffect(() => {
    if (inspirations) {
      const ids = searchParams.get('inspirationId')?.split(',') || [];
      if (ids.length > 0) {
        setSelectedInspirations(new Set(ids.filter(Boolean)));
      }
    }
  }, [searchParams, inspirations]);

  useEffect(() => {
    syncDevAuthCookie();
    fetch('/api/chat/history?works=true&type=图片')
      .then(res => res.json())
      .then(data => {
        if (data?.success && Array.isArray(data.data)) {
          setHistoryWorks(data.data.map((w: any) => ({
            id: w.id,
            title: w.title || 'AI 生成图片',
            time: formatRelativeTime(w.time || ''),
            imageUrl: w.metadata?.generatedImage?.imageUrl || undefined,
            content: w.content,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingHistory(false));
  }, []);

  const toggleInspiration = (id: string) => {
    setSelectedInspirations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ─── 选预设 → 自动联动 ratio/style/palette ──────────
  const handlePresetChange = (id: string) => {
    setSelectedPresetId(id);
    const preset = findImagePreset(id);
    if (preset) {
      setSelectedRatio(preset.ratio);
      setSelectedStyle(preset.style);
      setSelectedPaletteId(preset.palette);
    }
  };

  // 智能提示：调 smart-prompt API
  const handleSmartPrompt = async () => {
    if (!userInput.trim() && selectedInspirations.size === 0) {
      setToast({ message: '请先输入描述或选择素材', type: 'error' });
      return;
    }
    setIsRefining(true);
    try {
      const inspData = (Array.isArray(inspirations) ? inspirations : [])
        .filter((item: any) => selectedInspirations.has(item.id))
        .map((item: any) => ({
          title: item.title,
          originalText: item.original_text,
          aiSummary: item.ai_summary,
        }));

      const preset = findImagePreset(selectedPresetId);
      const palette = selectedPaletteId ? findImagePalette(selectedPaletteId) : null;

      const res = await fetch('/api/ai/image/smart-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspirations: inspData,
          userInput,
          presetId: selectedPresetId,
          style: selectedStyle !== preset?.style ? selectedStyle : undefined,
          ratio: selectedRatio !== preset?.ratio ? selectedRatio : undefined,
          paletteName: palette?.name,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRefinedPrompt(data.data.prompt);
        setToast({ message: '已生成智能提示词', type: 'success' });
      } else {
        setToast({ message: data.error || '生成失败', type: 'error' });
      }
    } catch {
      setToast({ message: '请求失败', type: 'error' });
    } finally {
      setIsRefining(false);
    }
  };

  const finalPrompt = refinedPrompt || userInput;

  const handleGenerate = async () => {
    if (!finalPrompt.trim()) {
      setToast({ message: '请先输入描述', type: 'error' });
      return;
    }
    setIsLoading(true);
    setError(null);
    setImageUrl(null);
    setIsGenerated(false);
    setLastUsedSeed(seed === '' ? null : Number(seed));

    try {
      const n = batchMode ? 4 : 1;
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          ratio: selectedRatio,
          n,
          presetId: selectedPresetId,
          style: selectedStyle,
          paletteId: selectedPaletteId,
          seed: seed === '' ? undefined : seed,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.data)) {
          setBatchImages(data.data.map((r: any) => r.imageUrl).filter(Boolean));
          setImageUrl(data.data[0]?.imageUrl || null);
          setSelectedIndex(0);
        } else {
          setImageUrl(data.data.imageUrl || data.data.url);
          setBatchImages([]);
        }
        setIsGenerated(true);

        // 自动保存到灵感库
        const urls: string[] = Array.isArray(data.data)
          ? data.data.map((r: any) => r.imageUrl).filter(Boolean)
          : [data.data.imageUrl || data.data.url].filter(Boolean);
        if (urls.length > 0) {
          fetch('/api/inspiration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'image',
              title: finalPrompt.substring(0, 50),
              original_text: finalPrompt,
              source_platform: 'ai',
              media_urls: urls,
              tags: ['AI作品', 'AI图片', findImagePreset(selectedPresetId)?.label || ''],
            }),
          }).catch(() => {});
        }
      } else {
        setError(data.error || '生成失败');
      }
    } catch (e) {
      setError('网络请求失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavigate = (page: PageKey) => {
    switch (page) {
      case 'home': router.push('/home'); break;
      case 'inspiration': router.push('/inspiration'); break;
      case 'ai': router.push('/ai'); break;
      case 'hotspot': router.push('/hotspot'); break;
      case 'profile': router.push('/profile'); break;
      default: router.push('/home');
    }
  };

  const handleBack = () => router.push('/ai');

  // 下载图片
  const handleDownload = async (url: string) => {
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `linggan-image-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(dlUrl);
    } catch {
      setToast({ message: '下载失败', type: 'error' });
    }
  };

  // 复制 prompt
  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(finalPrompt);
      setToast({ message: '已复制 prompt', type: 'success' });
    } catch {
      setToast({ message: '复制失败', type: 'error' });
    }
  };

  // 复制种子
  const handleCopySeed = async () => {
    if (lastUsedSeed === null) return;
    try {
      await navigator.clipboard.writeText(String(lastUsedSeed));
      setToast({ message: `已复制种子 ${lastUsedSeed}`, type: 'success' });
    } catch {
      setToast({ message: '复制失败', type: 'error' });
    }
  };

  // 复用种子（把上次用的种子写回到 Step 4，然后展开高级设置）
  const handleReuseSeed = () => {
    if (lastUsedSeed === null) return;
    setSeed(lastUsedSeed);
    setAdvancedOpen(true);
    setSeedHelpOpen(false);
    setToast({ message: `已把种子 ${lastUsedSeed} 填回,展开高级设置`, type: 'success' });
    setTimeout(() => {
      const el = document.querySelector('[data-step-advanced]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // 导入 AI 图生视频（关键新功能）
  const handleImportToVideo = (url: string) => {
    handoff('/ai/video', {
      firstFrame: url,
      prompt: finalPrompt,
      topic: searchParams.get('topic') || undefined,
      style: selectedStyle,
    });
  };

  return (
    <div className="flex flex-col min-h-screen pb-20 overflow-x-hidden">
      <TopNav title="AI 图片生成" showBack onBack={handleBack} />

      <div className="flex-1 px-4 pt-4 space-y-4 min-w-0">
        {/* 8 个快捷预设 */}
        <GlassCard className="!p-3">
          <div className="flex items-center justify-between mb-3">
            <button
              className="flex items-center gap-2 flex-1"
              onClick={() => setPresetsOpen(!presetsOpen)}
            >
              <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>快捷预设（点击自动联动比例/风格/色调）</span>
              {presetsOpen ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
            </button>
            <button
              onClick={() => router.push('/ai/image/batch')}
              className="ml-2 px-2.5 py-1 rounded-md text-[10px] flex items-center gap-1 flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.2))',
                border: '1px solid rgba(139,92,246,0.4)',
                color: '#C4B5FD',
                fontWeight: 600,
              }}
              title="批量生图（V2.0.1 新功能）"
            >
              <Layers size={10} /> 批量
            </button>
          </div>
          {presetsOpen && (
            <div className="grid grid-cols-4 gap-2">
              {IMAGE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePresetChange(p.id)}
                  className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl transition-all"
                  style={{
                    background: selectedPresetId === p.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                    border: selectedPresetId === p.id ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <span style={{ fontSize: 22 }}>{p.emoji}</span>
                  <span style={{ color: selectedPresetId === p.id ? '#93C5FD' : '#E5E7EB', fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{p.label}</span>
                  <span style={{ color: '#9CA3AF', fontSize: 9 }}>{p.ratio}</span>
                </button>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Step 1: 选材 + 输入 + 智能提示 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: '#3B82F6' }}>Step 1</span> · 选材与描述
          </p>

          {/* 1a. 灵感库 */}
          <div className="mb-3">
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>
              📚 灵感库（{selectedInspirations.size} / {(Array.isArray(inspirations) ? inspirations.length : 0)}）
            </p>
            <div
              className="space-y-1.5 overflow-y-auto custom-scrollbar"
              style={{ maxHeight: 140 }}
            >
              {!inspirations || (Array.isArray(inspirations) && inspirations.length === 0) ? (
                <p style={{ color: '#6B7280', fontSize: 11, textAlign: 'center', padding: 8 }}>暂无灵感</p>
              ) : (
                (Array.isArray(inspirations) ? inspirations : []).slice(0, 12).map((item: any) => {
                  const isSelected = selectedInspirations.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all"
                      onClick={() => toggleInspiration(item.id)}
                      style={{
                        background: isSelected ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.05)',
                        border: isSelected ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 text-white"
                        style={{
                          background: isSelected ? '#3B82F6' : 'transparent',
                          border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.3)',
                          fontSize: 9,
                        }}
                      >
                        {isSelected ? '✓' : ''}
                      </div>
                      <span style={{ fontSize: 14 }}>{typeEmojis[item.type || 'text']}</span>
                      <span style={{ color: '#E5E7EB', fontSize: 11 }} className="truncate flex-1">
                        {item.title || item.ai_summary || item.original_text?.substring(0, 30) || '未命名'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 1b. 用户输入框 */}
          <div className="mb-3">
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>
              ✏️ 自由描述（{findImagePreset(selectedPresetId)?.label}）
            </p>
            <textarea
              ref={userInputRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={
                selectedPresetId === 'xiaohongshu' ? '例：氛围感咖啡店，明亮落地窗，ins 风桌面...' :
                selectedPresetId === 'wechat' ? '例：城市天际线剪影，简约商务风...' :
                '描述你想生成的画面...'
              }
              className="w-full p-2.5 rounded-lg text-sm resize-none custom-scrollbar"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#E5E7EB',
                minHeight: 60,
                maxHeight: 160,
              }}
            />
          </div>

          {/* 1c. 智能提示按钮（真的智能） */}
          <button
            onClick={handleSmartPrompt}
            disabled={isRefining}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.2))',
              border: '1px solid rgba(139,92,246,0.4)',
              color: '#C4B5FD',
            }}
          >
            {isRefining ? (
              <><div className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" /> 分析中...</>
            ) : (
              <><Wand2 size={14} /> 智能提示：分析素材+输入+预设，生成精准 prompt</>
            )}
          </button>

          {refinedPrompt && (
            <div
              className="mt-3 p-3 rounded-lg"
              style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)' }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <p style={{ color: '#A78BFA', fontSize: 11, fontWeight: 600 }}>✨ AI 优化后的 prompt</p>
                <button onClick={() => setRefinedPrompt('')} className="text-gray-500"><X size={12} /></button>
              </div>
              <p style={{ color: '#E5E7EB', fontSize: 12, lineHeight: 1.6 }}>{refinedPrompt}</p>
            </div>
          )}
        </GlassCard>

        {/* Step 2: 参数设置 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: '#8B5CF6' }}>Step 2</span> · 参数设置
          </p>

          {/* 风格 + 比例 一行 */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Palette size={12} color="#9CA3AF" />
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>风格</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {STYLE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedStyle(s)}
                    className="px-2 py-1 rounded-md text-[11px] transition-all"
                    style={{
                      background: selectedStyle === s ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                      border: selectedStyle === s ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                      color: selectedStyle === s ? '#C4B5FD' : '#9CA3AF',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Ratio size={12} color="#9CA3AF" />
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>比例</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {RATIO_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRatio(r)}
                    className="px-2.5 py-1 rounded-md text-[11px] transition-all"
                    style={{
                      background: selectedRatio === r ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                      border: selectedRatio === r ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                      color: selectedRatio === r ? '#93C5FD' : '#9CA3AF',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Step 3: 色调参考（有用，强化保留） */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: '#22C55E' }}>Step 3</span> · 色调参考
            <span style={{ color: '#6B7280', fontSize: 11, fontWeight: 400, marginLeft: 4 }}>（有用，对精准度有帮助）</span>
            {selectedPaletteId && (
              <button
                onClick={() => setSelectedPaletteId(null)}
                className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF' }}
              >清除</button>
            )}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {IMAGE_PALETTES.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPaletteId(selectedPaletteId === p.id ? null : p.id)}
                className="flex flex-col items-center gap-1.5 transition-all"
                style={{ opacity: selectedPaletteId && selectedPaletteId !== p.id ? 0.4 : 1 }}
              >
                <div
                  className="flex rounded-lg overflow-hidden h-8 w-full"
                  style={{
                    outline: selectedPaletteId === p.id ? '2px solid #60A5FA' : 'none',
                    outlineOffset: 2,
                  }}
                >
                  {p.colors.map((c) => (
                    <div key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </div>
                <span style={{ color: selectedPaletteId === p.id ? '#93C5FD' : '#9CA3AF', fontSize: 10, textAlign: 'center' }}>
                  {selectedPaletteId === p.id && <Check size={9} className="inline mr-0.5" />}
                  {p.emoji} {p.name}
                </span>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Step 4: 高级设置（折叠） */}
        <GlassCard>
          <div data-step-advanced>
          <button
            className="flex items-center justify-between w-full"
            onClick={() => setAdvancedOpen(!advancedOpen)}
          >
            <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>
              <span style={{ color: '#F59E0B' }}>Step 4</span> · 高级设置
            </span>
            {advancedOpen ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
          </button>
          {advancedOpen && (
            <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5" style={{ color: '#E5E7EB', fontSize: 13 }}>
                    <Layers size={13} color="#F59E0B" /> 4 张变体
                  </span>
                  <span style={{ color: '#9CA3AF', fontSize: 11 }}>多角度生成</span>
                </div>
                <button
                  onClick={() => setBatchMode(!batchMode)}
                  className="w-10 h-6 rounded-full transition-all relative"
                  style={{ background: batchMode ? '#F59E0B' : 'rgba(255,255,255,0.2)' }}
                >
                  <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: batchMode ? 'calc(100% - 22px)' : 2 }} />
                </button>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <p style={{ color: '#9CA3AF', fontSize: 11 }}>
                    🎲 种子（可选,固定种子可复现同一张图）
                  </p>
                  <button
                    onClick={() => setSeedHelpOpen(!seedHelpOpen)}
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      background: seedHelpOpen ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)',
                      border: seedHelpOpen ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.15)',
                      color: seedHelpOpen ? '#FCD34D' : '#9CA3AF',
                      fontSize: 9,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                    title="什么是种子?"
                  >?</button>
                </div>
                {seedHelpOpen && (
                  <div
                    className="mb-2.5 p-2.5 rounded-lg text-[11px] leading-relaxed"
                    style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
                  >
                    <p style={{ color: '#FCD34D', fontWeight: 600, marginBottom: 4 }}>💡 种子是什么?</p>
                    <p style={{ color: '#D1D5DB', marginBottom: 4 }}>种子是 AI 想象的「起点」——一个 0~21 亿之间的整数。相同的 prompt + 相同的种子,会得到几乎相同的图。</p>
                    <p style={{ color: '#D1D5DB', marginBottom: 4 }}><strong style={{ color: '#E5E7EB' }}>什么时候用:</strong>调 prompt 时想看细微差异 / 看到喜欢的图想「再来一张类似的」/ 批量对比不同参数。</p>
                    <p style={{ color: '#9CA3AF' }}>留空 = 每次随机(用 🎲 按钮可生成一个);值多大没关系,只要前后一致即可。</p>
                  </div>
                )}
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : '')}
                    placeholder="留空 = 随机"
                    className="flex-1 px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                    style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <button
                    onClick={() => setSeed(Math.floor(Math.random() * 2147483647))}
                    className="px-3 py-2 rounded-lg text-xs flex items-center gap-1"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF' }}
                    title="生成一个随机种子"
                  >
                    🎲
                  </button>
                  {seed !== '' && (
                    <button
                      onClick={() => setSeed('')}
                      className="px-2 py-2 rounded-lg text-xs"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF' }}
                      title="清除"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>负面提示（不想要的内容）</p>
                <input
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="例：模糊、低质量、变形..."
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                  style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
            </div>
          )}
          </div>
        </GlassCard>

        {/* 生成按钮 */}
        <PrimaryButton fullWidth size="lg" onClick={handleGenerate} disabled={isLoading}>
          <Zap size={18} /> {isLoading ? '生成中...' : batchMode ? `生成 4 张变体` : '立即生成'}
        </PrimaryButton>

        {/* 结果区 */}
        {(isLoading || isGenerated || error) && (
          <GlassCard>
            {isLoading ? (
              <div className="flex flex-col items-center py-10 gap-4">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                  <div className="absolute inset-2 rounded-full border-2 border-purple-400 border-b-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
                </div>
                <p style={{ color: '#9CA3AF', fontSize: 14 }}>AI 正在创作中...</p>
                <p style={{ color: '#9CA3AF', fontSize: 12 }}>预计 10-20 秒</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center py-10 gap-4">
                <AlertCircle size={40} color="#EF4444" />
                <p style={{ color: '#FCA5A5', fontSize: 14 }}>{error}</p>
                <PrimaryButton size="sm" onClick={handleGenerate}>
                  <RefreshCw size={14} /> 重试
                </PrimaryButton>
              </div>
            ) : (
              <>
                <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 12 }}>
                  生成结果{batchImages.length > 1 ? ` (${batchImages.length} 张变体)` : ''}
                </p>

                {/* 种子条 — 显示本次生成用了哪个种子（让用户能复用） */}
                {lastUsedSeed !== null && (
                  <div
                    className="mb-3 flex items-center gap-1.5 px-2.5 py-2 rounded-lg"
                    style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
                  >
                    <span style={{ fontSize: 13 }}>🎲</span>
                    <span style={{ color: '#FCD34D', fontSize: 11, fontWeight: 600 }}>种子</span>
                    <code
                      style={{
                        color: '#E5E7EB',
                        fontSize: 11,
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        background: 'rgba(0,0,0,0.3)',
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      {lastUsedSeed}
                    </code>
                    {batchImages.length > 1 && (
                      <span style={{ color: '#9CA3AF', fontSize: 10 }}>(4 张共用)</span>
                    )}
                    <div className="flex gap-1 ml-auto">
                      <button
                        onClick={handleCopySeed}
                        className="px-2 py-1 rounded-md text-[10px] flex items-center gap-0.5 transition-all active:scale-95"
                        style={{ background: 'rgba(255,255,255,0.08)', color: '#E5E7EB' }}
                        title="复制种子数值"
                      >
                        <Copy size={10} /> 复制
                      </button>
                      <button
                        onClick={handleReuseSeed}
                        className="px-2 py-1 rounded-md text-[10px] flex items-center gap-0.5 transition-all active:scale-95"
                        style={{ background: 'rgba(245,158,11,0.25)', color: '#FCD34D' }}
                        title="把这个种子填回 Step 4,调整 prompt 后重生成"
                      >
                        <RotateCcw size={10} /> 复用此种子
                      </button>
                    </div>
                  </div>
                )}

                {batchImages.length > 1 ? (
                  <>
                    <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 8 }}>
                      💡 点击图片选中,下方按钮作用于<strong style={{ color: '#93C5FD' }}>选中那一张</strong>
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {batchImages.map((url, i) => {
                        const isSelected = i === selectedIndex;
                        return (
                          <div
                            key={i}
                            className="relative w-full rounded-xl overflow-hidden cursor-pointer transition-all"
                            style={{
                              background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                              border: isSelected ? '2px solid #3B82F6' : '1px solid rgba(59,130,246,0.3)',
                              aspectRatio: selectedRatio.replace(':', '/'),
                              boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.3)' : 'none',
                            }}
                            onClick={() => setSelectedIndex(i)}
                            onDoubleClick={() => setLightboxUrl(url)}
                          >
                            <img src={url} alt={`变体 ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                            {/* 编号 */}
                            <div
                              className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold"
                              style={{
                                background: isSelected ? '#3B82F6' : 'rgba(0,0,0,0.6)',
                                color: '#fff',
                              }}
                            >
                              {i + 1}
                            </div>
                            {/* 选中标记 */}
                            {isSelected && (
                              <div
                                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ background: '#3B82F6' }}
                              >
                                <Check size={12} color="#fff" strokeWidth={3} />
                              </div>
                            )}
                            {/* 悬浮操作（仅在选中时显示） */}
                            {isSelected && (
                              <div
                                className="absolute bottom-1.5 right-1.5 flex gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => setLightboxUrl(url)}
                                  className="w-7 h-7 rounded-full flex items-center justify-center"
                                  style={{ background: 'rgba(0,0,0,0.7)' }}
                                  title="放大查看"
                                >
                                  <ImageIcon size={12} color="#fff" />
                                </button>
                                <button
                                  onClick={() => handleDownload(url)}
                                  className="w-7 h-7 rounded-full flex items-center justify-center"
                                  style={{ background: 'rgba(0,0,0,0.7)' }}
                                  title="下载"
                                >
                                  <Download size={12} color="#fff" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div
                    className="w-full rounded-2xl mb-4 overflow-hidden flex items-center justify-center cursor-pointer"
                    style={{
                      background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                      border: '1px solid rgba(59,130,246,0.3)',
                      aspectRatio: selectedRatio.replace(':', '/'),
                      maxHeight: 360,
                    }}
                    onClick={() => imageUrl && setLightboxUrl(imageUrl)}
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt={finalPrompt} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <ImageIcon size={48} color="#9CA3AF" />
                        <p style={{ color: '#9CA3AF', fontSize: 13 }}>图片加载中...</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 操作按钮（5 个）— batch 模式下作用于选中那张 */}
                {(() => {
                  const targetUrl = batchImages.length > 0
                    ? batchImages[selectedIndex] || imageUrl
                    : imageUrl;
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      <ActionBtn
                        icon={<RefreshCw size={14} />}
                        label="重新生成"
                        onClick={handleGenerate}
                      />
                      <ActionBtn
                        icon={<Download size={14} />}
                        label="下载"
                        onClick={() => targetUrl && handleDownload(targetUrl)}
                        disabled={!targetUrl}
                      />
                      <ActionBtn
                        icon={<Save size={14} />}
                        label="存选中"
                        onClick={() => {
                          if (!targetUrl) return;
                          fetch('/api/inspiration', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              type: 'image',
                              title: finalPrompt?.substring(0, 50) || 'AI 生成图片',
                              original_text: finalPrompt,
                              media_urls: [targetUrl],
                              tags: [selectedStyle, 'AI生成', findImagePreset(selectedPresetId)?.label || ''],
                            }),
                          }).then(res => res.json()).then(data => {
                            if (data.success) setToast({ message: '已保存到灵感库', type: 'success' });
                            else setToast({ message: '保存失败: ' + (data.error || '未知错误'), type: 'error' });
                          }).catch(() => setToast({ message: '保存失败', type: 'error' }));
                        }}
                        disabled={!targetUrl}
                      />
                      <ActionBtn
                        icon={<VideoIcon size={14} />}
                        label="AI 图生视频"
                        onClick={() => targetUrl && handleImportToVideo(targetUrl)}
                        highlight
                        disabled={!targetUrl}
                      />
                      {batchImages.length > 1 ? (
                        <ActionBtn
                          icon={<CheckCircle2 size={14} />}
                          label={`全部存 (${batchImages.length})`}
                          onClick={async () => {
                            try {
                              const results = await Promise.all(
                                batchImages.map((url) =>
                                  fetch('/api/inspiration', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      type: 'image',
                                      title: (finalPrompt?.substring(0, 40) || 'AI') + ` (${batchImages.indexOf(url) + 1})`,
                                      original_text: finalPrompt,
                                      media_urls: [url],
                                      tags: [selectedStyle, 'AI生成', findImagePreset(selectedPresetId)?.label || ''],
                                    }),
                                  }).then(r => r.json())
                                )
                              );
                              const ok = results.filter(r => r.success).length;
                              setToast({ message: `已保存 ${ok}/${batchImages.length} 张到灵感库`, type: ok > 0 ? 'success' : 'error' });
                            } catch {
                              setToast({ message: '保存失败', type: 'error' });
                            }
                          }}
                        />
                      ) : (
                        <ActionBtn
                          icon={<FileText size={14} />}
                          label="复制 prompt"
                          onClick={handleCopyPrompt}
                        />
                      )}
                      <ActionBtn
                        icon={<FileText size={14} />}
                        label="复制 prompt"
                        onClick={handleCopyPrompt}
                      />
                    </div>
                  );
                })()}
              </>
            )}
          </GlassCard>
        )}

        {/* 历史 */}
        {historyWorks.length > 0 && !isLoading && (
          <div>
            <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>历史生成</p>
            <div className="space-y-3">
              {historyWorks.slice(0, 6).map((item) => (
                <GlassCard key={item.id} hover className="!p-3">
                  <div className="flex items-center gap-3">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        loading="lazy"
                        className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl flex items-center justify-center text-4xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        🖼️
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 500, marginBottom: 4 }} className="truncate">{item.title}</p>
                      <span style={{ color: '#6B7280', fontSize: 11 }}>{item.time}</span>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.1)' }}
            onClick={() => setLightboxUrl(null)}
          >
            <X size={20} color="#fff" />
          </button>
          <img src={lightboxUrl} className="max-w-[90vw] max-h-[90vh] object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function ActionBtn({ icon, label, onClick, highlight, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; highlight?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs transition-all active:scale-95 disabled:opacity-40"
      style={{
        background: highlight ? 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.2))' : 'rgba(255,255,255,0.07)',
        border: highlight ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.12)',
        color: highlight ? '#C4B5FD' : '#E5E7EB',
      }}
    >
      <span style={{ color: highlight ? '#A78BFA' : '#3B82F6' }}>{icon}</span>
      {label}
    </button>
  );
}

export default function AIImagePage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p style={{ color: '#9CA3AF' }}>加载中...</p></div>}>
        <AIImageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
