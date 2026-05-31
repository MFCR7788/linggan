// ====== Capture 页面子组件 ======

import { Clipboard, Check, Share2, Edit3, Trash2, Volume2, Square, RefreshCw, BookmarkPlus, Image as ImageIcon, Video } from 'lucide-react';
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
      <ActionBtn icon={copiedId === msg.id ? Check : Clipboard} tooltip="复制" onClick={() => onCopy(msg)} />
      <ActionBtn icon={Share2} tooltip="分享" onClick={() => onShare(msg)} />
      <ActionBtn icon={Edit3} tooltip="修改" onClick={() => onModify(msg)} />
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

export function AiActions({ msg, copiedId, speakingId, regeneratingId, savingId, onCopy, onSpeak, onShare, onRegenerate, onSave, onDelete }: {
  msg: Message;
  copiedId: string | null;
  speakingId: string | null;
  regeneratingId: string | null;
  savingId: string | null;
  onCopy: (msg: Message) => void;
  onSpeak: (msg: Message) => void;
  onShare: (msg: Message) => void;
  onRegenerate: (msg: Message) => void;
  onSave: (msg: Message) => void;
  onDelete: (msg: Message) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <ActionBtn icon={copiedId === msg.id ? Check : Clipboard} tooltip="复制" onClick={() => onCopy(msg)} />
      <ActionBtn
        icon={speakingId === msg.id ? Square : Volume2}
        tooltip={speakingId === msg.id ? '停止播报' : '语音播报'}
        onClick={() => onSpeak(msg)}
      />
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
      <ActionBtn icon={Trash2} tooltip="删除" onClick={() => onDelete(msg)} />
    </div>
  );
}
