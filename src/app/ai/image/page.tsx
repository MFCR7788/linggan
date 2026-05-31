'use client';


import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, ChevronDown, ChevronUp, Download, Save, RefreshCw, Palette, Ratio, AlertCircle, ImageIcon, Check, Sparkles, Layers, Wand2, Scissors, ArrowRight } from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProtectedRoute } from '@/components';
import { Toast } from '@/components/Toast';
import { useInspirations } from '@/hooks/use-inspiration';
import { syncDevAuthCookie } from '@/lib/dev-auth';

const presets = [
  { id: 'xiaohongshu', label: '小红书封面图', sub: '1:1 · 明亮风格', emoji: '📱', ratio: '1:1' },
  { id: 'wechat', label: '公众号头图', sub: '16:9 · 简约风格', emoji: '📰', ratio: '16:9' },
  { id: 'douyin', label: '短视频封面', sub: '9:16 · 吸睛风格', emoji: '🎬', ratio: '9:16' },
];

const styleOptions = ['写实摄影', '插画风格', '赛博朋克', '极简主义', '水彩手绘', '3D渲染', '复古胶片', '国潮风格'];
const ratioOptions = ['1:1', '16:9', '9:16', '4:3', '3:4'];

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

const colorPalettes = [
  { name: '霓虹蓝', colors: ['#3B82F6', '#8B5CF6', '#0EA5E9'] },
  { name: '珊瑚粉', colors: ['#F43F5E', '#FB923C', '#FBBF24'] },
  { name: '森系绿', colors: ['#22C55E', '#10B981', '#84CC16'] },
  { name: '暗夜黑', colors: ['#1F2937', '#374151', '#4B5563'] },
];

const typeEmojis: Record<string, string> = {
  text: "📝", link: "🔗", image: "🖼️", video: "🎬", voice: "🎵", schedule: "📅",
};

function AIImageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [presetsOpen, setPresetsOpen] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState('xiaohongshu');
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('写实摄影');
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [isGenerated, setIsGenerated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [mode, setMode] = useState<'generate' | 'enhance'>('generate');
  const [batchMode, setBatchMode] = useState(false);
  const [batchImages, setBatchImages] = useState<string[]>([]);

  // 增强模式
  const [enhanceType, setEnhanceType] = useState<'upscale' | 'bg_replace' | 'style_transfer'>('upscale');
  const [newBackground, setNewBackground] = useState('');
  const [styleTransferPreset, setStyleTransferPreset] = useState('watercolor');
  const [beforeImage, setBeforeImage] = useState<string | null>(null);
  const [afterImage, setAfterImage] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceLabel, setEnhanceLabel] = useState('');

  // Step1: 灵感选材
  const [selectedInspirations, setSelectedInspirations] = useState<Set<string>>(new Set());
  const { data: inspirations } = useInspirations({ limit: 30 });

  // 从 URL 参数自动选中灵感
  useEffect(() => {
    const ids = searchParams.get('inspirationId')?.split(',') || [];
    if (ids.length > 0) {
      setSelectedInspirations(new Set(ids.filter(Boolean)));
    }
  }, [searchParams]);

  const toggleInspiration = (id: string) => {
    setSelectedInspirations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const { data: selectedInspData } = useInspirations(
    selectedInspirations.size > 0 ? { limit: 30 } : { limit: 1 }
  );

  // Step3: 色调参考（可选）
  const [selectedPalette, setSelectedPalette] = useState<string | null>(null);

  // 历史生成
  const [historyWorks, setHistoryWorks] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

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

  const handleNavigate = (page: PageKey) => {
    switch (page) {
      case 'home':
        router.push('/home');
        break;
      case 'inspiration':
        router.push('/inspiration');
        break;
      case 'ai':
        router.push('/ai');
        break;
      case 'hotspot':
        router.push('/hotspot');
        break;
      case 'profile':
        router.push('/profile');
        break;
      case 'login':
        router.push('/login');
        break;
      case 'inspiration-detail':
        router.push('/inspiration/detail');
        break;
      case 'ai-copywriting':
        router.push('/ai/copywriting');
        break;
      case 'ai-image':
        router.push('/ai/image');
        break;
      case 'ai-video':
        router.push('/ai/video');
        break;
      case 'hotspot-detail':
        router.push('/hotspot/detail');
        break;
      case 'hotspot-library':
        router.push('/hotspot/library');
        break;
      case 'notification':
        router.push('/notification');
        break;
      default:
        router.push('/home');
        break;
    }
  };

  const handleBack = () => {
    router.push('/ai');
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setError(null);
    setImageUrl(null);
    setIsGenerated(false);

    // 收集灵感素材文本
    const inspItems = selectedInspData
      ? (Array.isArray(selectedInspData) ? selectedInspData : []).filter((item: any) =>
          selectedInspirations.has(item.id)
        )
      : [];
    const inspContext = inspItems
      .map((item: any) => [
        item.title ? `【标题】${item.title}` : '',
        item.ai_summary ? `【AI摘要】${item.ai_summary}` : '',
        item.original_text ? `【原文】${item.original_text}` : '',
      ].filter(Boolean).join('\n'))
      .join('\n\n---\n\n');

    // 构造完整 prompt
    let fullPrompt = prompt;
    if (inspContext) {
      fullPrompt = `参考以下素材创作图片：\n\n${inspContext}\n\n---\n\n图片描述：${prompt}`;
    }
    if (selectedPalette) {
      fullPrompt += `\n色调参考：${selectedPalette}`;
    }
    fullPrompt = `[${selectedStyle}] [比例${selectedRatio}] ${fullPrompt}`;

    try {
      const n = batchMode ? 4 : 1;
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          ratio: selectedRatio,
          n,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.data)) {
          setBatchImages(data.data.map((r: any) => r.imageUrl));
          setImageUrl(data.data[0]?.imageUrl || null);
        } else {
          setImageUrl(data.data.imageUrl || data.data.url);
          setBatchImages([]);
        }
        setIsGenerated(true);
      } else {
        setError(data.error || '生成失败');
      }
    } catch (e) {
      setError('网络请求失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePresetSelect = (id: string) => {
    setSelectedPreset(id);
    const preset = presets.find((p) => p.id === id);
    if (preset) setSelectedRatio(preset.ratio);
  };

  const handleEnhance = async () => {
    const imgUrl = imageUrl || (selectedInspData
      ? (Array.isArray(selectedInspData) ? selectedInspData : [])
          .filter((item: any) => selectedInspirations.has(item.id))
          .flatMap((item: any) => item.media_urls || [])[0]
      : undefined);
    if (!imgUrl) {
      setToast({ message: '请先生成图片或选择含图片的素材', type: 'error' });
      return;
    }
    setBeforeImage(imgUrl);
    setAfterImage(null);
    setIsEnhancing(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/image/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: imgUrl,
          mode: enhanceType,
          options: {
            ratio: selectedRatio,
            newBackground: enhanceType === 'bg_replace' ? newBackground : undefined,
            style: enhanceType === 'style_transfer' ? styleTransferPreset : undefined,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAfterImage(data.data.resultImageUrl);
        setEnhanceLabel(data.data.enhanceLabel || '增强完成');
        setImageUrl(data.data.resultImageUrl);
      } else {
        setError(data.error || '增强失败');
      }
    } catch {
      setError('网络请求失败，请重试');
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-20 overflow-x-hidden">
      <TopNav title="AI 图片生成" showBack onBack={handleBack} />

      <div className="flex-1 px-4 pt-4 space-y-4 min-w-0">
        {/* Mode Toggle */}
        <div className="flex rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {([
            { key: 'generate', label: '图片生成', icon: <Sparkles size={14} /> },
            { key: 'enhance', label: '图片增强', icon: <Wand2 size={14} /> },
          ] as const).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => { setMode(key); setError(null); setBeforeImage(null); setAfterImage(null); }}
              className="flex-1 py-2.5 text-xs flex items-center justify-center gap-1.5 transition-all"
              style={{
                background: mode === key ? 'rgba(59,130,246,0.2)' : 'transparent',
                color: mode === key ? '#93C5FD' : '#9CA3AF',
                fontWeight: mode === key ? 600 : 400,
              }}
            >
              <span style={{ color: mode === key ? '#3B82F6' : '#9CA3AF' }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Quick Presets */}
        <GlassCard className="!p-3">
          <button
            className="flex items-center justify-between w-full mb-3"
            onClick={() => setPresetsOpen(!presetsOpen)}
          >
            <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>快捷预设</span>
            {presetsOpen ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
          </button>
          {presetsOpen && (
            <div className="grid grid-cols-3 gap-2">
              {presets.map(({ id, label, sub, emoji }) => (
                <button
                  key={id}
                  onClick={() => handlePresetSelect(id)}
                  className="flex flex-col items-center gap-2 py-3 px-1 rounded-xl transition-all"
                  style={{
                    background: selectedPreset === id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                    border: selectedPreset === id ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <span style={{ fontSize: 24 }}>{emoji}</span>
                  <span style={{ color: selectedPreset === id ? '#93C5FD' : '#E5E7EB', fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
                  <span style={{ color: '#9CA3AF', fontSize: 10 }}>{sub}</span>
                </button>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Step 1: 灵感选材 */}
        <GlassCard>
          <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: "#3B82F6" }}>Step 1</span> · 从灵感库选材
            {selectedInspirations.size > 0 && (
              <span style={{ color: '#60A5FA', fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
                已选 {selectedInspirations.size} 条
              </span>
            )}
          </p>
          {!inspirations || (Array.isArray(inspirations) && inspirations.length === 0) ? (
            <p style={{ color: '#6B7280', fontSize: 12 }}>暂无灵感，先去灵感库添加内容吧</p>
          ) : (
            <div className="space-y-2">
              {(Array.isArray(inspirations) ? inspirations : []).slice(0, 15).map((item: any) => {
                const isSelected = selectedInspirations.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                    onClick={() => toggleInspiration(item.id)}
                    style={{
                      background: isSelected ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.05)',
                      border: isSelected ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{
                        background: isSelected ? '#3B82F6' : 'transparent',
                        border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.3)',
                        fontSize: 10, color: '#fff',
                      }}
                    >
                      {isSelected ? '✓' : ''}
                    </div>
                    <span style={{ fontSize: 18 }}>{typeEmojis[item.type || 'text']}</span>
                    <span style={{ color: '#E5E7EB', fontSize: 13 }} className="truncate">
                      {item.title || item.ai_summary || item.original_text?.substring(0, 30) || '未命名灵感'}
                    </span>
                    {item.ai_summary && (
                      <span style={{ color: '#6B7280', fontSize: 11 }} className="truncate">
                        {item.ai_summary.substring(0, 30)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* Step 2: 图片描述 */}
        {mode === 'generate' && (
        <GlassCard>
          <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: "#8B5CF6" }}>Step 2</span> · 描述您想要的图片
          </p>
          <div
            className="relative rounded-xl overflow-hidden mb-3"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：霓虹灯下的赛博朋克城市街道，雨夜，高饱和度..."
              rows={3}
              className="w-full bg-transparent p-3 resize-none outline-none"
              style={{ color: '#FFFFFF', fontSize: 13, lineHeight: 1.6 }}
            />
            <button
              onClick={() => {
                const tips = [
                  '霓虹灯下的赛博朋克城市街道，雨夜，高饱和度，霓虹灯倒映在湿漉漉的地面上',
                  '极简北欧风客厅，米白色沙发，绿植点缀，阳光从落地窗洒入，温暖治愈',
                  '手绘水彩风格的花园，玫瑰盛开，蝴蝶飞舞，柔和的粉色和紫色调',
                  '3D渲染的未来主义建筑，流线型外观，玻璃幕墙反射蓝天白云',
                  '复古胶片质感的街拍，暖色调，电影感构图，氛围光影',
                ];
                const current = tips.findIndex(t => t === prompt);
                setPrompt(tips[(current + 1) % tips.length]);
              }}
              className="absolute bottom-2 right-2 px-2 py-1 rounded-lg text-xs flex items-center gap-1"
              style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.3)' }}
            >
              <Zap size={11} /> 智能提示
            </button>
          </div>

          {/* Style + Ratio in one row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Palette size={14} color="#9CA3AF" />
                <span style={{ color: '#9CA3AF', fontSize: 12 }}>风格</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {styleOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedStyle(s)}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs transition-all"
                    style={{
                      background: selectedStyle === s ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.06)',
                      border: selectedStyle === s ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.12)',
                      color: selectedStyle === s ? '#C4B5FD' : '#9CA3AF',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Ratio size={14} color="#9CA3AF" />
                <span style={{ color: '#9CA3AF', fontSize: 12 }}>比例</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {ratioOptions.map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRatio(r)}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs transition-all"
                    style={{
                      background: selectedRatio === r ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                      border: selectedRatio === r ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.12)',
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
        )}

        {/* Step 3: 色调参考（可选） */}
        {mode === 'generate' && (
        <GlassCard>
          <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: "#22C55E" }}>Step 3</span> · 色调参考
            <span style={{ color: '#6B7280', fontSize: 11, fontWeight: 400, marginLeft: 4 }}>（可选）</span>
            {selectedPalette && (
              <button
                onClick={() => setSelectedPalette(null)}
                className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF' }}
              >清除</button>
            )}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {colorPalettes.map(({ name, colors }) => (
              <button
                key={name}
                onClick={() => setSelectedPalette(selectedPalette === name ? null : name)}
                className="flex flex-col items-center gap-1.5 transition-all"
                style={{
                  opacity: selectedPalette && selectedPalette !== name ? 0.4 : 1,
                }}
              >
                <div
                  className="flex rounded-lg overflow-hidden h-8 w-full"
                  style={{
                    outline: selectedPalette === name ? '2px solid #60A5FA' : 'none',
                    outlineOffset: 2,
                  }}
                >
                  {colors.map((c) => (
                    <div key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </div>
                <span style={{ color: selectedPalette === name ? '#93C5FD' : '#9CA3AF', fontSize: 10 }}>
                  {selectedPalette === name && <Check size={10} className="inline mr-0.5" />}
                  {name}
                </span>
              </button>
            ))}
          </div>
        </GlassCard>
        )}

        {/* Enhance Mode */}
        {mode === 'enhance' && (
          <>
            <GlassCard>
              <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                <span style={{ color: '#8B5CF6' }}>Step 2</span> · 选择增强类型
              </p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {([
                  { key: 'upscale' as const, label: '超分辨率', icon: '🔍', desc: '提升清晰度' },
                  { key: 'bg_replace' as const, label: '背景替换', icon: '🖼️', desc: '更换背景' },
                  { key: 'style_transfer' as const, label: '风格迁移', icon: '🎨', desc: '艺术风格' },
                ]).map(({ key, label, icon, desc }) => (
                  <button
                    key={key}
                    onClick={() => { setEnhanceType(key); setError(null); }}
                    className="flex flex-col items-center gap-1 py-3 rounded-xl transition-all"
                    style={{
                      background: enhanceType === key ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
                      border: enhanceType === key ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{icon}</span>
                    <span style={{ color: enhanceType === key ? '#C4B5FD' : '#E5E7EB', fontSize: 12, fontWeight: 600 }}>{label}</span>
                    <span style={{ color: '#9CA3AF', fontSize: 10 }}>{desc}</span>
                  </button>
                ))}
              </div>

              {enhanceType === 'bg_replace' && (
                <div>
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 6 }}>新背景描述</p>
                  <input
                    value={newBackground}
                    onChange={(e) => setNewBackground(e.target.value)}
                    placeholder="例：海边日落、现代办公室、星空..."
                    className="w-full px-3 py-2 rounded-xl bg-transparent text-sm outline-none"
                    style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                </div>
              )}

              {enhanceType === 'style_transfer' && (
                <div>
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 6 }}>目标风格</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'watercolor', label: '水彩手绘' },
                      { key: 'illustration', label: '插画风格' },
                      { key: 'cyberpunk', label: '赛博朋克' },
                      { key: '3d_render', label: '3D渲染' },
                      { key: 'sketch', label: '素描风格' },
                      { key: 'vintage', label: '复古胶片' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setStyleTransferPreset(key)}
                        className="px-2 py-1.5 rounded-lg text-xs transition-all"
                        style={{
                          background: styleTransferPreset === key ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                          border: styleTransferPreset === key ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.12)',
                          color: styleTransferPreset === key ? '#C4B5FD' : '#9CA3AF',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>

            {/* Before/After Comparison */}
            {(beforeImage || afterImage) && (
              <GlassCard>
                <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                  <span style={{ color: '#8B5CF6' }}>对比</span> · Before / After
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p style={{ color: '#9CA3AF', fontSize: 10, marginBottom: 4 }}>原图</p>
                    <div className="w-full rounded-xl overflow-hidden" style={{ aspectRatio: '1/1', background: 'rgba(255,255,255,0.05)' }}>
                      {beforeImage ? (
                        <img src={beforeImage} alt="Before" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={24} color="#6B7280" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <p style={{ color: '#9CA3AF', fontSize: 10, marginBottom: 4 }}>
                      {enhanceLabel || '增强后'}
                    </p>
                    <div className="w-full rounded-xl overflow-hidden" style={{ aspectRatio: '1/1', background: 'rgba(255,255,255,0.05)', border: afterImage ? '2px solid rgba(34,197,94,0.4)' : 'none' }}>
                      {afterImage ? (
                        <img src={afterImage} alt="After" className="w-full h-full object-cover" />
                      ) : isEnhancing ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ArrowRight size={24} color="#6B7280" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {afterImage && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => { if (afterImage) window.open(afterImage, '_blank'); }}
                      className="py-2 rounded-lg text-xs flex items-center justify-center gap-1"
                      style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93C5FD' }}
                    >
                      <Download size={12} /> 下载
                    </button>
                    <button
                      onClick={() => {
                        if (!afterImage) return;
                        fetch('/api/inspiration', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            type: 'image',
                            title: `增强图片 · ${enhanceLabel}`,
                            media_urls: [afterImage],
                            tags: [enhanceLabel, 'AI增强'],
                          }),
                        }).then(res => res.json()).then(data => {
                          if (data.success) setToast({ message: '已保存到灵感库', type: 'success' });
                        }).catch(() => setToast({ message: '保存失败', type: 'error' }));
                      }}
                      className="py-2 rounded-lg text-xs flex items-center justify-center gap-1"
                      style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#C4B5FD' }}
                    >
                      <Save size={12} /> 保存
                    </button>
                  </div>
                )}
              </GlassCard>
            )}

            {/* Enhance Button */}
            <PrimaryButton fullWidth size="lg" onClick={handleEnhance} disabled={isEnhancing}>
              <Wand2 size={18} /> {isEnhancing ? '增强中...' : '开始增强'}
            </PrimaryButton>
          </>
        )}

        {/* History */}
        <div>
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>历史生成</p>
          {isLoadingHistory ? (
            <p style={{ color: '#6B7280', fontSize: 12 }}>加载中...</p>
          ) : historyWorks.length === 0 ? (
            <p style={{ color: '#6B7280', fontSize: 12 }}>暂无历史生成记录</p>
          ) : (
            <div className="space-y-3">
              {historyWorks.map((item) => (
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
                      <div
                        className="w-20 h-20 rounded-xl flex items-center justify-center text-4xl flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      >
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
          )}
        </div>

        {/* Generate Button */}
        {mode === 'generate' && (
        <div className="space-y-3">
          {/* Batch toggle */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Layers size={14} color="#F59E0B" />
              <span style={{ color: '#E5E7EB', fontSize: 13 }}>4 张变体</span>
              <span style={{ color: '#9CA3AF', fontSize: 11 }}>多角度生成</span>
            </div>
            <button
              onClick={() => setBatchMode(!batchMode)}
              className="w-10 h-6 rounded-full transition-all"
              style={{
                background: batchMode ? '#F59E0B' : 'rgba(255,255,255,0.2)',
                position: 'relative',
              }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                style={{ left: batchMode ? 'calc(100% - 22px)' : 2 }}
              />
            </button>
          </div>
          <PrimaryButton fullWidth size="lg" onClick={handleGenerate}>
            <Zap size={18} /> {isLoading ? '生成中...' : batchMode ? '生成 4 张变体' : '立即生成'}
          </PrimaryButton>
        </div>
        )}

        {/* Result */}
        {(isLoading || isGenerated || error) && (
          <GlassCard>
            {isLoading ? (
              <div className="flex flex-col items-center py-10 gap-4">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                  <div className="absolute inset-2 rounded-full border-2 border-purple-400 border-b-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
                </div>
                <p style={{ color: '#9CA3AF', fontSize: 14 }}>AI 正在创作中...</p>
                <p style={{ color: '#9CA3AF', fontSize: 12 }}>预计需要 10-20 秒</p>
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
                {/* Batch images 2x2 grid */}
                {batchImages.length > 1 ? (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {batchImages.map((url, i) => (
                      <div
                        key={i}
                        className="w-full rounded-xl overflow-hidden"
                        style={{
                          background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                          border: '1px solid rgba(59,130,246,0.3)',
                          aspectRatio: selectedRatio.replace(':', '/'),
                        }}
                      >
                        <img
                          src={url}
                          alt={`变体 ${i + 1}`}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Single Image Preview */
                  <div
                    className="w-full rounded-2xl mb-4 overflow-hidden flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                      border: '1px solid rgba(59,130,246,0.3)',
                      aspectRatio: selectedRatio.replace(':', '/'),
                      maxHeight: 320,
                    }}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={prompt}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        style={{ maxHeight: 320 }}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <ImageIcon size={48} color="#9CA3AF" />
                        <p style={{ color: '#9CA3AF', fontSize: 13 }}>图片加载中...</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { icon: <RefreshCw size={15} />, label: '重新生成', action: handleGenerate },
                    { icon: <Download size={15} />, label: '下载', action: () => { if (imageUrl) window.open(imageUrl, '_blank'); } },
                    { icon: <Save size={15} />, label: '存灵感', action: () => {
      if (!imageUrl) return;
      fetch('/api/inspiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          title: prompt?.substring(0, 50) || 'AI 生成图片',
          original_text: prompt,
          media_urls: [imageUrl],
          tags: [selectedStyle, 'AI生成'],
          summary: `AI 生成图片 · ${selectedStyle} · ${selectedRatio}`,
        }),
      }).then(res => res.json()).then(data => {
        if (data.success) setToast({ message: '已保存到灵感库', type: 'success' });
        else setToast({ message: '保存失败: ' + (data.error || '未知错误'), type: 'error' });
      }).catch(() => setToast({ message: '保存失败，请重试', type: 'error' }));
    } },
                    { icon: <Palette size={15} />, label: '更多变体', action: handleGenerate },
                  ].map(({ icon, label, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      className="flex flex-col items-center gap-1 py-2 rounded-xl text-xs"
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#E5E7EB' }}
                    >
                      <span style={{ color: '#3B82F6' }}>{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </GlassCard>
        )}
      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
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
