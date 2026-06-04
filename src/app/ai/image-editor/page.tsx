'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Scissors, Sparkles, Maximize, Upload, Download,
  Loader2, Image as ImageIcon, RefreshCw,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProtectedRoute } from '@/components';
import { useToast } from '@/components/Toast';

type EditAction = 'remove-bg' | 'enhance' | 'expand';

const TABS: { key: EditAction; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'remove-bg', label: '背景移除', icon: <Scissors size={16} />, desc: '智能识别主体，去除背景' },
  { key: 'enhance', label: '画质增强', icon: <Sparkles size={16} />, desc: '提升分辨率与清晰度' },
  { key: 'expand', label: '智能扩图', icon: <Maximize size={16} />, desc: '向外扩展画面，AI 填充边缘' },
];

function ImageEditorContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageUrl, setImageUrl] = useState('');
  const [action, setAction] = useState<EditAction>('remove-bg');
  const [processing, setProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageUrl(ev.target?.result as string);
      setResultUrl(null);
    };
    reader.readAsDataURL(file);
  };

  const handleProcess = async () => {
    if (!imageUrl) {
      showToast('请先上传或粘贴图片 URL', 'error');
      return;
    }

    setProcessing(true);
    setResultUrl(null);
    try {
      const res = await fetch('/api/ai/image/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          imageUrl,
          prompt: customPrompt || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        showToast(data.error || '处理失败', 'error');
      } else {
        setResultUrl(data.data.url);
        showToast('处理完成', 'success');
      }
    } catch {
      showToast('网络错误，请重试', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `edited-${action}-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="flex flex-col min-h-screen pb-6">
      {/* Top Nav */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="p-1">
          <ArrowLeft size={20} color="#E5E7EB" />
        </button>
        <p style={{ color: '#FFFFFF', fontSize: 17, fontWeight: 700 }}>AI 图片编辑</p>
      </div>

      <div className="flex-1 px-4 space-y-4">
        {/* 操作 Tab */}
        <GlassCard className="!p-3">
          <div className="grid grid-cols-3 gap-2">
            {TABS.map(({ key, label, icon, desc }) => (
              <button
                key={key}
                onClick={() => { setAction(key); setResultUrl(null); }}
                className="flex flex-col items-center gap-1 p-2 rounded-xl text-center transition-colors"
                style={{
                  background: action === key ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${action === key ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <span style={{ color: action === key ? '#A78BFA' : '#6B7280' }}>{icon}</span>
                <span style={{ color: action === key ? '#E5E7EB' : '#9CA3AF', fontSize: 11, fontWeight: 600 }}>
                  {label}
                </span>
                <span style={{ color: '#4B5563', fontSize: 9, lineHeight: 1.2 }}>{desc}</span>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* 图片上传区 */}
        <GlassCard className="!p-4">
          <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
            上传图片
          </p>

          {imageUrl ? (
            <div className="relative rounded-xl overflow-hidden mb-3" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <img
                src={imageUrl}
                alt="原始图片"
                className="w-full max-h-64 object-contain"
                style={{ background: 'rgba(0,0,0,0.3)' }}
              />
              <button
                onClick={() => { setImageUrl(''); setResultUrl(null); }}
                className="absolute top-2 right-2 px-2 py-1 rounded-lg text-[10px]"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#FCA5A5' }}
              >
                移除
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-10 rounded-xl flex flex-col items-center gap-2 border-2 border-dashed transition-colors hover:border-white/20"
              style={{ borderColor: 'rgba(255,255,255,0.1)' }}
            >
              <Upload size={28} color="#6B7280" />
              <span style={{ color: '#6B7280', fontSize: 12 }}>点击上传图片</span>
              <span style={{ color: '#4B5563', fontSize: 10 }}>或粘贴图片 URL 到下方</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* URL 输入 */}
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => { setImageUrl(e.target.value); setResultUrl(null); }}
            placeholder="或粘贴图片 URL..."
            className="w-full px-3 py-2 rounded-lg text-xs"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#E5E7EB',
              outline: 'none',
            }}
          />
        </GlassCard>

        {/* 自定义提示词（增强/扩图） */}
        {action !== 'remove-bg' && (
          <GlassCard className="!p-4">
            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
              自定义提示词（可选）
            </p>
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={action === 'enhance' ? '如：提升清晰度，增强色彩对比...' : '如：扩展为横向 16:9 画面...'}
              className="w-full px-3 py-2 rounded-lg text-xs"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#E5E7EB',
                outline: 'none',
              }}
            />
          </GlassCard>
        )}

        {/* 处理按钮 */}
        <PrimaryButton
          onClick={handleProcess}
          disabled={!imageUrl || processing}
          loading={processing}
          className="w-full"
        >
          {processing ? '处理中...' : `开始${TABS.find((t) => t.key === action)?.label}`}
        </PrimaryButton>

        {/* 结果展示 */}
        {resultUrl && (
          <GlassCard className="!p-4">
            <div className="flex items-center justify-between mb-3">
              <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600 }}>处理结果</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]"
                  style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  <Download size={12} /> 下载
                </button>
                <button
                  onClick={() => setImageUrl(resultUrl)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]"
                  style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.3)' }}
                >
                  <RefreshCw size={12} /> 继续编辑
                </button>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <img
                src={resultUrl}
                alt="编辑结果"
                className="w-full max-h-80 object-contain"
                style={{ background: 'rgba(0,0,0,0.3)' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          </GlassCard>
        )}

        {/* 使用说明 */}
        <GlassCard className="!p-4">
          <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>使用说明</p>
          <ul style={{ color: '#6B7280', fontSize: 11, lineHeight: 1.8, paddingLeft: 16 }}>
            <li>背景移除：自动识别图片主体，生成透明/白色背景</li>
            <li>画质增强：提升图片分辨率和清晰度，改善色彩</li>
            <li>智能扩图：向外扩展画面边界，AI 自动填充新增区域</li>
            <li>支持 JPG/PNG/WebP 格式，文件不超过 10MB</li>
            <li>每次处理消耗 2-5 credits（视操作类型）</li>
          </ul>
        </GlassCard>
      </div>
    </div>
  );
}

export default function ImageEditorPage() {
  return (
    <ProtectedRoute>
      <ImageEditorContent />
    </ProtectedRoute>
  );
}
