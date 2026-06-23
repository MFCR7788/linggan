// ====== Capture 页面子组件 ======

import { Clipboard, Check, Share2, Edit3, Trash2, Volume2, Square, RefreshCw, BookmarkPlus, CalendarPlus, Image as ImageIcon, Video, X } from 'lucide-react';
import type { Message } from './types';

// ====== 小操作按钮 ======

export function ActionBtn({ icon: Icon, tooltip, onClick, className = '' }: {
  icon: any;
  tooltip: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <div className="relative group/btn">
      <button
        onClick={onClick}
        className={`w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors ${className}`}
      >
        <Icon size={14} color="#9CA3AF" />
      </button>
      <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-gray-700 text-gray-200 text-[10px] rounded whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none z-10">
        {tooltip}
      </span>
    </div>
  );
}

// ====== 用户消息操作按钮 ======

export function UserActions({ msg, copiedId, generatingId, onCopy, onShare, onModify, onDelete, onImg2Img, onImg2Vid }: {
  msg: Message;
  copiedId: string | null;
  generatingId: string | null;
  onCopy: (msg: Message) => void;
  onShare: (msg: Message) => void;
  onModify: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  onImg2Img?: (msg: Message) => void;
  onImg2Vid?: (msg: Message) => void;
}) {
  const hasImage = msg.attachments?.some(a => a.type === 'image');
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <ActionBtn icon={Edit3} tooltip="修改" onClick={() => onModify(msg)} />
      <ActionBtn icon={copiedId === msg.id ? Check : Clipboard} tooltip="复制" onClick={() => onCopy(msg)} />
      <ActionBtn icon={Share2} tooltip="分享" onClick={() => onShare(msg)} />
      {hasImage && (
        <>
          <ActionBtn icon={ImageIcon} tooltip="图生图" onClick={() => onImg2Img?.(msg)}
            className={generatingId === `img2img-${msg.id}` ? 'animate-pulse' : ''} />
          <ActionBtn icon={Video} tooltip="图生视频" onClick={() => onImg2Vid?.(msg)}
            className={generatingId === `img2vid-${msg.id}` ? 'animate-pulse' : ''} />
        </>
      )}
      <ActionBtn icon={Trash2} tooltip="删除" onClick={() => onDelete(msg)} />
    </div>
  );
}

// ====== AI 消息操作按钮 ======

export function AiActions({ msg, copiedId, speakingId, regeneratingId, savingId, schedulingId, onCopy, onSpeak, onShare, onRegenerate, onSave, onAddToSchedule, onModify, onDelete }: {
  msg: Message;
  copiedId: string | null;
  speakingId: string | null;
  regeneratingId: string | null;
  savingId: string | null;
  schedulingId: string | null;
  onCopy: (msg: Message) => void;
  onSpeak: (msg: Message) => void;
  onShare: (msg: Message) => void;
  onRegenerate: (msg: Message) => void;
  onSave: (msg: Message) => void;
  onAddToSchedule: (msg: Message) => void;
  onModify: (msg: Message) => void;
  onDelete: (msg: Message) => void;
}) {
  const isSpeaking = speakingId === msg.id;
  return (
    <div className="flex items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity duration-150">
      <ActionBtn icon={Edit3} tooltip="修改" onClick={() => onModify(msg)} />
      <ActionBtn icon={copiedId === msg.id ? Check : Clipboard} tooltip="复制" onClick={() => onCopy(msg)} />
      <button
        onClick={() => onSpeak(msg)}
        className={`w-7 h-7 flex items-center justify-center rounded-full transition-all ${
          isSpeaking
            ? 'bg-blue-500 text-white shadow-md shadow-blue-500/40'
            : 'hover:bg-white/10 text-gray-400'
        }`}
        title={isSpeaking ? '停止播报' : '语音播报'}
      >
        {isSpeaking ? <Square size={14} color="white" fill="white" /> : <Volume2 size={14} color="currentColor" />}
      </button>
      <ActionBtn icon={Share2} tooltip="分享" onClick={() => onShare(msg)} />
      <ActionBtn
        icon={RefreshCw}
        tooltip="重新生成"
        className={regeneratingId === msg.id ? 'animate-spin' : ''}
        onClick={() => onRegenerate(msg)}
      />
      <ActionBtn
        icon={savingId === msg.id ? Check : BookmarkPlus}
        tooltip="存灵感库"
        onClick={() => onSave(msg)}
      />
      {(msg.schedule || (msg.schedules && msg.schedules.length > 0)) && (
        <ActionBtn
          icon={schedulingId === msg.id ? Check : CalendarPlus}
          tooltip="添加到日程"
          onClick={() => onAddToSchedule(msg)}
        />
      )}
      <ActionBtn icon={Trash2} tooltip="删除" onClick={() => onDelete(msg)} />
    </div>
  );
}

// ====== 抖音式悬浮播放器 ======
// 语音播报开始时,在屏幕底部居中显示一个带波形动画+显眼 ✕ 关闭键的悬浮条
// 用户滚动到任何位置都能看到/停止播报
export function FloatingPlayer({ visible, onStop }: {
  visible: boolean;
  onStop: () => void;
}) {
  if (!visible) return null;
  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50
                 bg-gradient-to-r from-blue-500 to-cyan-500
                 rounded-full pl-4 pr-2 py-2 shadow-2xl shadow-blue-500/30
                 flex items-center gap-3 animate-[slideUp_0.25s_ease-out]"
      style={{ animation: 'slideUp 0.25s ease-out' }}
    >
      {/* 跳动波形 */}
      <div className="flex items-end gap-0.5 h-4">
        <span className="block w-0.5 h-3 bg-white rounded-full animate-[wave_0.9s_ease-in-out_infinite]" />
        <span className="block w-0.5 h-2 bg-white rounded-full animate-[wave_0.9s_ease-in-out_infinite_0.15s]" />
        <span className="block w-0.5 h-4 bg-white rounded-full animate-[wave_0.9s_ease-in-out_infinite_0.3s]" />
        <span className="block w-0.5 h-2 bg-white rounded-full animate-[wave_0.9s_ease-in-out_infinite_0.45s]" />
      </div>
      <span className="text-white text-sm font-medium pr-1">正在朗读</span>
      <button
        onClick={onStop}
        className="w-8 h-8 rounded-full bg-white/30 hover:bg-white/50 active:bg-white/70
                   flex items-center justify-center transition-colors
                   border-2 border-white/60"
        aria-label="停止播报"
        title="停止播报"
      >
        <X size={18} color="white" strokeWidth={2.5} />
      </button>
    </div>
  );
}
