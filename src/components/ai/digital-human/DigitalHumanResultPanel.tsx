'use client';

import {
  Download, Save, RefreshCw, Loader2,
  CheckCircle2, XCircle, Video as VideoIcon, Share2,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { OC_PHASES } from '@/components/ai/digital-human/types';

export interface DigitalHumanResultPanelProps {
  // s2v 结果
  finalVideoUrl: string | null;
  generatePhase: 'idle' | 'uploading_audio' | 'submitting' | 'generating' | 'done' | 'error';
  errorMsg: string | null;
  showProgress: boolean;
  onDownload: (url?: string) => void;
  onSave: (url?: string) => void;
  onRetry: () => void;
  onCancel: () => void;
  // 一键成片进度
  ocPhase: string;
  ocCurrentSegment: number;
  ocTotalSegments: number;
  onCancelOc: () => void;
  // Handoff
  aiTopic: string;
  ttsText: string;
  imageUrl: string;
  onHandoffToVideo: () => void;
  onHandoffToPublish: () => void;
}

function VideoResultDisplay({
  videoUrl,
  onDownload,
  onSave,
  onRetry,
  aiTopic,
  ttsText,
  imageUrl,
  onHandoffToVideo,
  onHandoffToPublish,
}: {
  videoUrl: string;
  onDownload: (url?: string) => void;
  onSave: (url?: string) => void;
  onRetry: () => void;
  aiTopic: string;
  ttsText: string;
  imageUrl: string;
  onHandoffToVideo: () => void;
  onHandoffToPublish: () => void;
}) {
  return (
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
          { icon: <Download size={15} />, label: '下载', action: () => onDownload(videoUrl) },
          { icon: <Save size={15} />, label: '保存', action: () => onSave(videoUrl) },
          { icon: <RefreshCw size={15} />, label: '重新生成', action: onRetry },
        ].map(({ icon, label, action }) => (
          <button key={label} onClick={action}
            className="flex flex-col items-center gap-1 py-2 rounded-xl text-xs"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#E5E7EB' }}>
            <span style={{ color: '#06B6D4' }}>{icon}</span> {label}
          </button>
        ))}
      </div>

      {/* 下一步: handoff */}
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
            onClick={onHandoffToVideo}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl"
            style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)' }}
          >
            <VideoIcon size={16} color="#F43F5E" />
            <span style={{ color: '#F43F5E', fontSize: 11, fontWeight: 600 }}>做更长视频</span>
          </button>
          <button
            onClick={onHandoffToPublish}
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
}

export function DigitalHumanResultPanel({
  finalVideoUrl,
  generatePhase,
  errorMsg,
  showProgress,
  onDownload,
  onSave,
  onRetry,
  onCancel,
  ocPhase,
  ocCurrentSegment,
  ocTotalSegments,
  onCancelOc,
  aiTopic,
  ttsText,
  imageUrl,
  onHandoffToVideo,
  onHandoffToPublish,
}: DigitalHumanResultPanelProps) {
  if (generatePhase === 'idle' && ocPhase === 'idle') return null;

  return (
    <>
      {/* s2v 结果 */}
      {generatePhase === 'done' && finalVideoUrl && (
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ color: '#06B6D4' }}>生成</span> · 视频
          </p>
          <VideoResultDisplay
            videoUrl={finalVideoUrl}
            onDownload={onDownload}
            onSave={onSave}
            onRetry={onRetry}
            aiTopic={aiTopic}
            ttsText={ttsText}
            imageUrl={imageUrl}
            onHandoffToVideo={onHandoffToVideo}
            onHandoffToPublish={onHandoffToPublish}
          />
        </GlassCard>
      )}

      {/* s2v 错误 */}
      {generatePhase === 'error' && (
        <GlassCard>
          <div className="flex flex-col items-center py-4 gap-2">
            <XCircle size={30} color="#EF4444" />
            <p style={{ color: '#FCA5A5', fontSize: 13 }}>{errorMsg || '生成失败'}</p>
            <PrimaryButton size="sm" onClick={onRetry}>
              <RefreshCw size={14} /> 重试
            </PrimaryButton>
          </div>
        </GlassCard>
      )}

      {/* s2v 进度 */}
      {showProgress && (
        <GlassCard>
          <div className="flex flex-col items-center py-4 gap-3">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
              <div className="absolute inset-3 rounded-full border-2 border-purple-400 border-b-transparent animate-spin"
                style={{ animationDuration: '0.7s', animationDirection: 'reverse' }} />
            </div>
            <p style={{ color: '#FFFFFF', fontSize: 14 }}>
              {generatePhase === 'uploading_audio' ? '上传音频...' : generatePhase === 'submitting' ? '提交中...' : '生成视频中...'}
            </p>
            <button onClick={onCancel} className="px-3 py-1 rounded-lg text-xs"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#FCA5A5' }}>取消</button>
          </div>
        </GlassCard>
      )}

      {/* 一键生成进度 */}
      {ocPhase !== 'idle' && ocPhase !== 'done' && ocPhase !== 'error' && (
        <GlassCard>
          <div className="flex flex-col items-center py-4 gap-2">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
            </div>
            <p style={{ color: '#67E8F9', fontSize: 13, fontWeight: 600 }}>{OC_PHASES[ocPhase] || ocPhase}</p>
            <p style={{ color: '#9CA3AF', fontSize: 11 }}>
              {ocTotalSegments > 1 && ocCurrentSegment > 0
                ? `处理 ${ocCurrentSegment}/${ocTotalSegments} 段`
                : ocPhase === 'generating' ? '唇形同步 + 表情生成，预计 2-5 分钟' : '请稍候...'}
            </p>
            {ocTotalSegments > 1 && (
              <div className="w-full max-w-[200px] h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ background: 'linear-gradient(90deg, #06B6D4, #8B5CF6)', width: `${(ocCurrentSegment / ocTotalSegments) * 100}%` }} />
              </div>
            )}
            <button onClick={onCancelOc}
              className="px-4 py-1.5 rounded-lg text-xs"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>取消</button>
          </div>
        </GlassCard>
      )}
    </>
  );
}
