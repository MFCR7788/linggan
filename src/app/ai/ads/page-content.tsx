'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, Loader2, Download, Sparkles, AlertCircle, CheckCircle2, X, Plus, Trash2, Copy, FolderOpen, Upload, Link2 } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Toast } from '@/components/Toast';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { ProtectedRoute } from '@/components';
import { useContentHandoff } from '@/hooks/use-content-handoff';
import { useWorkflowSession } from '@/hooks/use-workflow-session';
import { WorkflowSessionBar } from '@/components/WorkflowSessionBar';
import { useAdsGrid, type GridCell } from '@/hooks/ai/use-ads-grid';
import { useWorkHistory } from '@/hooks/use-work-history';
import { useCreateInspiration, useInspirations } from '@/hooks/use-inspiration';

const DEMO_SELLING_POINTS = ['轻便折叠', '避震舒适', '时尚颜值'];

const SCENES = [
  { key: 'product', icon: '🛍️', label: '产品宣传', desc: '产品/服务营销素材' },
  { key: 'lifestyle', icon: '🌴', label: '生活记录', desc: '旅行/美食/日常/穿搭' },
  { key: 'festival', icon: '🎊', label: '节日纪念', desc: '节日/生日/毕业/纪念日' },
  { key: 'aesthetic', icon: '🎨', label: '摄影美学', desc: '风景/静物/国风/文艺' },
  { key: 'creative', icon: '🔲', label: '创意排版', desc: '拼接长图/对称/故事叙事' },
  { key: 'hobby', icon: '✨', label: '兴趣展示', desc: '书画/手工/读书/健身' },
] as const;

const FESTIVAL_MOODS = ['传统温馨', '现代简约', '浪漫粉色系', '喜庆红色系', '清新自然', '优雅高级', '复古怀旧', '梦幻童话'];
const AESTHETIC_TONES = ['柔和粉色系', '高级灰调', '暖黄复古', '日系胶片', '莫兰迪色系', '冷调蓝调', '黑白极简', '清新绿调'];
const HOBBY_STYLES = ['极简风', '日系', '手作感', '文艺清新', '科技感', '自然风', '复古质感', '暗调高级'];

const LAYOUT_OPTIONS = [
  { value: 'center', label: '中心主图 — C位放核心大图，四周填充细节' },
  { value: 'split', label: '拼接长图 — 一张完整长图切9等分' },
  { value: 'symmetric', label: '对称式 — 1/9、2/8、3/7、4/6 成对呼应' },
  { value: 'story', label: '故事叙事 — 按时间线从左上到右下' },
  { value: 'minimal', label: '纯色图文 — 低饱和背景穿插实拍+文字' },
];

function AdsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { receive } = useContentHandoff();
  const workflowSessionId = searchParams.get('workflow_session_id') || undefined;
  const { session, isInWorkflow, completeCurrentStep, pauseSession, resumeSession, abandonSession } = useWorkflowSession(workflowSessionId);

  // ─── 表单 state ──────────────────────────────
  const [scene, setScene] = useState<string>('product');
  const [product, setProduct] = useState('');
  const [sellingPoints, setSellingPoints] = useState<string[]>([...DEMO_SELLING_POINTS]);
  const [referenceImage, setReferenceImage] = useState<string>('');
  const [referenceSource, setReferenceSource] = useState<'inspiration' | 'url' | 'upload' | 'handoff' | null>(null);
  const [referenceTab, setReferenceTab] = useState<'inspiration' | 'url' | 'upload'>('inspiration');
  const [referenceInput, setReferenceInput] = useState('');
  const [extra, setExtra] = useState<string>(''); // mood / tone / layoutType
  const [uploadingRef, setUploadingRef] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: imageInspirations = [] } = useInspirations({ type: 'image', limit: 30 });

  // 接收 handoff（从生图页带过来）
  useEffect(() => {
    const params = receive(['prompt', 'imageUrl', 'topic', 'text']);
    if (params.prompt) {
      setProduct(params.prompt.substring(0, 30));
    }
    if (params.topic && !params.prompt) {
      setProduct(params.topic.substring(0, 30));
    }
    if (params.text) {
      setProduct(params.text.substring(0, 30));
    }
    if (params.imageUrl) {
      setReferenceImage(params.imageUrl);
      setReferenceSource('handoff');
    }
  }, []);

  // 工作流：从 session.accumulated_handoff 预填
  useEffect(() => {
    if (!session?.accumulated_handoff) return;
    const h = session.accumulated_handoff as Record<string, string>;
    if (h.topic) setProduct(h.topic.substring(0, 30));
    else if (h.text) setProduct(h.text.substring(0, 30));
    if (h.imageUrl) { setReferenceImage(h.imageUrl); setReferenceSource('handoff'); }
  }, [session]);

  // ─── 生成 state ──────────────────────────────
  const { generate: generateAds, generating: isGenerating, cells: adsCells, error: adsError } = useAdsGrid();
  const [cells, setCells] = useState<GridCell[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [progressText, setProgressText] = useState('');
  const [jszipLoaded, setJszipLoaded] = useState(false);

  // ─── 历史生成 ──────────────────────────────
  const { items: historyItems, isLoading: historyLoading } = useWorkHistory('图片');
  const createInspiration = useCreateInspiration();

  // 动态加载 JSZip（CDN）
  useEffect(() => {
    if ((window as any).JSZip) {
      setJszipLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js';
    script.async = true;
    script.onload = () => setJszipLoaded(true);
    script.onerror = () => console.error('JSZip 加载失败');
    document.body.appendChild(script);
  }, []);

  // ─── 卖点编辑 ──────────────────────────────
  const updateSellingPoint = (i: number, v: string) => {
    setSellingPoints((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  };

  const handleSceneChange = (newScene: string) => {
    setScene(newScene);
    setCells(null);
    setError(null);
    setExtra('');
    if (newScene === 'product') {
      setSellingPoints(['轻便折叠', '避震舒适', '时尚颜值']);
    } else {
      setSellingPoints(['', '', '']);
    }
  };

  // 上传本地图片作为参考图
  const handleUploadRefImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingRef(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.success && json.data?.url) {
        setReferenceImage(json.data.url);
        setReferenceSource('upload');
        setToast({ message: '参考图上传成功', type: 'success' });
      } else {
        setToast({ message: json.error || '上传失败', type: 'error' });
      }
    } catch {
      setToast({ message: '上传失败', type: 'error' });
    } finally {
      setUploadingRef(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addSellingPoint = () => {
    const max = scene === 'product' ? 5 : 8;
    if (sellingPoints.length >= max) {
      setToast({ message: `最多 ${max} 个`, type: 'error' });
      return;
    }
    setSellingPoints((prev) => [...prev, '']);
  };

  const removeSellingPoint = (i: number) => {
    const min = scene === 'product' ? 3 : 1;
    if (sellingPoints.length <= min) {
      setToast({ message: scene === 'product' ? '至少 3 个卖点' : '至少 1 个元素', type: 'error' });
      return;
    }
    setSellingPoints((prev) => prev.filter((_, idx) => idx !== i));
  };

  // ─── 生成 9 宫格 ──────────────────────────────
  const handleGenerate = async () => {
    if (!product.trim()) {
      setToast({ message: '请填写主题/产品名', type: 'error' });
      return;
    }
    const validPoints = sellingPoints.filter((p) => p.trim());
    const needsElements = scene === 'product' || scene === 'lifestyle';
    if (needsElements && validPoints.length < (scene === 'product' ? 3 : 1)) {
      setToast({ message: scene === 'product' ? '至少需要 3 个有效卖点' : '至少需要 1 个元素', type: 'error' });
      return;
    }

    setProgressText('AI 设计 9 个视觉角度...');

    try {
      const result = await generateAds({
        product: product.trim(),
        sellingPoints: validPoints,
        referenceImage: referenceImage || undefined,
        scene,
        extra: extra || undefined,
      });
      setCells(result.cells);
      setProgressText('');
      setToast({
        message: `已生成 ${result.successCount}/9 张封面`,
        type: result.successCount === 9 ? 'success' : 'error',
      });
      if (isInWorkflow && result.cells.length > 0) {
        const firstCell = result.cells[0];
        completeCurrentStep({ topic: product, text: product, imageUrl: firstCell.imageUrl || '' }, undefined);
      }
    } catch (e: any) {
      setError(e.message || '网络错误');
      setProgressText('');
    }
  };

  // ─── 下载 ZIP ──────────────────────────────
  const handleDownloadZip = async () => {
    if (!cells) return;
    if (!jszipLoaded) {
      setToast({ message: 'ZIP 库未加载, 请稍后再试', type: 'error' });
      return;
    }
    try {
      setProgressText('正在打包 ZIP...');
      const JSZip = (window as any).JSZip;
      const zip = new JSZip();
      const folder = zip.folder(`${product || '9宫格'}-朋友圈9宫格`);

      // 写一个 Excel 友好的 CSV 标题行
      let csv = `序号,标题,视觉角度,封面URL,${scene === 'product' ? '对应卖点' : '对应元素'}\n`;
      cells.forEach((c, i) => {
        const sp = sellingPoints[c.sellingPointIndex] || '';
        csv += `${i + 1},"${c.title}","${c.visualAngle}",${c.imageUrl},"${sp}"\n`;
      });
      folder.file('标题文案.csv', `﻿${csv}`); // ﻿ BOM 让 Excel 正确识别 UTF-8

      // 并发下载所有图片
      await Promise.all(
        cells.map(async (c, i) => {
          if (!c.imageUrl) return;
          try {
            const res = await fetch(c.imageUrl);
            const blob = await res.blob();
            const ext = c.imageUrl.includes('.png') ? 'png' : 'jpg';
            const safeTitle = c.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 20);
            folder.file(`${i + 1}_${safeTitle || 'cell'}.${ext}`, blob);
          } catch (e) {
            console.error(`下载 ${i + 1} 失败`, e);
          }
        })
      );

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${product || '9宫格'}-朋友圈9宫格.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setProgressText('');
      setToast({ message: '已下载 ZIP', type: 'success' });
    } catch (e: any) {
      setProgressText('');
      setToast({ message: '打包失败: ' + e.message, type: 'error' });
    }
  };

  // 复制单条标题
  const handleCopyTitle = async (title: string) => {
    try {
      await navigator.clipboard.writeText(title);
      setToast({ message: '已复制', type: 'success' });
    } catch {
      setToast({ message: '复制失败', type: 'error' });
    }
  };

  // 逐张保存全部图片（适合手机保存到相册，桌面也可用）
  const handleSaveAllImages = async () => {
    if (!cells) return;
    const validCells = cells.filter((c) => c.imageUrl);
    if (validCells.length === 0) {
      setToast({ message: '没有可保存的图片', type: 'error' });
      return;
    }
    setProgressText(`正在保存 0/${validCells.length}...`);
    for (let i = 0; i < validCells.length; i++) {
      const c = validCells[i];
      try {
        const res = await fetch(c.imageUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = c.imageUrl.includes('.png') ? 'png' : 'jpg';
        const safeTitle = (c.title || `图片${i + 1}`).replace(/[\\/:*?"<>|]/g, '_').substring(0, 15);
        a.download = `${i + 1}_${safeTitle}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setProgressText(`正在保存 ${i + 1}/${validCells.length}...`);
        if (i < validCells.length - 1) {
          await new Promise((r) => setTimeout(r, 300)); // 防止浏览器拦截连续下载
        }
      } catch (e) {
        console.error(`保存第 ${i + 1} 张失败`, e);
      }
    }
    setProgressText('');
    setToast({ message: `已保存 ${validCells.length} 张图片`, type: 'success' });
  };

  // 保存全部图片到灵感库
  const [savingToInspiration, setSavingToInspiration] = useState(false);
  const handleSaveToInspiration = async () => {
    if (!cells) return;
    const validCells = cells.filter((c) => c.imageUrl);
    if (validCells.length === 0) {
      setToast({ message: '没有可保存的图片', type: 'error' });
      return;
    }
    setSavingToInspiration(true);
    setProgressText(`灵感库 0/${validCells.length}...`);
    let done = 0;
    for (let i = 0; i < validCells.length; i++) {
      const c = validCells[i];
      try {
        await createInspiration.mutateAsync({
          type: 'image',
          title: c.title || `${product || '9宫格'} #${i + 1}`,
          media_urls: [c.imageUrl],
          source_platform: 'ai',
          prompt: c.prompt || c.visualAngle,
        });
        done++;
        setProgressText(`灵感库 ${done}/${validCells.length}...`);
      } catch (e: any) {
        console.error(`灵感库保存 ${i + 1} 失败`, e);
      }
    }
    setSavingToInspiration(false);
    setProgressText('');
    setToast({ message: `已存入灵感库 ${done}/${validCells.length} 张`, type: done > 0 ? 'success' : 'error' });
  };

  // 快捷导航
  const handleNavigate = (page: PageKey) => {
    const map: Partial<Record<PageKey, string>> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(map[page] || '/home');
  };

  const validPointsCount = sellingPoints.filter((p) => p.trim()).length;
  const needsElements = scene === 'product' || scene === 'lifestyle';
  const canGenerate = product.trim() && !isGenerating && (
    needsElements ? validPointsCount >= (scene === 'product' ? 3 : 1) : true
  );

  return (
    <div className="flex flex-col min-h-screen pb-20 overflow-x-hidden">
      <TopNav title="朋友圈 9 宫格" showBack onBack={() => router.push('/ai')} />

      {isInWorkflow && session && (
        <WorkflowSessionBar session={session} onPause={pauseSession} onResume={resumeSession} onAbandon={abandonSession} />
      )}

      <div className="flex-1 px-4 pt-4 space-y-4 min-w-0">
        {/* 场景选择器 */}
        <GlassCard className="!p-3">
          <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 500, marginBottom: 8 }}>选择场景</p>
          <div className="grid grid-cols-3 gap-1.5">
            {SCENES.map((s) => (
              <button
                key={s.key}
                onClick={() => handleSceneChange(s.key)}
                className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg text-center transition-all"
                style={{
                  background: scene === s.key ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)',
                  border: scene === s.key ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <span style={{ color: scene === s.key ? '#C4B5FD' : '#D1D5DB', fontSize: 11, fontWeight: 600 }}>{s.label}</span>
                <span style={{ color: '#6B7280', fontSize: 9 }}>{s.desc}</span>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* 主题输入（所有场景共用） */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            {scene === 'product' ? '产品/品牌名' : scene === 'festival' ? '节日/场合' : '主题描述'}
          </p>
          <input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder={
              scene === 'product' ? '例: 婴儿推车 / 轻食餐 / 健身房年卡...' :
              scene === 'lifestyle' ? '例: 周末野餐 / 杭州西湖一日游 / 今日穿搭...' :
              scene === 'festival' ? '例: 端午节 / 闺蜜生日 / 毕业典礼...' :
              scene === 'aesthetic' ? '例: 莫奈花园色调 / 国风山水 / 日系胶片...' :
              scene === 'creative' ? '例: 新品发布会海报 / 旅拍写真大片...' :
              '例: 书法作品集 / 手工皮具制作 / 本周书单...'
            }
            maxLength={100}
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-transparent outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#E5E7EB',
            }}
          />
        </GlassCard>

        {/* 卖点/元素（产品 and 生活记录 场景） */}
        {(scene === 'product' || scene === 'lifestyle') && (
          <GlassCard>
            <div className="flex items-center justify-between mb-2">
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>
                {scene === 'product' ? '卖点/特点 (3-5 个)' : '要包含的元素 (3-8 个)'}
              </p>
              <button
                onClick={addSellingPoint}
                disabled={sellingPoints.length >= (scene === 'product' ? 5 : 8)}
                className="text-[10px] flex items-center gap-1"
                style={{ color: sellingPoints.length >= (scene === 'product' ? 5 : 8) ? '#6B7280' : '#93C5FD' }}
              >
                <Plus size={10} /> 添加
              </button>
            </div>
            <div className="space-y-2">
              {sellingPoints.map((sp, i) => (
                <div key={i} className="flex gap-1.5">
                  <input
                    value={sp}
                    onChange={(e) => updateSellingPoint(i, e.target.value)}
                    placeholder={scene === 'product' ? `卖点 ${i + 1} (例: 轻便折叠)` : `元素 ${i + 1} (例: 食物特写)`}
                    maxLength={50}
                    className="flex-1 px-3 py-2 rounded-lg text-xs bg-transparent outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#E5E7EB',
                    }}
                  />
                  {sellingPoints.length > (scene === 'product' ? 3 : 1) && (
                    <button
                      onClick={() => removeSellingPoint(i)}
                      className="px-2 py-2 rounded-lg"
                      style={{ background: 'rgba(239,68,68,0.1)' }}
                      title="删除"
                    >
                      <Trash2 size={12} color="#FCA5A5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* 额外参数（节日氛围/色调/排版方式/风格） */}
        {(scene === 'festival' || scene === 'aesthetic' || scene === 'creative' || scene === 'hobby') && (
          <GlassCard>
            <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              {scene === 'creative' ? '排版方式' : scene === 'aesthetic' ? '色调偏好' : scene === 'festival' ? '氛围/风格' : '风格/特点'}
              <span style={{ color: '#6B7280', fontSize: 10, marginLeft: 4 }}>(可选)</span>
            </p>
            {scene === 'creative' ? (
              <div className="space-y-1.5">
                {LAYOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setExtra(extra === opt.value ? '' : opt.value)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all"
                    style={{
                      background: extra === opt.value ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)',
                      border: extra === opt.value ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      color: extra === opt.value ? '#C4B5FD' : '#9CA3AF',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {(scene === 'festival' ? FESTIVAL_MOODS : scene === 'aesthetic' ? AESTHETIC_TONES : HOBBY_STYLES).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setExtra(extra === opt ? '' : opt)}
                    className="text-center py-2 px-1 rounded-lg text-xs transition-all"
                    style={{
                      background: extra === opt ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)',
                      border: extra === opt ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      color: extra === opt ? '#C4B5FD' : '#9CA3AF',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {/* 参考图（可选） */}
        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>
              <span style={{ color: '#8B5CF6' }}>参考图</span> · 视觉风格参考
              <span style={{ color: '#6B7280', fontSize: 10, fontWeight: 400, marginLeft: 4 }}>（可选）</span>
            </p>
            {referenceImage && (
              <button
                onClick={() => { setReferenceImage(''); setReferenceSource(null); }}
                className="text-xs flex items-center gap-1 px-2 py-0.5 rounded"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <X size={11} /> 清除
              </button>
            )}
          </div>

          {/* 已选参考图预览 */}
          {referenceImage && (
            <div
              className="mb-3 rounded-xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))',
                border: '1px solid rgba(139,92,246,0.3)',
                aspectRatio: '1/1',
                maxHeight: 160,
              }}
            >
              <div className="relative w-full h-full">
                <img src={referenceImage} alt="参考图" className="w-full h-full object-cover" />
                {referenceSource && (
                  <span
                    className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded text-[10px] font-semibold"
                    style={{
                      background: referenceSource === 'handoff'
                        ? 'rgba(34,197,94,0.85)'
                        : referenceSource === 'upload'
                        ? 'rgba(59,130,246,0.85)'
                        : referenceSource === 'url'
                        ? 'rgba(245,158,11,0.85)'
                        : 'rgba(139,92,246,0.85)',
                      color: '#fff',
                    }}
                  >
                    {referenceSource === 'inspiration' && '📚 灵感库'}
                    {referenceSource === 'url' && '🔗 URL 粘贴'}
                    {referenceSource === 'upload' && '📤 本地上传'}
                    {referenceSource === 'handoff' && '🔄 AI 工具传入'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 三个 tab */}
          <div className="flex rounded-lg overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.05)' }}>
            {([
              { key: 'inspiration' as const, label: '灵感库', icon: '📚' },
              { key: 'url' as const, label: 'URL', icon: '🔗' },
              { key: 'upload' as const, label: '上传', icon: '📤' },
            ]).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setReferenceTab(key)}
                className="flex-1 py-2 text-xs flex items-center justify-center gap-1.5 transition-all"
                style={{
                  background: referenceTab === key ? 'rgba(139,92,246,0.2)' : 'transparent',
                  color: referenceTab === key ? '#C4B5FD' : '#9CA3AF',
                  fontWeight: referenceTab === key ? 600 : 400,
                }}
              >
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>

          {referenceTab === 'inspiration' && (
            <div className="max-h-40 overflow-y-auto custom-scrollbar">
              {(imageInspirations as any[]).filter((item: any) => item.media_urls?.[0]).length === 0 ? (
                <p style={{ color: '#6B7280', fontSize: 11, textAlign: 'center', padding: 16 }}>
                  暂无图片灵感，可先到灵感库上传
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {(imageInspirations as any[])
                    .filter((item: any) => item.media_urls?.[0])
                    .map((item: any) => (
                      <button
                        key={item.id}
                        onClick={() => { setReferenceImage(item.media_urls![0]); setReferenceSource('inspiration'); }}
                        className="aspect-square rounded-lg overflow-hidden transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: referenceImage === item.media_urls![0]
                            ? '2px solid rgba(139,92,246,0.6)'
                            : '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <img
                          src={item.media_urls![0]}
                          alt={item.title || ''}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {referenceTab === 'url' && (
            <div>
              <div className="flex gap-1.5">
                <input
                  value={referenceInput}
                  onChange={(e) => setReferenceInput(e.target.value)}
                  placeholder="https://... 图片 URL"
                  className="flex-1 px-2.5 py-2 rounded-lg text-xs bg-transparent outline-none"
                  style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <button
                  onClick={() => { if (referenceInput.trim()) { setReferenceImage(referenceInput.trim()); setReferenceSource('url'); setReferenceInput(''); } }}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'rgba(139,92,246,0.2)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.3)' }}
                >
                  <Link2 size={11} className="inline mr-0.5" /> 应用
                </button>
              </div>
            </div>
          )}

          {referenceTab === 'upload' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadRefImage}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingRef}
                className="w-full py-3 rounded-lg text-xs flex items-center justify-center gap-1.5"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', color: '#9CA3AF' }}
              >
                {uploadingRef ? (
                  <><Loader2 size={14} className="animate-spin" /> 上传中...</>
                ) : (
                  <><Upload size={14} /> 点击选择本地图片</>
                )}
              </button>
            </div>
          )}
        </GlassCard>

        {/* 生成按钮 */}
        <PrimaryButton
          fullWidth
          size="lg"
          onClick={handleGenerate}
          disabled={!canGenerate}
        >
          {isGenerating ? (
            <><Loader2 size={16} className="animate-spin" /> {progressText || '生成中...'}</>
          ) : (
            <><Zap size={16} /> 生成 9 宫格素材包</>
          )}
        </PrimaryButton>

        {/* 错误 */}
        {error && (
          <GlassCard>
            <div className="flex items-start gap-2">
              <AlertCircle size={16} color="#EF4444" />
              <p style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</p>
            </div>
          </GlassCard>
        )}

        {/* 结果 9 宫格 */}
        {cells && cells.length > 0 && (
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>
                📦 9 宫格素材
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={handleDownloadZip}
                  className="px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1"
                  style={{
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
                    border: '1px solid rgba(59,130,246,0.5)',
                    color: '#93C5FD',
                    fontWeight: 600,
                  }}
                >
                  <Download size={11} /> ZIP
                </button>
                <button
                  onClick={handleSaveAllImages}
                  disabled={isGenerating}
                  className="px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1"
                  style={{
                    background: 'linear-gradient(135deg, rgba(34,197,94,0.25), rgba(59,130,246,0.25))',
                    border: '1px solid rgba(34,197,94,0.4)',
                    color: '#86EFAC',
                    fontWeight: 600,
                    opacity: isGenerating ? 0.4 : 1,
                  }}
                >
                  <Download size={11} /> 保存图片
                </button>
                <button
                  onClick={handleSaveToInspiration}
                  disabled={savingToInspiration}
                  className="px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1"
                  style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.25))',
                    border: '1px solid rgba(139,92,246,0.4)',
                    color: '#C4B5FD',
                    fontWeight: 600,
                    opacity: savingToInspiration ? 0.4 : 1,
                  }}
                >
                  <FolderOpen size={11} /> 存灵感库
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {cells.map((c, i) => (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {/* 缩略图 */}
                  <div
                    className="relative aspect-square"
                    style={{
                      background: c.imageUrl
                        ? 'transparent'
                        : 'rgba(239,68,68,0.08)',
                    }}
                  >
                    {c.imageUrl ? (
                      <img
                        src={c.imageUrl}
                        alt={c.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                        <AlertCircle size={20} color="#EF4444" />
                        <p style={{ color: '#FCA5A5', fontSize: 9 }}>生成失败</p>
                      </div>
                    )}
                    <div
                      className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}
                    >
                      #{i + 1}
                    </div>
                  </div>

                  {/* 标题 */}
                  <div className="p-1.5">
                    <p
                      style={{ color: '#E5E7EB', fontSize: 10, fontWeight: 600, lineHeight: 1.3 }}
                      className="line-clamp-2"
                    >
                      {c.title}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span style={{ color: '#9CA3AF', fontSize: 9 }}>
                        {c.visualAngle}
                      </span>
                      <button
                        onClick={() => handleCopyTitle(c.title)}
                        className="p-0.5"
                        title="复制标题"
                      >
                        <Copy size={9} color="#9CA3AF" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 提示 */}
            <div
              className="mt-3 p-2.5 rounded-lg flex items-start gap-2"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              <CheckCircle2 size={14} color="#86EFAC" />
              <p style={{ color: '#86EFAC', fontSize: 11, lineHeight: 1.5 }}>
                下载的 ZIP 含 9 张 1:1 封面 + 1 份标题 CSV(序号/标题/角度/对应描述)。可直接发布朋友圈。
              </p>
            </div>
          </GlassCard>
        )}
      </div>

      {/* 历史生成 */}
      {!historyLoading && historyItems.length > 0 && (
        <div className="px-4 pb-20">
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>历史生成</p>
          <div className="space-y-3">
            {historyItems.map((item) => {
              const meta = item.metadata as Record<string, unknown> | undefined;
              const generatedAds = meta?.generatedAds as Record<string, unknown> | undefined;
              const cells = generatedAds?.cells as Array<{ imageUrl: string; title: string; visualAngle?: string }> | undefined;
              const firstImage = cells?.[0]?.imageUrl || item.imageUrl;
              const totalCells = cells?.length || 0;
              return (
                <GlassCard
                  key={item.id}
                  hover
                  className="!p-3 cursor-pointer"
                  onClick={() => {
                    if (item.title) setProduct(item.title);
                    const sceneFromMeta = generatedAds?.scene as string | undefined;
                    if (sceneFromMeta) setScene(sceneFromMeta);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <div className="flex items-center gap-3">
                    {firstImage ? (
                      <img
                        src={firstImage}
                        alt={item.title}
                        loading="lazy"
                        className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      />
                    ) : (
                      <div
                        className="w-20 h-20 rounded-xl flex items-center justify-center text-3xl flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      >
                        📦
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 500, marginBottom: 4 }} className="truncate">
                        {item.title}
                      </p>
                      <div className="flex items-center justify-between">
                        <span style={{ color: '#6B7280', fontSize: 11 }}>
                          {item.time}{totalCells > 0 ? ` · ${totalCells} 张` : ''}
                        </span>
                        <span
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]"
                          style={{ background: 'rgba(139,92,246,0.15)', color: '#C4B5FD' }}
                        >
                          🔄 做同款
                        </span>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>
      )}

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function AdsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p style={{ color: '#9CA3AF' }}>加载中...</p></div>}>
        <AdsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
