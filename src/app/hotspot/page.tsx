'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { syncDevAuthCookie, getDevUserIdHeader } from '@/lib/dev-auth';
import {
  Plus, Search, RefreshCw, TrendingUp, ChevronRight, X, Loader2, Activity,
  Flame, ExternalLink,
  Globe, MapPin, Settings, Zap,
  BarChart3, Trash2, Play, CheckCircle2,
} from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { ProtectedRoute, LoadingSpinner } from '@/components';
import { formatRelativeTime, getPlatformColor, PAGE_ROUTES } from '@/lib/style-constants';
import { PRESET_CATEGORIES } from '@/lib/preset-keywords';

// ─── 类型定义 ────────────────────────────────────────

interface HotspotItem {
  id: string; title: string; platform: string; original_url: string;
  original_content?: string; ai_summary?: string; relevance_reason?: string;
  relevance_score: number; importance_level: string; credibility_level: string;
  captured_at: string; published_at?: string; status: string;
  view_count?: number; like_count?: number; comment_count?: number; share_count?: number;
  author?: string; monitor_keyword_id?: string;
  key_points?: string[]; creation_suggestions?: string[]; tags?: string[];
  heatScore?: number; keyword?: string;
}

interface StatsData {
  total: number; today: number; urgent: number; unread: number;
  activeKeywords: number; lastCheckAt: string | null; bySource: Record<string, number>;
}

interface KeywordData {
  id: string; keyword: string; is_active: boolean; category: string | null;
  last_check_at: string | null; _count?: { hotspots: number }; hotspotCount?: number;
}

// ─── 常量 ────────────────────────────────────────────

const TABS = [
  { key: 'radar', label: '雷达', icon: <Activity size={14} /> },
  { key: 'keywords', label: '监控词', icon: <Settings size={14} /> },
  { key: 'search', label: '搜索', icon: <Search size={14} /> },
];

const IMPORTANCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: '紧急', color: '#EF4444', bg: 'rgba(239,68,68,0.25)' },
  high: { label: '重要', color: '#F97316', bg: 'rgba(249,115,22,0.2)' },
  medium: { label: '一般', color: '#FBBF24', bg: 'rgba(251,191,36,0.15)' },
  low: { label: '低', color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' },
};

const TIME_RANGES = [
  { key: '', label: '全部' }, { key: '1h', label: '1h' },
  { key: 'today', label: '今天' }, { key: '7d', label: '7天' },
];

const SORT_OPTIONS = [
  { key: 'captured_at', label: '捕获时间' }, { key: 'published_at', label: '发布时间' },
  { key: 'relevance_score', label: '相关度' }, { key: 'importance_level', label: '重要性' },
];

const REGION_OPTIONS = [
  { key: 'both', label: '全球+国内', icon: <Globe size={11} /> },
  { key: 'china', label: '仅国内', icon: <MapPin size={11} /> },
  { key: 'global', label: '仅全球', icon: <Globe size={11} /> },
];

const SOURCE_OPTIONS = ['全部', 'weibo', 'zhihu', 'bilibili', 'baidu', 'douyin', 'toutiao', 'sogou', 'bing', 'hackernews', 'twitter'];

// ─── 辅助函数 ────────────────────────────────────────

function getHeatLevel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: '爆', color: '#EF4444' };
  if (score >= 60) return { label: '热', color: '#F97316' };
  if (score >= 40) return { label: '温', color: '#FBBF24' };
  if (score >= 20) return { label: '凉', color: '#60A5FA' };
  return { label: '冷', color: '#9CA3AF' };
}

