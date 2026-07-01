'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Upload, CheckCircle2, Save, Sparkles,
  Loader2, Download, FolderOpen,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { AnimatePreset } from '@/components/ai/digital-human/types';
import { ANIMATE_PRESET_KEY } from '@/components/ai/digital-human/types';

export interface DigitalHumanImagePanelProps {
  imageUrl: string;
  imagePreview: string | null;
  isAnimateMode: boolean;
  onToast: (message: string, type: 'success' | 'error') => void;
}

export function DigitalHumanImagePanel({ imageUrl, imagePreview, isAnimateMode, onToast }: DigitalHumanImagePanelProps) {
  // ─── Animate 模式状态 ─────────────────────────────
  const [animateRefImageUrl, setAnimateRefImageUrl] = useState('');
  const [animateMotionVideoUrl, setAnimateMotionVideoUrl] = useState('');
  const [animateMode, setAnimateMode] = useState<'animate' | 'replace'>('animate');
  const [animateResolution, setAnimateResolution] = useState<'480P' | '720P'>('720P');
  const [animateTaskId, setAnimateTaskId] = useState<string | null>(null);
  const [animatePhase, setAnimatePhase] = useState<'idle' | 'submitting' | 'running' | 'done' | 'failed'>('idle');
  const [animateResultUrl, setAnimateResultUrl] = useState<string | null>(null);
  const [animateError, setAnimateError] = useState<string | null>(null);
  const [isUploadingMotionVideo, setIsUploadingMotionVideo] = useState(false);
  const [animatePreset, setAnimatePreset] = useState<AnimatePreset | null>(null);
  const animatePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载角色形象预配置
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ANIMATE_PRESET_KEY);
      if (raw) setAnimatePreset(JSON.parse(raw));
    } catch {}
  }, []);

  // 进入 Animate 模式时自动填入预配置形象
  useEffect(() => {
    if (!isAnimateMode || !animatePreset) return;
    if (!imageUrl) return; // 等待父组件图片加载
    if (!animateRefImageUrl) {
      setAnimateRefImageUrl(imageUrl || animatePreset.imageUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnimateMode, animatePreset, imageUrl]);

  // 同步外部 imageUrl 变化
  useEffect(() => {
    if (isAnimateMode && imageUrl && !animateRefImageUrl) {
      setAnimateRefImageUrl(imageUrl);
    }
  }, [imageUrl, isAnimateMode, animateRefImageUrl]);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (animatePollRef.current) clearInterval(animatePollRef.current);
    };
  }, []);

  // ─── Animate handlers ────────────────────────────
  const handleUploadMotionVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      onToast('参考视频需 ≤ 100MB', 'error');
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
        onToast('参考视频已上传', 'success');
      } else {
        onToast(data.error || '上传失败', 'error');
      }
    } catch {
      onToast('上传失败,请重试', 'error');
    }
    setIsUploadingMotionVideo(false);
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
          onToast('🎉 Animate 角色动作生成完成', 'success');
        } else if (s.status === 'failed') {
          setAnimateError(s.message || '生成失败');
          setAnimatePhase('failed');
          if (animatePollRef.current) clearInterval(animatePollRef.current);
        }
      }
    } catch {}
  };

  const handleAnimateSubmit = async () => {
    if (!animateRefImageUrl || !animateMotionVideoUrl) {
      onToast('请提供角色头像 + 参考视频', 'error');
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
        onToast(data.error || '提交失败', 'error');
        return;
      }
      setAnimateTaskId(data.data.taskId);
      setAnimatePhase('running');
      onToast('Animate 任务已提交,通常 1-3 分钟', 'success');
      if (animatePollRef.current) clearInterval(animatePollRef.current);
      animatePollRef.current = setInterval(pollAnimateStatus, 6000);
      setTimeout(pollAnimateStatus, 2000);
    } catch (e: any) {
      setAnimatePhase('failed');
      setAnimateError(e?.message || '网络错误');
    }
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
        onToast('已存入灵感库', 'success');
      } else {
        onToast(data.error || '保存失败', 'error');
      }
    } catch {
      onToast('保存失败', 'error');
    }
  };

  const handleSavePreset = () => {
    const preset: AnimatePreset = {
      imageUrl: imagePreview || imageUrl,
      imagePreview,
      name: '我的角色形象',
      savedAt: Date.now(),
    };
    localStorage.setItem(ANIMATE_PRESET_KEY, JSON.stringify(preset));
    setAnimatePreset(preset);
    onToast('已保存为我的形象，下次可直接使用', 'success');
  };

  const handleClearPreset = () => {
    localStorage.removeItem(ANIMATE_PRESET_KEY);
    setAnimatePreset(null);
    onToast('已清除预配置形象', 'success');
  };

  // 非 Animate 模式不需要额外面板（图片选择器在父组件）
  if (!isAnimateMode) return null;

  return (
    <>
      <GlassCard>
        <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
          <span style={{ color: '#EC4899' }}>🎭 角色动作迁移</span> · 静态头像 + 参考视频
        </p>
        <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.6, marginBottom: 12 }}>
          上传一张角色头像(创始人/虚拟形象) + 一段参考视频(任意人物动作/口播),AI 会让头像复刻视频里的动作、表情、口型。
          <br />适合: 创始人 IP 持续产出、虚拟主播预制动作库、产品发布会动画。
        </p>

        {/* 角色头像 */}
        <div className="mb-3">
          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>① 角色头像(必填)</p>
          {(imagePreview || imageUrl) ? (
            <div>
              <input
                value={animateRefImageUrl || imagePreview || imageUrl}
                onChange={(e) => setAnimateRefImageUrl(e.target.value)}
                placeholder="或直接粘贴图片 URL"
                className="w-full mt-2 px-2.5 py-1.5 rounded-lg bg-transparent text-xs outline-none"
                style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              {(!animatePreset || animatePreset.imageUrl !== (imagePreview || imageUrl)) && (
                <button
                  onClick={handleSavePreset}
                  className="w-full mt-1.5 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1"
                  style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#C4B5FD' }}
                >
                  <Save size={11} /> 保存为我的形象
                </button>
              )}
              {animatePreset && animatePreset.imageUrl === (imagePreview || imageUrl) && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <CheckCircle2 size={12} color="#22C55E" />
                  <span style={{ color: '#86EFAC', fontSize: 10 }}>已保存为我的形象</span>
                  <button
                    onClick={handleClearPreset}
                    style={{ color: '#FCA5A5', fontSize: 10, marginLeft: 'auto' }}
                  >
                    清除
                  </button>
                </div>
              )}
            </div>
          ) : null}
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
          <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
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
}
