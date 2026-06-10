'use client';

// 技能推荐卡片 — 在 Agent 空状态或输入时展示匹配的创作技能
// 用户点击卡片可直接启动对应的工作流

import { useState, useEffect, useCallback } from 'react';

export interface SkillRecommendation {
  name: string;
  displayName: string;
  score: number;
}

interface SkillRecommendCardsProps {
  /** 匹配的技能推荐列表 */
  recommendations?: SkillRecommendation[];
  /** 用户选择技能回调 */
  onSelect?: (skill: SkillRecommendation) => void;
  /** 是否正在加载 */
  loading?: boolean;
  /** 输入框内容变化时触发匹配（去抖） */
  inputValue?: string;
}

const DEFAULT_RECOMMENDATIONS: SkillRecommendation[] = [
  { name: 'ecom_xhs', displayName: '📱 小红书爆款笔记', score: 1 },
  { name: 'knowledge_oral', displayName: '🎙️ 口播知识日更', score: 1 },
  { name: 'startup_product', displayName: '🎁 产品种草一条龙', score: 1 },
  { name: 'personal_resonant', displayName: '💭 情感共鸣短文', score: 1 },
  { name: 'restaurant_9grid', displayName: '📸 探店9宫格', score: 1 },
  { name: 'travel_guide', displayName: '🗺️ 旅行攻略 Vlog', score: 1 },
];

export function SkillRecommendCards({
  recommendations,
  onSelect,
  loading = false,
}: SkillRecommendCardsProps) {
  const items = recommendations && recommendations.length > 0
    ? recommendations
    : DEFAULT_RECOMMENDATIONS;

  if (loading) {
    return (
      <div className="px-4 py-3">
        <p className="text-xs text-white/30 mb-2">正在匹配创作技能...</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-shrink-0 w-36 h-20 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <p className="text-xs text-white/30 mb-2">
        {recommendations && recommendations.length > 0 ? '推荐创作流程' : '试试这些'}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {items.slice(0, 8).map((skill) => (
          <button
            key={skill.name}
            onClick={() => onSelect?.(skill)}
            className="flex-shrink-0 px-3 py-2 rounded-xl text-left transition-all duration-200 hover:scale-[1.02] active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              minWidth: 140,
              maxWidth: 180,
            }}
          >
            <span className="text-sm text-white/90 leading-tight line-clamp-2">
              {skill.displayName}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Hook: 从 SSE 事件中提取技能推荐 */
export function useSkillRecommendations() {
  const [recommendations, setRecommendations] = useState<SkillRecommendation[]>([]);

  const processEvent = useCallback((event: { type: string; [key: string]: unknown }) => {
    if (event.type === 'skills_matched' && Array.isArray((event as any).recommendations)) {
      setRecommendations((event as any).recommendations);
    }
  }, []);

  const clear = useCallback(() => setRecommendations([]), []);

  return { recommendations, processEvent, clear };
}