function formatCount(n: number | undefined): string {
  if (!n) return '0';
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

// ─── 紧凑热点卡片 ────────────────────────────────────

function HotspotCard({
  item, onViewDetail, onToInspiration, showKeyword,
}: {
  item: HotspotItem; onViewDetail: (id: string) => void; onToInspiration: (item: HotspotItem) => void;
  showKeyword?: boolean;
}) {
  const heat = getHeatLevel(item.heatScore || item.relevance_score || 0);
  const importanceConf = IMPORTANCE_CONFIG[item.importance_level] || IMPORTANCE_CONFIG.medium;

  return (
    <div
      className="rounded-lg p-3 cursor-pointer transition-all hover:bg-white/[0.04]"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* 第一行：重要性 + 来源 + 热度 */}
      <div className="flex items-center gap-1 mb-1 flex-wrap">
        <span className="px-1 rounded text-[9px] font-medium" style={{ background: importanceConf.bg, color: importanceConf.color }}>
          {importanceConf.label}
        </span>
        <span className="px-1 rounded text-[9px]" style={{ background: getPlatformColor(item.platform) + '22', color: getPlatformColor(item.platform) }}>
          {item.platform}
        </span>
        {showKeyword && item.keyword && (
          <span className="px-1 rounded text-[9px]" style={{ background: 'rgba(139,92,246,0.15)', color: '#C4B5FD' }}>{item.keyword}</span>
        )}
        <span className="ml-auto flex items-center gap-1" style={{ color: heat.color, fontSize: 10, fontWeight: 600 }}>
          {heat.label} {Math.round(item.heatScore || item.relevance_score || 0)}
        </span>
      </div>

      {/* 标题 */}
      <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }} className="line-clamp-1">
        {item.title}
      </p>

      {/* AI 摘要（1行） */}
      {item.ai_summary && (
        <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.4, marginBottom: 4 }} className="line-clamp-1">
          {item.ai_summary}
        </p>
      )}

      {/* 底部：时间 + 相关度 + 操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span style={{ color: '#6B7280', fontSize: 10 }}>
            {item.published_at ? formatRelativeTime(item.published_at) + ' · ' : ''}{formatRelativeTime(item.captured_at)}
          </span>
          <span className="px-1 rounded text-[10px]" style={{
            background: (item.relevance_score || 0) > 70 ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.1)',
            color: (item.relevance_score || 0) > 70 ? '#86EFAC' : '#FBBF24',
          }}>
            相关{item.relevance_score || '-'}%
          </span>
        </div>
        <div className="flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); onToInspiration(item); }}
            className="px-2 py-0.5 rounded text-[10px]"
            style={{ background: 'rgba(59,130,246,0.12)', color: '#93C5FD' }}>
            转灵感
          </button>
          <button onClick={(e) => { e.stopPropagation(); onViewDetail(item.id); }}
            className="px-2 py-0.5 rounded text-[10px]"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#D1D5DB' }}>
            详情
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 雷达 Tab ────────────────────────────────────────

function RadarTab({
  stats, hotspots, refreshing, selectionMode, selectedIds,
  source, setSource, monitorKeywordId, setMonitorKeywordId, keywords,
  importance, setImportance, timeRange, setTimeRange,
  sortBy, setSortBy, sortOrder, setSortOrder,
  onViewDetail, onToInspiration, onCheckNow, checking, onMarkAllRead,
  onToggleSelect, onDeleteSingle, onSelectAll, onExitSelection,
  onBatchDelete, onFilterDelete, page, setPage, totalCount, totalPages,
  activeFilter, setActiveFilter,
}: any) {
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 290px)' }}>
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { label: '新增', value: stats?.today ?? 0, color: '#3B82F6' },
          { label: '总计', value: stats?.total ?? 0, color: '#FFFFFF' },
          { label: '紧急', value: stats?.urgent ?? 0, color: '#EF4444' },
          { label: '未读', value: stats?.unread ?? 0, color: '#F59E0B' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg p-3 text-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ color, fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{value}</p>
            <p style={{ color: '#9CA3AF', fontSize: 10 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* 筛选标签: 总计 / 紧急 / 未读 */}
      <div className="flex gap-1 mb-2">
        {[
          { key: 'all', label: '总计', count: stats?.total },
          { key: 'urgent', label: '紧急', count: stats?.urgent, color: '#EF4444' },
          { key: 'unread', label: '未读', count: stats?.unread, color: '#F59E0B' },
        ].map(({ key, label, count, color }) => (
          <button key={key} onClick={() => { setActiveFilter(key); setPage(1); }}
            className="flex-1 py-1.5 rounded text-[12px] font-medium transition-all"
            style={{
              background: activeFilter === key
                ? (color ? color + '22' : 'rgba(255,255,255,0.1)')
                : 'rgba(255,255,255,0.03)',
              border: activeFilter === key
                ? `1px solid ${color ? color + '44' : 'rgba(255,255,255,0.2)'}`
                : '1px solid rgba(255,255,255,0.06)',
              color: activeFilter === key ? (color || '#E5E7EB') : '#9CA3AF',
            }}>
            {label}{count !== undefined ? ` ${count}` : ''}
          </button>
        ))}
      </div>

      {/* 来源分布 + 全部已读 */}
      <div className="flex items-center justify-between mb-2">
        {stats?.bySource && Object.keys(stats.bySource).length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto text-[10px] flex-1">
            {Object.entries(stats.bySource).slice(0, 8).map(([platform, count]) => (
              <span key={platform} className="flex-shrink-0 px-1.5 py-0.5 rounded"
                style={{ background: getPlatformColor(platform) + '18', color: getPlatformColor(platform) }}>
                {platform} {count as number}
              </span>
            ))}
          </div>
        )}
        {(stats?.unread ?? 0) > 0 && (
          <button onClick={onMarkAllRead}
            className="flex-shrink-0 px-2.5 py-1 rounded text-[11px] ml-2"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#FBBF24', border: '1px solid rgba(245,158,11,0.2)' }}>
            全部已读
          </button>
        )}
      </div>

      {/* 筛选排序 + 管理 - 紧凑一行 */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {/* 监控词下拉 */}
        <select value={monitorKeywordId} onChange={(e) => setMonitorKeywordId(e.target.value)}
          className="flex-shrink-0 px-2 py-1 rounded text-[11px] appearance-none"
          style={{ background: monitorKeywordId ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: monitorKeywordId ? '#C4B5FD' : '#9CA3AF' }}>
          <option value="">监控词</option>
          {keywords?.map((kw: any) => (
            <option key={kw.id} value={kw.id}>{kw.keyword}</option>
          ))}
        </select>
        {/* 来源下拉 */}
        <select value={source} onChange={(e) => setSource(e.target.value)}
          className="flex-shrink-0 px-2 py-1 rounded text-[11px] appearance-none"
          style={{ background: source ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: source ? '#93C5FD' : '#9CA3AF' }}>
          {SOURCE_OPTIONS.map((s) => <option key={s} value={s === '全部' ? '' : s}>{s === '全部' ? '来源' : s}</option>)}
        </select>
        {/* 重要性 */}
        {['urgent', 'high', 'medium', 'low'].map((level) => (
          <button key={level} onClick={() => setImportance(importance === level ? '' : level)}
            className="flex-shrink-0 px-2 py-1 rounded text-[11px]"
            style={{
              background: importance === level ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
              color: importance === level ? '#FCA5A5' : '#9CA3AF',
            }}>
            {IMPORTANCE_CONFIG[level]?.label}
          </button>
        ))}
        {/* 时间 */}
        {TIME_RANGES.filter(t => t.key).map(({ key, label }) => (
          <button key={key} onClick={() => setTimeRange(timeRange === key ? '' : key)}
            className="flex-shrink-0 px-2 py-1 rounded text-[11px]"
            style={{
              background: timeRange === key ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
              color: timeRange === key ? '#86EFAC' : '#9CA3AF',
            }}>
            {label}
          </button>
        ))}
        {/* 排序 */}
        <div className="flex items-center gap-0.5 ml-auto">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button key={key} onClick={() => { if (sortBy === key) setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); else { setSortBy(key); setSortOrder('desc'); } }}
              className="px-2 py-1 rounded text-[11px]"
              style={{ background: sortBy === key ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)', color: sortBy === key ? '#C4B5FD' : '#6B7280' }}>
              {label}{sortBy === key ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
            </button>
          ))}
          <button onClick={() => selectionMode ? onExitSelection() : onSelectAll()}
            className="px-2 py-1 rounded text-[11px]"
            style={{ background: selectionMode ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)', color: selectionMode ? '#FCA5A5' : '#6B7280' }}>
            {selectionMode ? '取消' : '管理'}
          </button>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selectionMode && (
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded mb-2 text-[11px]"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <span style={{ color: '#D1D5DB' }}>已选 {selectedIds?.size || 0} 项</span>
          <div className="flex gap-1.5">
            <button onClick={onFilterDelete} className="px-2 py-0.5 rounded" style={{ color: '#FBBF24', background: 'rgba(251,191,36,0.1)' }}>按筛选删</button>
            <button onClick={onBatchDelete} disabled={!selectedIds?.size}
              className="px-2 py-0.5 rounded" style={{ color: '#FCA5A5', background: 'rgba(239,68,68,0.12)', opacity: !selectedIds?.size ? 0.4 : 1 }}>删除选中</button>
          </div>
        </div>
      )}

      {/* 刷新指示器 */}
      {refreshing && (
        <div className="flex items-center justify-center py-0.5">
          <Loader2 size={12} className="animate-spin" color="#60A5FA" />
        </div>
      )}

      {/* 热点列表 - 自适应高度滚动 */}
      {hotspots.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 12 }}>暂无热点数据</p>
            <button onClick={onCheckNow} disabled={checking}
              className="px-4 py-2 rounded-lg text-xs flex items-center gap-2 mx-auto"
              style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.3)' }}>
              {checking ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {checking ? '扫描中...' : '立即扫描'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          {hotspots.map((item: HotspotItem) => (
            <div key={item.id}
              onClick={() => { if (!selectionMode) onViewDetail(item.id); }}
              className={selectionMode ? '' : 'cursor-pointer'}>
              <div className="flex items-start">
                {selectionMode && (
                  <button onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
                    className="flex-shrink-0 mt-2 ml-2 w-4 h-4 rounded flex items-center justify-center"
                    style={{
                      background: selectedIds?.has(item.id) ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${selectedIds?.has(item.id) ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.15)'}`,
                    }}>
                    {selectedIds?.has(item.id) && <CheckCircle2 size={10} color="#60A5FA" />}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <HotspotCard item={item} onViewDetail={onViewDetail} onToInspiration={onToInspiration} showKeyword />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 - 紧凑 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-1.5 text-[11px]">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
            className="px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.03)', color: page <= 1 ? '#4B5563' : '#E5E7EB' }}>上页</button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const start = Math.max(1, Math.min(page - 2, totalPages - 4));
            const p = start + i;
            if (p > totalPages) return null;
            return <button key={p} onClick={() => setPage(p)}
              className="px-2 py-0.5 rounded"
              style={{ background: p === page ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)', color: p === page ? '#93C5FD' : '#9CA3AF' }}>{p}</button>;
          })}
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
            className="px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.03)', color: page >= totalPages ? '#4B5563' : '#E5E7EB' }}>下页</button>
          <span style={{ color: '#6B7280', marginLeft: 4 }}>{totalCount}条</span>
        </div>
      )}
    </div>
  );
}

// ─── 监控词 Tab ──────────────────────────────────────

function KeywordsTab({
  keywords, selectedKeywordId, setSelectedKeywordId, keywordHotspots, loadingKeywordHotspots,
  showAddKeyword, setShowAddKeyword, newKeyword, setNewKeyword, addingKeyword,
  handleAddKeyword, handleToggleKeyword, handleDeleteKeyword, handleCheckNow, checking,
  onViewDetail, onToInspiration,
}: any) {
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 290px)' }}>
      {/* 操作栏 */}
      <div className="flex gap-1.5 mb-2">
        <button onClick={() => setShowAddKeyword(!showAddKeyword)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.3)' }}>
          <Plus size={14} /> 添加关键词
        </button>
        <button onClick={handleCheckNow} disabled={checking}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs"
          style={{ background: checking ? 'rgba(251,191,36,0.12)' : 'rgba(34,197,94,0.12)', border: checking ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(34,197,94,0.25)', color: checking ? '#FBBF24' : '#86EFAC' }}>
          {checking ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {checking ? '扫描中' : '立即扫描'}
        </button>
      </div>

      {/* 添加输入框 */}
      {showAddKeyword && (
        <div className="flex gap-1.5 mb-2">
          <input type="text" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
            placeholder="输入关键词..."
            className="flex-1 px-2.5 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E5E7EB', outline: 'none' }} autoFocus />
          <button onClick={() => handleAddKeyword()} disabled={addingKeyword || !newKeyword.trim()}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.3)' }}>
            {addingKeyword ? <Loader2 size={12} className="animate-spin" /> : '添加'}
          </button>
        </div>
      )}

      {/* 预设关键词联想 */}
      {showAddKeyword && (() => {
        const input = newKeyword.trim().toLowerCase();

        // 有输入：搜索匹配
        if (input) {
          const matchedPresets: { keyword: string; desc?: string; category: string; categoryName: string }[] = [];
          for (const cat of PRESET_CATEGORIES) {
            for (const pk of cat.keywords) {
              if (pk.keyword.toLowerCase().includes(input) || (pk.desc && pk.desc.includes(input))) {
                matchedPresets.push({ keyword: pk.keyword, desc: pk.desc, category: cat.id, categoryName: cat.name });
              }
            }
          }
          if (matchedPresets.length === 0) return null;
          return (
            <div className="mb-2 rounded-lg py-1 px-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ color: '#6B7280', fontSize: 9, marginBottom: 2 }}>匹配关键词 ({matchedPresets.length})</p>
              <div className="flex flex-wrap gap-1">
                {matchedPresets.slice(0, 12).map((pk) => {
                  const alreadyAdded = keywords.some((kw: any) => kw.keyword === pk.keyword);
                  return (
                    <button key={pk.keyword} onClick={() => !alreadyAdded && handleAddKeyword(pk.keyword)} disabled={alreadyAdded || addingKeyword}
                      className="px-1.5 py-0.5 rounded text-[11px]"
                      style={{ background: alreadyAdded ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', color: alreadyAdded ? '#6EE7B7' : '#9CA3AF', border: `1px solid ${alreadyAdded ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
                      {pk.keyword} {alreadyAdded ? '✓' : '+'}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        // 无输入：按分类展示全部预设
        return (
          <div className="mb-2 rounded-lg p-2 space-y-2 max-h-64 overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ color: '#6B7280', fontSize: 9 }}>预设监控词 · 点击快速添加</p>
            {PRESET_CATEGORIES.map((cat) => {
              const availableKeywords = cat.keywords.filter(pk => !keywords.some((kw: any) => kw.keyword === pk.keyword));
              if (availableKeywords.length === 0) return null;
              return (
                <div key={cat.id}>
                  <p style={{ color: '#9CA3AF', fontSize: 10, marginBottom: 4 }}>{cat.name}</p>
                  <div className="flex flex-wrap gap-1">
                    {cat.keywords.map((pk) => {
                      const alreadyAdded = keywords.some((kw: any) => kw.keyword === pk.keyword);
                      return (
                        <button key={pk.keyword} onClick={() => !alreadyAdded && handleAddKeyword(pk.keyword)} disabled={alreadyAdded || addingKeyword}
                          className="px-1.5 py-0.5 rounded text-[11px]"
                          style={{ background: alreadyAdded ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', color: alreadyAdded ? '#6EE7B7' : '#9CA3AF', border: `1px solid ${alreadyAdded ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
                          {pk.keyword} {alreadyAdded ? '✓' : '+'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* 双栏：关键词列表 + 选中关键词热点 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* 关键词列表 */}
        <div className="mb-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span style={{ color: '#9CA3AF', fontSize: 11 }}>监控词 ({keywords.length})</span>
          </div>
          {keywords.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5">
              {keywords.map((kw: any) => (
                <div key={kw.id}
                  onClick={() => setSelectedKeywordId(selectedKeywordId === kw.id ? null : kw.id)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all min-w-0"
                  style={{
                    background: selectedKeywordId === kw.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${selectedKeywordId === kw.id ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                  <button onClick={(e) => { e.stopPropagation(); handleToggleKeyword(kw.id, kw.is_active); }}
                    className="w-7 h-4 rounded-full relative flex-shrink-0"
                    style={{ background: kw.is_active ? 'rgba(34,197,94,0.3)' : 'rgba(107,114,128,0.3)' }}>
                    <div className="w-3 h-3 rounded-full absolute top-0.5 transition-all"
                      style={{ background: kw.is_active ? '#22C55E' : '#6B7280', left: kw.is_active ? 13 : 1 }} />
                  </button>
                  <span style={{ color: kw.is_active ? '#E5E7EB' : '#6B7280', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kw.keyword}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteKeyword(kw.id); }} className="flex-shrink-0 ml-1">
                    <Trash2 size={12} color="#4B5563" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#6B7280', fontSize: 11, textAlign: 'center', padding: 12 }}>暂无监控关键词</p>
          )}
        </div>

        {/* 选中关键词的热点 */}
        {selectedKeywordId && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <span style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>关联热点</span>
            {loadingKeywordHotspots ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={16} color="#6B7280" className="animate-spin" /></div>
            ) : keywordHotspots.length === 0 ? (
              <p style={{ color: '#6B7280', fontSize: 11, textAlign: 'center', padding: 16 }}>暂无该关键词的热点</p>
            ) : (
              <div className="flex-1 overflow-y-auto rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                {keywordHotspots.map((item: HotspotItem) => (
                  <div key={item.id} onClick={() => onViewDetail(item.id)} className="cursor-pointer">
                    <HotspotCard item={item} onViewDetail={onViewDetail} onToInspiration={onToInspiration} showKeyword />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 搜索 Tab ────────────────────────────────────────

function SearchTab({
  searchQuery, setSearchQuery, searchRegion, setSearchRegion, searchResultsPerSource, setSearchResultsPerSource,
  searchResults, searching, handleSearch,
}: any) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 290px)' }}>
      {/* 搜索表单 - 紧凑 */}
      <div className="flex gap-1.5 mb-2">
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="输入关键词搜索全平台..."
          className="flex-1 px-3 py-2 rounded-lg text-sm"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E5E7EB', outline: 'none' }} />
        <button onClick={handleSearch} disabled={searching || !searchQuery.trim()}
          className="px-3 py-2 rounded-lg text-sm flex items-center gap-1"
          style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.3)' }}>
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}搜索
        </button>
      </div>

      {/* 区域 + 每来源条数 */}
      <div className="flex items-center gap-3 mb-2 text-[11px]">
        <div className="flex items-center gap-1">
          <span style={{ color: '#6B7280' }}>区域:</span>
          {REGION_OPTIONS.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setSearchRegion(key)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded"
              style={{
                background: searchRegion === key ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                color: searchRegion === key ? '#93C5FD' : '#9CA3AF',
              }}>{icon} {label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span style={{ color: '#6B7280' }}>条数:</span>
          {[3, 5, 8, 10].map((n) => (
            <button key={n} onClick={() => setSearchResultsPerSource(n)}
              className="px-1.5 py-0.5 rounded"
              style={{ background: searchResultsPerSource === n ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)', color: searchResultsPerSource === n ? '#C4B5FD' : '#9CA3AF' }}>{n}</button>
          ))}
        </div>
      </div>

      {/* 搜索结果 */}
      {searchResults.length > 0 ? (
        <div className="flex-1 overflow-y-auto">
          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>搜索 &ldquo;{searchQuery}&rdquo; · {searchResults.length} 条</p>
          <div className="space-y-1.5">
            {searchResults.map((r: any, i: number) => {
              const isExpanded = expandedIdx === i;
              return (
                <div key={i}
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  className="rounded-lg p-3 cursor-pointer transition-all hover:bg-white/[0.06]"
                  style={{ background: isExpanded ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isExpanded ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}` }}>
                  {/* 头部：来源 + 标签 */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="px-1 rounded text-[10px]" style={{ background: getPlatformColor(r.source) + '22', color: getPlatformColor(r.source) }}>{r.source}</span>
                    {r.analysis?.relevance && (
                      <span className="px-1 rounded text-[10px]" style={{ background: r.analysis.relevance > 70 ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.1)', color: r.analysis.relevance > 70 ? '#86EFAC' : '#FBBF24' }}>
                        相关{r.analysis.relevance}%</span>
                    )}
                    {r.analysis?.importance && (
                      <span className="px-1 rounded text-[10px]" style={{ background: IMPORTANCE_CONFIG[r.analysis.importance]?.bg || 'rgba(156,163,175,0.1)', color: IMPORTANCE_CONFIG[r.analysis.importance]?.color || '#9CA3AF' }}>
                        {IMPORTANCE_CONFIG[r.analysis.importance]?.label || r.analysis.importance}</span>
                    )}
                    <span className="ml-auto text-[10px]" style={{ color: '#6B7280' }}>
                      {isExpanded ? '收起 ▲' : '展开 ▼'}
                    </span>
                  </div>

                  {/* 标题 */}
                  <a href={r.url || '#'} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="block mb-1 hover:underline"
                    style={{ color: '#93C5FD', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                    {r.title} <ExternalLink size={10} className="inline" />
                  </a>

                  {/* 摘要 / 内容 */}
                  {(r.analysis?.summary || r.content) && (
                    <p style={{ color: isExpanded ? '#D1D5DB' : '#9CA3AF', fontSize: 11, lineHeight: 1.5 }}
                      className={isExpanded ? '' : 'line-clamp-2'}>
                      {r.analysis?.summary || r.content}
                    </p>
                  )}

                  {/* 展开详情 */}
                  {isExpanded && (
                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {/* 完整原文 */}
                      {r.content && r.analysis?.summary && r.content !== r.analysis.summary && (
                        <div className="mb-2">
                          <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 2 }}>原文内容</p>
                          <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.content}</p>
                        </div>
                      )}

                      {/* AI 分析详情 */}
                      {r.analysis && (
                        <div className="mb-2">
                          <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>AI 分析</p>
                          <div className="flex flex-wrap gap-1 mb-1">
                            {r.analysis.relevance && (
                              <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(34,197,94,0.1)', color: '#86EFAC' }}>相关度 {r.analysis.relevance}%</span>
                            )}
                            {r.analysis.importance && (
                              <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: IMPORTANCE_CONFIG[r.analysis.importance]?.bg, color: IMPORTANCE_CONFIG[r.analysis.importance]?.color }}>{IMPORTANCE_CONFIG[r.analysis.importance]?.label}</span>
                            )}
                            {r.analysis.keyPoints?.length > 0 && r.analysis.keyPoints.map((kp: string, ki: number) => (
                              <span key={ki} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(139,92,246,0.1)', color: '#C4B5FD' }}>{kp}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 操作按钮 */}
                      <div className="flex gap-1.5">
                        <a href={r.url || '#'} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px]"
                          style={{ background: 'rgba(59,130,246,0.12)', color: '#93C5FD' }}>
                          <ExternalLink size={11} /> 打开原文
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        !searching && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Search size={32} color="#4B5563" />
              <p style={{ color: '#6B7280', fontSize: 13, marginTop: 8 }}>输入关键词搜索全平台热点</p>
              <p style={{ color: '#4B5563', fontSize: 11, marginTop: 2 }}>覆盖微博、知乎、B站、百度、抖音等平台</p>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ─── 主内容组件 ──────────────────────────────────────

function HotspotRadarInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'radar';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [source, setSource] = useState('');
  const [monitorKeywordId, setMonitorKeywordId] = useState('');
  const [importance, setImportance] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [sortBy, setSortBy] = useState('captured_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [keywordHotspots, setKeywordHotspots] = useState<HotspotItem[]>([]);
  const [loadingKeywordHotspots, setLoadingKeywordHotspots] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [addingKeyword, setAddingKeyword] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchRegion, setSearchRegion] = useState('both');
  const [searchResultsPerSource, setSearchResultsPerSource] = useState(3);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const [showAddKeyword, setShowAddKeyword] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'urgent' | 'unread'>('all');

  const authHeaders = getDevUserIdHeader();

  // ─── 数据获取 ────────────────────────────────────

  const fetchData = useCallback(async () => {
    syncDevAuthCookie();
    try {
      const [statsRes, hotspotRes, kwRes] = await Promise.all([
        fetch('/api/hotspot/stats', { headers: { ...authHeaders } }),
        fetch(`/api/hotspot?limit=20&page=${page}&source=${source}&monitorKeywordId=${monitorKeywordId}&importance=${importance}${activeFilter === 'urgent' ? (importance ? '' : 'urgent,high') : ''}&timeRange=${timeRange}&sortBy=${sortBy}&sortOrder=${sortOrder}${activeFilter === 'unread' ? '&isRead=false' : ''}`, { headers: { ...authHeaders } }),
        fetch('/api/keywords?limit=50', { headers: { ...authHeaders } }),
      ]);
      const statsData = await statsRes.json();
      if (statsData.success) setStats(statsData.data);
      const hotspotData = await hotspotRes.json();
      if (hotspotData.success) {
        setHotspots(hotspotData.data || []);
        setTotalCount(hotspotData.pagination?.total || 0);
        setTotalPages(hotspotData.pagination?.totalPages || 0);
      }
      const kwData = await kwRes.json();
      if (kwData.success) {
        setKeywords((kwData.data || []).map((kw: any) => ({ ...kw, hotspotCount: kw._count?.hotspots || 0 })));
      }
    } catch (e) {
      console.error('获取数据失败:', e);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [page, source, monitorKeywordId, importance, timeRange, sortBy, sortOrder, activeFilter]);

  // ─── 选择/删除操作 ─────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const selectAll = () => {
    if (selectionMode) exitSelectionMode();
    else { setSelectionMode(true); setSelectedIds(new Set(hotspots.map((h) => h.id))); }
  };

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedIds(new Set()); };

  const handleDeleteSingle = async (id: string) => {
    syncDevAuthCookie();
    try {
      const res = await fetch(`/api/hotspot/${id}`, { method: 'DELETE', headers: { ...authHeaders } });
      const data = await res.json();
      if (res.ok) {
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
        setToast({ type: 'success', message: '已删除' });
        fetchData();
      } else {
        setToast({ type: 'error', message: data.error || '删除失败' });
      }
    } catch { setToast({ type: 'error', message: '网络错误' }); }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 条热点吗？此操作不可撤销。`)) return;
    syncDevAuthCookie();
    try {
      const res = await fetch('/api/hotspot/batch-delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ ids: [...selectedIds] }) });
      const data = await res.json();
      if (res.ok) {
        exitSelectionMode();
        setToast({ type: 'success', message: `已删除 ${data.data?.deleted || selectedIds.size} 条` });
        fetchData();
      } else {
        setToast({ type: 'error', message: data.error || '批量删除失败' });
      }
    } catch { setToast({ type: 'error', message: '网络错误' }); }
  };

  const handleFilterDelete = async () => {
    if (!confirm('确定要删除当前筛选条件下的所有热点吗？此操作不可撤销。')) return;
    syncDevAuthCookie();
    try {
      const res = await fetch('/api/hotspot/batch-delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ filters: { platform: source || undefined, importance: importance || undefined, timeRange: timeRange || undefined } }) });
      const data = await res.json();
      if (res.ok) {
        setToast({ type: 'success', message: `已删除 ${data.data?.deleted || 0} 条` });
        fetchData();
      } else {
        setToast({ type: 'error', message: data.error || '删除失败' });
      }
    } catch { setToast({ type: 'error', message: '网络错误' }); }
  };

  useEffect(() => {
    if (initialLoading) fetchData();
    else { setRefreshing(true); fetchData(); }
  }, [fetchData]);

  // 关键词热点
  useEffect(() => {
    if (!selectedKeywordId || activeTab !== 'keywords') return;
    setLoadingKeywordHotspots(true);
    syncDevAuthCookie();
    fetch(`/api/hotspot?limit=20&sortBy=captured_at&sortOrder=desc`, { headers: { ...authHeaders } })
      .then((res) => res.json())
      .then((data) => { if (data.success) setKeywordHotspots((data.data || []).filter((h: any) => h.monitor_keyword_id === selectedKeywordId)); })
      .finally(() => setLoadingKeywordHotspots(false));
  }, [selectedKeywordId, activeTab]);

  // ─── 操作 ────────────────────────────────────────

  const handleNavigate = (page: PageKey) => { router.push(PAGE_ROUTES[page] || '/home'); };

  const handleMarkAllRead = async () => {
    syncDevAuthCookie();
    try { await fetch('/api/hotspot/mark-read', { method: 'POST', headers: { ...authHeaders } }); fetchData(); } catch { console.error('全部标为已读失败'); }
  };

  const handleCheckNow = async () => {
    setChecking(true); setCheckResult(null);
    syncDevAuthCookie();
    try {
      const res = await fetch('/api/keywords/check', { method: 'POST', headers: { ...authHeaders } });
      const data = await res.json();
      if (data.success) { setCheckResult(`发现 ${data.data.newHotspots} 条新热点`); await fetchData(); }
      else setCheckResult('检查失败');
    } catch { setCheckResult('网络错误'); }
    finally { setChecking(false); setTimeout(() => setCheckResult(null), 3000); }
  };

  const handleAddKeyword = async (keywordText?: string) => {
    const kw = (keywordText || newKeyword).trim();
    if (!kw) return;
    setAddingKeyword(true);
    if (keywordText) setNewKeyword(keywordText);
    syncDevAuthCookie();
    try {
      let platforms: string[] | undefined;
      for (const cat of PRESET_CATEGORIES) {
        const found = cat.keywords.find(k => k.keyword === kw);
        if (found) { platforms = found.platforms; break; }
      }
      const res = await fetch('/api/keywords', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ keyword: kw, platforms }) });
      const data = await res.json();
      if (data.success) {
        // 乐观更新：立刻插入关键词列表，不等 fetchData 异步返回
        const inheritedCount = data.data?.inheritedHotspots || 0;
        const newKw: any = {
          id: data.data.id, keyword: kw, is_active: true,
          category: data.data.category || null,
          last_check_at: null, hotspotCount: inheritedCount,
        };
        setKeywords((prev: any) => [newKw, ...prev]);
        setNewKeyword(''); setShowAddKeyword(false);
        // 后台同步完整数据
        fetchData();
        const msg = data.message || '关键词添加成功';
        setCheckResult(msg);
        setTimeout(() => setCheckResult(null), 3000);
      }
      else if (res.status !== 409) console.error('添加关键词失败:', data.error);
    } catch (err) { console.error('添加关键词网络错误:', err); }
    finally { setAddingKeyword(false); }
  };

  const handleToggleKeyword = async (id: string, currentActive: boolean) => {
    syncDevAuthCookie();
    try { await fetch(`/api/keywords/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ is_active: !currentActive }) }); fetchData(); } catch { setToast({ type: 'error', message: '操作失败' }); }
  };

  const handleDeleteKeyword = async (id: string) => {
    syncDevAuthCookie();
    try { await fetch(`/api/keywords/${id}`, { method: 'DELETE', headers: { ...authHeaders } }); if (selectedKeywordId === id) setSelectedKeywordId(null); fetchData(); } catch { setToast({ type: 'error', message: '删除失败' }); }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    syncDevAuthCookie();
    try {
      const res = await fetch('/api/hotspot/search', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ query: searchQuery.trim(), region: searchRegion, resultsPerSource: searchResultsPerSource }) });
      const data = await res.json();
      if (data.success) setSearchResults(data.data.results || []);
    } catch { setToast({ type: 'error', message: '搜索失败' }); }
    finally { setSearching(false); }
  };

  const handleToInspiration = async (item: HotspotItem) => {
    syncDevAuthCookie();
    try {
      const res = await fetch('/api/inspiration', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ type: 'link', title: item.title?.substring(0, 100) || '热点灵感', original_text: item.original_content || item.ai_summary || '', summary: item.ai_summary || '', source_url: item.original_url || '', source_platform: item.platform || '', tags: [item.platform, item.importance_level].filter(Boolean) }) });
      if (res.ok) { setCheckResult('已保存到灵感库'); setTimeout(() => setCheckResult(null), 2000); }
      else { setToast({ type: 'error', message: '保存失败' }); }
    } catch { setToast({ type: 'error', message: '保存失败，请重试' }); }
  };

  const handleViewDetail = (id: string) => { router.push(`/hotspot/detail?id=${id}`); };

  // ─── 渲染 ────────────────────────────────────────

  if (initialLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <LoadingSpinner text="加载热点雷达..." />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopNav
        title="热点雷达"
        right={
          <button className="p-1" onClick={handleCheckNow} disabled={checking} title="立即扫描">
            {checking ? <Loader2 size={18} color="#FBBF24" className="animate-spin" /> : <RefreshCw size={18} color="#E5E7EB" />}
          </button>
        }
      />

      <div className="flex-1 flex flex-col overflow-hidden px-4 pt-4">
        {/* 监控状态条 */}
        <div className="flex items-center justify-between px-3 py-2 rounded-lg mb-2 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${stats?.activeKeywords ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
            <span style={{ color: stats?.activeKeywords ? '#22C55E' : '#9CA3AF', fontSize: 11 }}>
              {stats?.activeKeywords ? `${stats.activeKeywords}词监控中` : '未监控'}
            </span>
            {stats?.lastCheckAt && (
              <span style={{ color: '#6B7280', fontSize: 10 }}>· {formatRelativeTime(stats.lastCheckAt)}</span>
            )}
          </div>
          <span style={{ color: '#6B7280', fontSize: 10 }}>每30分钟</span>
        </div>

        {/* 提示信息 */}
        {toast && (
          <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 mb-2 flex-shrink-0"
            style={{
              background: toast.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              color: toast.type === 'success' ? '#86EFAC' : '#FCA5A5',
            }}>
            {toast.type === 'success' ? <CheckCircle2 size={14} /> : <X size={14} />} {toast.message}
          </div>
        )}
        {checkResult && (
          <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 mb-2 flex-shrink-0"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#86EFAC' }}>
            <CheckCircle2 size={14} /> {checkResult}
          </div>
        )}

        {/* Tab 切换 */}
        <div className="flex rounded-lg p-0.5 mb-2 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {TABS.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs transition-all"
              style={{ background: activeTab === key ? 'rgba(59,130,246,0.2)' : 'transparent', color: activeTab === key ? '#93C5FD' : '#9CA3AF', fontWeight: activeTab === key ? 600 : 400 }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Tab 内容区 - 自适应高度 */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'radar' && (
            <RadarTab
              stats={stats} hotspots={hotspots} refreshing={refreshing}
              selectionMode={selectionMode} selectedIds={selectedIds}
              source={source} setSource={setSource} monitorKeywordId={monitorKeywordId} setMonitorKeywordId={setMonitorKeywordId} keywords={keywords}
              importance={importance} setImportance={setImportance}
              timeRange={timeRange} setTimeRange={setTimeRange}
              sortBy={sortBy} setSortBy={setSortBy} sortOrder={sortOrder} setSortOrder={setSortOrder}
              onViewDetail={handleViewDetail} onToInspiration={handleToInspiration}
              onCheckNow={handleCheckNow} checking={checking} onMarkAllRead={handleMarkAllRead}
              onToggleSelect={toggleSelect} onDeleteSingle={handleDeleteSingle}
              onSelectAll={selectAll} onExitSelection={exitSelectionMode}
              onBatchDelete={handleBatchDelete} onFilterDelete={handleFilterDelete}
              page={page} setPage={setPage} totalCount={totalCount} totalPages={totalPages}
              activeFilter={activeFilter} setActiveFilter={setActiveFilter}
            />
          )}
          {activeTab === 'keywords' && (
            <KeywordsTab
              keywords={keywords} selectedKeywordId={selectedKeywordId} setSelectedKeywordId={setSelectedKeywordId}
              keywordHotspots={keywordHotspots} loadingKeywordHotspots={loadingKeywordHotspots}
              showAddKeyword={showAddKeyword} setShowAddKeyword={setShowAddKeyword}
              newKeyword={newKeyword} setNewKeyword={setNewKeyword} addingKeyword={addingKeyword}
              handleAddKeyword={handleAddKeyword} handleToggleKeyword={handleToggleKeyword}
              handleDeleteKeyword={handleDeleteKeyword} handleCheckNow={handleCheckNow} checking={checking}
              onViewDetail={handleViewDetail} onToInspiration={handleToInspiration}
            />
          )}
          {activeTab === 'search' && (
            <SearchTab
              searchQuery={searchQuery} setSearchQuery={setSearchQuery}
              searchRegion={searchRegion} setSearchRegion={setSearchRegion}
              searchResultsPerSource={searchResultsPerSource} setSearchResultsPerSource={setSearchResultsPerSource}
              searchResults={searchResults} searching={searching} handleSearch={handleSearch}
            />
          )}
        </div>
      </div>

      <BottomNav activePage="hotspot" onNavigate={handleNavigate} />
    </div>
  );
}

export default function HotspotRadarPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="h-screen flex items-center justify-center"><LoadingSpinner text="加载中..." /></div>}>
        <HotspotRadarInner />
      </Suspense>
    </ProtectedRoute>
  );
}
