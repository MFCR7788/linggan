'use client';

import { useState, useRef } from 'react';

const GLOSSARY: Record<string, string> = {
  '种草': '用真实体验分享推荐产品，让消费者产生购买欲望的营销内容',
  '9宫格': '将9张图片拼成朋友圈九宫格形式展示，常用于产品营销',
  '分镜': '视频拍摄的镜头拆分方案，规划每个画面的内容、角度和顺序',
  '口播': '对着镜头说话的口述视频形式，常用于知识分享和产品介绍',
  '数字人': 'AI生成的虚拟人物形象，可代替真人出镜录制口播视频',
  '多平台分发': '将同一内容适配后发布到小红书、抖音、公众号等多个平台',
  '灵感库': '收藏和管理的素材中心，包含图片、视频、文案等创作素材',
  '9 宫格': '将9张图片拼成朋友圈九宫格形式展示，常用于产品营销',
};

interface Props {
  text: string;
  className?: string;
}

export function JargonTooltip({ text, className }: Props) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const explanation = GLOSSARY[text];

  if (!explanation) return <span className={className}>{text}</span>;

  return (
    <span
      ref={ref}
      className={className}
      style={{ position: 'relative', display: 'inline', cursor: 'help', borderBottom: '1px dashed rgba(156,163,175,0.5)' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {text}
      {show && (
        <span
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(30,30,40,0.95)',
            border: '1px solid rgba(139,92,246,0.4)',
            borderRadius: 8,
            padding: '6px 10px',
            color: '#E5E7EB',
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: 'nowrap',
            zIndex: 100,
            pointerEvents: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          {explanation}
        </span>
      )}
    </span>
  );
}
