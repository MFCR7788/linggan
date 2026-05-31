'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { syncDevAuthCookie, getDevUserIdHeader } from '@/lib/dev-auth';
import {
  Plus, Search, RefreshCw, TrendingUp, ChevronRight, X, Loader2, Activity,
  Shield, ShieldAlert, Flame, ExternalLink, ChevronDown, ChevronUp,
  Globe, MapPin, Settings, Clock, Zap, Eye, ThumbsUp, MessageCircle, Share2,
  BarChart3, Filter, ArrowUpDown, Trash2, Power, PowerOff, Play, CheckCircle2,
} from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { ProtectedRoute, LoadingSpinner } from '@/components';
import { formatRelativeTime, getPlatformColor, PAGE_ROUTES } from '@/lib/style-constants';

// ─── 类型定义 ────────────────────────────────────────

interface HotspotItem {
  id: string;
  title: string;
  platform: string;
  original_url: string;
  original_content?: string;
  ai_summary?: string;
  relevance_reason?: string;
  relevance_score: number;
  importance_level: string;
  credibility_level: string;
  captured_at: string;
  published_at?: string;
  status: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  author?: string;
  monitor_keyword_id?: string;
  key_points?: string[];
  creation_suggestions?: string[];
  tags?: string[];
  heatScore?: number;
  keyword?: string;
}

interface StatsData {
  total: number;
  today: number;
  urgent: number;
  unread: number;
  activeKeywords: number;
  lastCheckAt: string | null;
  bySource: Record<string, number>;
}

interface KeywordData {
  id: string;
  keyword: string;
  is_active: boolean;
  category: string | null;
  last_check_at: string | null;
  _count?: { hotspots: number };
  hotspotCount?: number;
}

// ─── 常量 ────────────────────────────────────────────

const TABS = [
  { key: 'radar', label: '热点雷达', icon: <Activity size={14} /> },
  { key: 'keywords', label: '监控词', icon: <Settings size={14} /> },
  { key: 'search', label: '搜索', icon: <Search size={14} /> },
];

const IMPORTANCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: '紧急', color: '#EF4444', bg: 'rgba(239,68,68,0.25)' },
  high: { label: '重要', color: '#F97316', bg: 'rgba(249,115,22,0.2)' },
  medium: { label: '一般', color: '#FBBF24', bg: 'rgba(251,191,36,0.15)' },
  low: { label: '低', color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' },
};

const CREDIBILITY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  green: { label: '可信', color: '#22C55E', icon: <Shield size={12} /> },
  yellow: { label: '存疑', color: '#FBBF24', icon: <ShieldAlert size={12} /> },
  red: { label: '可疑', color: '#EF4444', icon: <ShieldAlert size={12} /> },
};

const TIME_RANGES = [
  { key: '', label: '全部' },
  { key: '1h', label: '1小时' },
  { key: 'today', label: '今天' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' },
];

const SORT_OPTIONS = [
  { key: 'captured_at', label: '捕获时间' },
  { key: 'published_at', label: '发布时间' },
  { key: 'relevance_score', label: '相关度' },
  { key: 'importance_level', label: '重要性' },
];

const REGION_OPTIONS = [
  { key: 'both', label: '全球+国内', icon: <Globe size={12} /> },
  { key: 'china', label: '仅国内', icon: <MapPin size={12} /> },
  { key: 'global', label: '仅全球', icon: <Globe size={12} /> },
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

// ─── 热点卡片组件 ────────────────────────────────────

function HotspotCard({
  item,
  onViewDetail,
  onToInspiration,
  showKeyword,
}: {
  item: HotspotItem;
  onViewDetail: (id: string) => void;
  onToInspiration: (item: HotspotItem) => void;
  showKeyword?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const heat = getHeatLevel(item.heatScore || item.relevance_score || 0);
  const importanceConf = IMPORTANCE_CONFIG[item.importance_level] || IMPORTANCE_CONFIG.medium;
  const credConf = CREDIBILITY_CONFIG[item.credibility_level] || CREDIBILITY_CONFIG.yellow;

  return (
    <GlassCard className="!p-4">
      {/* 顶部标签行 */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {/* 重要性 */}
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-0.5"
          style={{ background: importanceConf.bg, color: importanceConf.color }}
        >
          <Flame size={10} /> {importanceConf.label}
        </span>

        {/* 来源 */}
        <span
          className="px-1.5 py-0.5 rounded text-[10px]"
          style={{ background: getPlatformColor(item.platform) + '22', color: getPlatformColor(item.platform) }}
        >
          {item.platform}
        </span>

        {/* 可信度 */}
        <span
          className="px-1.5 py-0.5 rounded text-[10px] flex items-center gap-0.5"
          style={{ background: credConf.color + '22', color: credConf.color }}
        >
          {credConf.icon} {credConf.label}
        </span>

        {/* 关键词 */}
        {showKeyword && item.keyword && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px]"
            style={{ background: 'rgba(139,92,246,0.2)', color: '#C4B5FD' }}
          >
            {item.keyword}
          </span>
        )}

        {/* 热度 */}
        <div className="flex items-center gap-0.5 ml-auto">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="w-1 h-2.5 rounded-full"
                style={{
                  background: i <= Math.round((item.heatScore || item.relevance_score || 50) / 20)
                    ? heat.color : 'rgba(255,255,255,0.1)',
                }}
              />
            ))}
          </div>
          <span style={{ color: heat.color, fontSize: 10, fontWeight: 700, marginLeft: 4 }}>
            {heat.label} {Math.round(item.heatScore || item.relevance_score || 0)}
          </span>
        </div>
      </div>

      {/* 标题 */}
      <a
        href={item.original_url || '#'}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="block mb-2 group"
      >
        <p
          style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}
          className="group-hover:underline"
        >
          {item.title}
          <ExternalLink size={12} className="inline ml-1 opacity-0 group-hover:opacity-100" color="#3B82F6" />
        </p>
      </a>

      {/* AI 摘要 */}
      {item.ai_summary && (
        <p style={{ color: '#D1D5DB', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }} className="line-clamp-2">
          {item.ai_summary}
        </p>
      )}

      {/* 互动数据 */}
      <div className="flex items-center gap-3 mb-2" style={{ color: '#6B7280', fontSize: 11 }}>
        {item.view_count ? (
          <span className="flex items-center gap-0.5"><Eye size={11} /> {formatCount(item.view_count)}</span>
        ) : null}
        {item.like_count ? (
          <span className="flex items-center gap-0.5"><ThumbsUp size={11} /> {formatCount(item.like_count)}</span>
        ) : null}
        {item.comment_count ? (
          <span className="flex items-center gap-0.5"><MessageCircle size={11} /> {formatCount(item.comment_count)}</span>
        ) : null}
        {item.share_count ? (
          <span className="flex items-center gap-0.5"><Share2 size={11} /> {formatCount(item.share_count)}</span>
        ) : null}
      </div>

      {/* 底部：时间 + 相关度 + 操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: '#6B7280', fontSize: 11 }}>
            {item.published_at ? formatRelativeTime(item.published_at) : ''}
            {item.published_at && ' · '}
            {formatRelativeTime(item.captured_at)}
          </span>
          <span
            className="px-1 py-0.5 rounded text-[10px]"
            style={{
              background: (item.relevance_score || 0) > 70 ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.12)',
              color: (item.relevance_score || 0) > 70 ? '#86EFAC' : '#FBBF24',
            }}
          >
            相关 {item.relevance_score || 'N/A'}%
          </span>
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px]"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#9CA3AF' }}
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {expanded ? '收起' : '详情'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToInspiration(item); }}
            className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px]"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD' }}
          >
            <TrendingUp size={10} /> 转灵感
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onViewDetail(item.id); }}
            className="px-1.5 py-1 rounded text-[10px]"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#E5E7EB' }}
          >
            查看
          </button>
        </div>
      </div>

      {/* 扩展详情 */}
      {expanded && (
        <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {/* AI 相关性分析 */}
          {item.relevance_reason && (
            <div>
              <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>AI 相关性分析</p>
              <p style={{ color: '#D1D5DB', fontSize: 11, lineHeight: 1.6 }}>{item.relevance_reason}</p>
            </div>
          )}
          {/* 关键要点 */}
          {item.key_points && item.key_points.length > 0 && (
            <div>
              <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>关键要点</p>
              <ul className="list-disc pl-4 space-y-1">
                {item.key_points.map((p, i) => (
                  <li key={i} style={{ color: '#D1D5DB', fontSize: 11 }}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {/* 创作建议 */}
          {item.creation_suggestions && item.creation_suggestions.length > 0 && (
            <div>
              <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>创作建议</p>
              <ul className="space-y-1">
                {item.creation_suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-1" style={{ color: '#D1D5DB', fontSize: 11 }}>
                    <span style={{ color: '#3B82F6' }}>→</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* 原文 */}
          {item.original_content && (
            <div>
              <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>原文内容</p>
              <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.6 }} className="line-clamp-6">
                {item.original_content}
              </p>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ─── 筛选排序栏 ──────────────────────────────────────

function FilterSortBar({
  source, setSource, importance, setImportance,
  timeRange, setTimeRange, credibility, setCredibility,
  sortBy, setSortBy, sortOrder, setSortOrder,
  sourceOptions,
}: {
  source: string; setSource: (v: string) => void;
  importance: string; setImportance: (v: string) => void;
  timeRange: string; setTimeRange: (v: string) => void;
  credibility: string; setCredibility: (v: string) => void;
  sortBy: string; setSortBy: (v: string) => void;
  sortOrder: string; setSortOrder: (v: string) => void;
  sourceOptions: string[];
}) {
  return (
    <div className="space-y-2">
      {/* 筛选行 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {/* 来源 */}
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="flex-shrink-0 px-2 py-1 rounded-lg text-[11px] appearance-none cursor-pointer"
          style={{ background: source ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: source ? '#93C5FD' : '#9CA3AF' }}
        >
          {sourceOptions.map((s) => (
            <option key={s} value={s === '全部' ? '' : s}>{s === '全部' ? '全部来源' : s}</option>
          ))}
        </select>

        {/* 重要性 */}
        {['', 'urgent', 'high', 'medium', 'low'].map((level) => (
          <button
            key={level}
            onClick={() => setImportance(importance === level ? '' : level)}
            className="flex-shrink-0 px-2 py-1 rounded-lg text-[11px] transition-all"
            style={{
              background: importance === level ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)',
              border: importance === level ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.12)',
              color: importance === level ? '#FCA5A5' : '#9CA3AF',
            }}
          >
            {level ? IMPORTANCE_CONFIG[level]?.label : '全部级别'}
          </button>
        ))}

        {/* 时间范围 */}
        {TIME_RANGES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTimeRange(timeRange === key ? '' : key)}
            className="flex-shrink-0 px-2 py-1 rounded-lg text-[11px] transition-all"
            style={{
              background: timeRange === key ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.07)',
              border: timeRange === key ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.12)',
              color: timeRange === key ? '#86EFAC' : '#9CA3AF',
            }}
          >
            {label}
          </button>
        ))}

        {/* 可信度 */}
        {['', 'green', 'yellow', 'red'].map((level) => (
          <button
            key={level}
            onClick={() => setCredibility(credibility === level ? '' : level)}
            className="flex-shrink-0 px-2 py-1 rounded-lg text-[11px] transition-all flex items-center gap-1"
            style={{
              background: credibility === level ? (CREDIBILITY_CONFIG[level]?.color || '#3B82F6') + '22' : 'rgba(255,255,255,0.07)',
              border: credibility === level ? '1px solid ' + (CREDIBILITY_CONFIG[level]?.color || '#3B82F6') + '44' : '1px solid rgba(255,255,255,0.12)',
              color: credibility === level ? CREDIBILITY_CONFIG[level]?.color || '#93C5FD' : '#9CA3AF',
            }}
          >
            {level ? CREDIBILITY_CONFIG[level]?.label : '可信度'}
          </button>
        ))}
      </div>

      {/* 排序行 */}
      <div className="flex items-center gap-2">
        <ArrowUpDown size={12} color="#6B7280" />
        {SORT_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              if (sortBy === key) {
                setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
              } else {
                setSortBy(key);
                setSortOrder('desc');
              }
            }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-all"
            style={{
              background: sortBy === key ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)',
              color: sortBy === key ? '#C4B5FD' : '#9CA3AF',
            }}
          >
            {label}
            {sortBy === key && (
              <span style={{ fontSize: 8 }}>{sortOrder === 'desc' ? '↓' : '↑'}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 主内容组件 ──────────────────────────────────────

function HotspotRadarInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'radar';

  // 核心数据状态
  const [activeTab, setActiveTab] = useState(initialTab);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  // 筛选状态
  const [source, setSource] = useState('');
  const [importance, setImportance] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [credibility, setCredibility] = useState('');
  const [sortBy, setSortBy] = useState('captured_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // 关键词 Tab
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [keywordHotspots, setKeywordHotspots] = useState<HotspotItem[]>([]);
  const [loadingKeywordHotspots, setLoadingKeywordHotspots] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [addingKeyword, setAddingKeyword] = useState(false);

  // 搜索 Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRegion, setSearchRegion] = useState('both');
  const [searchResultsPerSource, setSearchResultsPerSource] = useState(3);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // 弹窗
  const [showAddKeyword, setShowAddKeyword] = useState(false);

  const authHeaders = getDevUserIdHeader();

  // ─── 数据获取 ────────────────────────────────────

  const fetchData = useCallback(async () => {
    syncDevAuthCookie();
    try {
      const [statsRes, hotspotRes, kwRes] = await Promise.all([
        fetch('/api/hotspot/stats', { headers: { ...authHeaders } }),
        fetch(`/api/hotspot?limit=20&page=${page}&source=${source}&importance=${importance}&timeRange=${timeRange}&credibility=${credibility}&sortBy=${sortBy}&sortOrder=${sortOrder}`, { headers: { ...authHeaders } }),
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
        const kwList = (kwData.data || []).map((kw: any) => ({
          ...kw,
          hotspotCount: kw._count?.hotspots || 0,
        }));
        setKeywords(kwList);
      }
    } catch (e) {
      console.error('获取数据失败:', e);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [page, source, importance, timeRange, credibility, sortBy, sortOrder]);

  useEffect(() => {
    if (initialLoading) {
      fetchData();
    } else {
      setRefreshing(true);
      fetchData();
    }
  }, [fetchData]);

  // 获取选中关键词的热点
  useEffect(() => {
    if (!selectedKeywordId || activeTab !== 'keywords') return;
    setLoadingKeywordHotspots(true);
    syncDevAuthCookie();
    fetch(`/api/hotspot?limit=20&sortBy=captured_at&sortOrder=desc`, { headers: { ...authHeaders } })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          // 过滤出该关键词的热点
          const filtered = (data.data || []).filter((h: any) => h.monitor_keyword_id === selectedKeywordId);
          setKeywordHotspots(filtered);
        }
      })
      .finally(() => setLoadingKeywordHotspots(false));
  }, [selectedKeywordId, activeTab]);

  // ─── 操作 ────────────────────────────────────────

  const handleNavigate = (page: PageKey) => {
    router.push(PAGE_ROUTES[page] || '/home');
  };

  const handleMarkAllRead = async () => {
    syncDevAuthCookie();
    try {
      await fetch('/api/hotspot/mark-read', { method: 'POST', headers: { ...authHeaders } });
      fetchData();
    } catch {}
  };

  const handleCheckNow = async () => {
    setChecking(true);
    setCheckResult(null);
    syncDevAuthCookie();
    try {
      const res = await fetch('/api/keywords/check', { method: 'POST', headers: { ...authHeaders } });
      const data = await res.json();
      if (data.success) {
        setCheckResult(`发现 ${data.data.newHotspots} 条新热点`);
        await fetchData();
      } else {
        setCheckResult('检查失败: ' + (data.error || '未知错误'));
      }
    } catch {
      setCheckResult('网络错误');
    } finally {
      setChecking(false);
      setTimeout(() => setCheckResult(null), 5000);
    }
  };

  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) return;
    setAddingKeyword(true);
    syncDevAuthCookie();
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ keyword: newKeyword.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setNewKeyword('');
        setShowAddKeyword(false);
        fetchData();
      }
    } catch {}
    finally { setAddingKeyword(false); }
  };

  const handleToggleKeyword = async (id: string, currentActive: boolean) => {
    syncDevAuthCookie();
    try {
      await fetch(`/api/keywords/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      fetchData();
    } catch {}
  };

  const handleDeleteKeyword = async (id: string) => {
    syncDevAuthCookie();
    try {
      await fetch(`/api/keywords/${id}`, { method: 'DELETE', headers: { ...authHeaders } });
      if (selectedKeywordId === id) setSelectedKeywordId(null);
      fetchData();
    } catch {}
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    syncDevAuthCookie();
    try {
      const res = await fetch('/api/hotspot/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ query: searchQuery.trim(), region: searchRegion, resultsPerSource: searchResultsPerSource }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.data.results || []);
      }
    } catch {}
    finally { setSearching(false); }
  };

  const handleToInspiration = async (item: HotspotItem) => {
    syncDevAuthCookie();
    try {
      const res = await fetch('/api/inspiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          type: 'link',
          title: item.title?.substring(0, 100) || '热点灵感',
          original_text: item.original_content || item.ai_summary || '',
          summary: item.ai_summary || '',
          source_url: item.original_url || '',
          source_platform: item.platform || '',
          tags: [item.platform, item.importance_level].filter(Boolean),
        }),
      });
      if (res.ok) {
        setCheckResult('已保存到灵感库');
        setTimeout(() => setCheckResult(null), 3000);
      }
    } catch {}
  };

  const handleViewDetail = (id: string) => {
    router.push(`/hotspot/detail?id=${id}`);
  };

  // ─── 分页 ────────────────────────────────────────

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <div className="flex items-center justify-center gap-1 mt-4">
        <button
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-2 py-1 rounded text-[11px]"
          style={{ background: 'rgba(255,255,255,0.05)', color: page <= 1 ? '#4B5563' : '#E5E7EB' }}
        >
          上一页
        </button>
        {start > 1 && (
          <>
            <button onClick={() => setPage(1)} className="px-2 py-1 rounded text-[11px]" style={{ background: 'rgba(255,255,255,0.05)', color: '#9CA3AF' }}>1</button>
            {start > 2 && <span style={{ color: '#6B7280', fontSize: 11 }}>...</span>}
          </>
        )}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className="px-2 py-1 rounded text-[11px]"
            style={{
              background: p === page ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.05)',
              color: p === page ? '#93C5FD' : '#9CA3AF',
            }}
          >
            {p}
          </button>
        ))}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span style={{ color: '#6B7280', fontSize: 11 }}>...</span>}
            <button onClick={() => setPage(totalPages)} className="px-2 py-1 rounded text-[11px]" style={{ background: 'rgba(255,255,255,0.05)', color: '#9CA3AF' }}>{totalPages}</button>
          </>
        )}
        <button
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-2 py-1 rounded text-[11px]"
          style={{ background: 'rgba(255,255,255,0.05)', color: page >= totalPages ? '#4B5563' : '#E5E7EB' }}
        >
          下一页
        </button>
        <span style={{ color: '#6B7280', fontSize: 11, marginLeft: 8 }}>共 {totalCount} 条</span>
      </div>
    );
  };

  // ─── 渲染 ────────────────────────────────────────

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner text="加载热点雷达..." />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav
        title="热点雷达"
        right={
          <div className="flex gap-2">
            <button className="p-1" onClick={handleCheckNow} disabled={checking} title="立即扫描">
              {checking ? <Loader2 size={20} color="#FBBF24" className="animate-spin" /> : <RefreshCw size={20} color="#E5E7EB" />}
            </button>
          </div>
        }
      />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* 监控状态条 */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${stats?.activeKeywords ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
            <span style={{ color: stats?.activeKeywords ? '#22C55E' : '#9CA3AF', fontSize: 12 }}>
              {stats?.activeKeywords ? `监控中 · ${stats.activeKeywords} 个关键词` : '未监控'}
            </span>
            {stats?.lastCheckAt && (
              <span style={{ color: '#6B7280', fontSize: 11 }}>
                · 上次检查 {formatRelativeTime(stats.lastCheckAt)}
              </span>
            )}
          </div>
          <span style={{ color: '#6B7280', fontSize: 10 }}>每30分钟自动更新</span>
        </div>

        {/* 检查结果提示 */}
        {checkResult && (
          <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#86EFAC' }}>
            <CheckCircle2 size={14} /> {checkResult}
          </div>
        )}

        {/* Tab 切换 */}
        <div className="flex rounded-xl p-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs transition-all"
              style={{
                background: activeTab === key ? 'rgba(59,130,246,0.25)' : 'transparent',
                color: activeTab === key ? '#93C5FD' : '#9CA3AF',
                fontWeight: activeTab === key ? 600 : 400,
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* ─── Tab 1: 热点雷达 ─────────────────────── */}
        {activeTab === 'radar' && (
          <>
            {/* 统计卡片 */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '今日新增', value: stats?.today ?? 0, color: '#3B82F6', icon: <Zap size={14} /> },
                { label: '总热点', value: stats?.total ?? 0, color: '#FFFFFF', icon: <BarChart3 size={14} /> },
                { label: '紧急', value: stats?.urgent ?? 0, color: '#EF4444', icon: <Flame size={14} /> },
                { label: '未读', value: stats?.unread ?? 0, color: '#F59E0B', icon: <Eye size={14} /> },
              ].map(({ label, value, color, icon }) => (
                <GlassCard key={label} className="!p-3">
                  <div className="flex items-center gap-1 mb-1" style={{ color }}>{icon}</div>
                  <p style={{ color, fontSize: 20, fontWeight: 700, textAlign: 'center' }}>{value}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 10, textAlign: 'center' }}>{label}</p>
                </GlassCard>
              ))}
            </div>

            {/* 全部已读 */}
            {(stats?.unread ?? 0) > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all active:scale-95"
                  style={{
                    background: 'rgba(245,158,11,0.15)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    color: '#FBBF24'
                  }}
                >
                  <CheckCircle2 size={12} /> 全部已读
                </button>
              </div>
            )}

            {/* 来源分布 */}
            {stats?.bySource && Object.keys(stats.bySource).length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[10px]">
                {Object.entries(stats.bySource).map(([platform, count]) => (
                  <span
                    key={platform}
                    className="flex-shrink-0 px-2 py-0.5 rounded"
                    style={{ background: getPlatformColor(platform) + '18', color: getPlatformColor(platform), border: `1px solid ${getPlatformColor(platform)}33` }}
                  >
                    {platform} {count}
                  </span>
                ))}
              </div>
            )}

            {/* 筛选排序 */}
            <FilterSortBar
              source={source} setSource={setSource}
              importance={importance} setImportance={setImportance}
              timeRange={timeRange} setTimeRange={setTimeRange}
              credibility={credibility} setCredibility={setCredibility}
              sortBy={sortBy} setSortBy={setSortBy}
              sortOrder={sortOrder} setSortOrder={setSortOrder}
              sourceOptions={SOURCE_OPTIONS}
            />

            {/* 刷新指示器 */}
            {refreshing && (
              <div className="flex items-center justify-center py-1">
                <Loader2 size={14} className="animate-spin" color="#60A5FA" />
              </div>
            )}

            {/* 热点列表 */}
            {hotspots.length === 0 ? (
              <GlassCard className="!p-8 text-center">
                <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 16 }}>暂无热点数据</p>
                <button
                  onClick={handleCheckNow}
                  disabled={checking}
                  className="px-4 py-2 rounded-lg text-sm flex items-center gap-2 mx-auto"
                  style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.4)' }}
                >
                  {checking ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {checking ? '扫描中...' : '立即扫描热点'}
                </button>
              </GlassCard>
            ) : (
              <div className="space-y-3">
                {hotspots.map((item) => (
                  <div key={item.id} onClick={() => handleViewDetail(item.id)} className="cursor-pointer">
                    <HotspotCard item={item} onViewDetail={handleViewDetail} onToInspiration={handleToInspiration} showKeyword />
                  </div>
                ))}
              </div>
            )}

            {renderPagination()}
          </>
        )}

        {/* ─── Tab 2: 监控词 ────────────────────────── */}
        {activeTab === 'keywords' && (
          <div className="space-y-4">
            {/* 添加关键词 + 快捷操作 */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddKeyword(!showAddKeyword)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#93C5FD' }}
              >
                <Plus size={16} /> 添加关键词
              </button>
              <button
                onClick={handleCheckNow}
                disabled={checking}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm"
                style={{ background: checking ? 'rgba(251,191,36,0.15)' : 'rgba(34,197,94,0.15)', border: checking ? '1px solid rgba(251,191,36,0.3)' : '1px solid rgba(34,197,94,0.3)', color: checking ? '#FBBF24' : '#86EFAC' }}
              >
                {checking ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {checking ? '扫描中...' : '立即扫描'}
              </button>
            </div>

            {/* 添加关键词输入框 */}
            {showAddKeyword && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
                  placeholder="输入要监控的关键词..."
                  className="flex-1 px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB', outline: 'none' }}
                  autoFocus
                />
                <button
                  onClick={handleAddKeyword}
                  disabled={addingKeyword || !newKeyword.trim()}
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.4)' }}
                >
                  {addingKeyword ? <Loader2 size={14} className="animate-spin" /> : '添加'}
                </button>
              </div>
            )}

            {/* 关键词列表 + 热点记录 双栏 */}
            <div className="grid grid-cols-1 gap-4">
              {/* 关键词列表 */}
              <div>
                <h3 style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                  我的监控词 ({keywords.length})
                </h3>
                {keywords.length === 0 ? (
                  <p style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', padding: 20 }}>
                    暂无监控关键词，添加关键词开始监控
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {keywords.map((kw) => (
                      <div
                        key={kw.id}
                        onClick={() => setSelectedKeywordId(selectedKeywordId === kw.id ? null : kw.id)}
                        className="flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all"
                        style={{
                          background: selectedKeywordId === kw.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${selectedKeywordId === kw.id ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Toggle */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleKeyword(kw.id, kw.is_active); }}
                            className="flex-shrink-0 w-8 h-5 rounded-full relative transition-all"
                            style={{ background: kw.is_active ? 'rgba(34,197,94,0.3)' : 'rgba(107,114,128,0.3)' }}
                          >
                            <div
                              className="w-4 h-4 rounded-full absolute top-0.5 transition-all"
                              style={{
                                background: kw.is_active ? '#22C55E' : '#6B7280',
                                left: kw.is_active ? 14 : 2,
                              }}
                            />
                          </button>
                          <div className="min-w-0">
                            <p style={{ color: kw.is_active ? '#E5E7EB' : '#6B7280', fontSize: 13, fontWeight: 500 }} className="truncate">
                              {kw.keyword}
                            </p>
                            <p style={{ color: '#6B7280', fontSize: 10 }}>
                              {kw.is_active ? '监控中' : '已暂停'}
                              {kw.last_check_at && ` · ${formatRelativeTime(kw.last_check_at)}检查`}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteKeyword(kw.id); }}
                          className="flex-shrink-0 p-1 rounded"
                        >
                          <Trash2 size={14} color="#6B7280" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 选中关键词的热点 */}
              {selectedKeywordId && (
                <div>
                  <h3 style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                    关键词热点
                  </h3>
                  {loadingKeywordHotspots ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={20} color="#6B7280" className="animate-spin" />
                    </div>
                  ) : keywordHotspots.length === 0 ? (
                    <p style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', padding: 20 }}>
                      暂无该关键词的热点记录
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {keywordHotspots.map((item) => (
                        <div key={item.id} onClick={() => handleViewDetail(item.id)} className="cursor-pointer">
                          <HotspotCard item={item} onViewDetail={handleViewDetail} onToInspiration={handleToInspiration} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Tab 3: 搜索 ──────────────────────────── */}
        {activeTab === 'search' && (
          <div className="space-y-4">
            {/* 搜索表单 */}
            <GlassCard className="!p-4">
              {/* 搜索框 */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="输入关键词全网搜索..."
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB', outline: 'none' }}
                />
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="px-4 py-2.5 rounded-lg text-sm flex items-center gap-2"
                  style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.4)' }}
                >
                  {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  搜索
                </button>
              </div>

              {/* 区域选择 */}
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>区域:</span>
                {REGION_OPTIONS.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => setSearchRegion(key)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-all"
                    style={{
                      background: searchRegion === key ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                      border: searchRegion === key ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.12)',
                      color: searchRegion === key ? '#93C5FD' : '#9CA3AF',
                    }}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>

              {/* 每来源条数 */}
              <div className="flex items-center gap-2">
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>每来源:</span>
                {[3, 5, 8, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setSearchResultsPerSource(n)}
                    className="px-2 py-0.5 rounded text-[11px] transition-all"
                    style={{
                      background: searchResultsPerSource === n ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)',
                      color: searchResultsPerSource === n ? '#C4B5FD' : '#9CA3AF',
                    }}
                  >
                    {n}条
                  </button>
                ))}
              </div>
            </GlassCard>

            {/* 搜索结果 */}
            {searchResults.length > 0 && (
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 10 }}>
                  搜索 "{searchQuery}" · 共 {searchResults.length} 条结果
                </p>
                <div className="space-y-3">
                  {searchResults.map((r, i) => (
                    <GlassCard key={i} className="!p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px]"
                          style={{ background: getPlatformColor(r.source) + '22', color: getPlatformColor(r.source) }}
                        >
                          {r.source}
                        </span>
                        {r.analysis?.relevance && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px]"
                            style={{
                              background: r.analysis.relevance > 70 ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.12)',
                              color: r.analysis.relevance > 70 ? '#86EFAC' : '#FBBF24',
                            }}
                          >
                            相关 {r.analysis.relevance}%
                          </span>
                        )}
                        {r.analysis?.importance && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px]"
                            style={{
                              background: IMPORTANCE_CONFIG[r.analysis.importance]?.bg || 'rgba(156,163,175,0.12)',
                              color: IMPORTANCE_CONFIG[r.analysis.importance]?.color || '#9CA3AF',
                            }}
                          >
                            {IMPORTANCE_CONFIG[r.analysis.importance]?.label || r.analysis.importance}
                          </span>
                        )}
                      </div>
                      <a href={r.url || '#'} target="_blank" rel="noreferrer" className="block mb-2">
                        <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{r.title}</p>
                      </a>
                      {r.analysis?.summary && (
                        <p style={{ color: '#D1D5DB', fontSize: 12, lineHeight: 1.5 }} className="line-clamp-3">
                          {r.analysis.summary}
                        </p>
                      )}
                      {r.content && !r.analysis?.summary && (
                        <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.5 }} className="line-clamp-3">
                          {r.content}
                        </p>
                      )}
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {/* 搜索空状态 */}
            {!searching && searchResults.length === 0 && (
              <div className="text-center py-12">
                <Search size={40} color="#4B5563" />
                <p style={{ color: '#6B7280', fontSize: 13, marginTop: 12 }}>输入关键词搜索全平台热点</p>
                <p style={{ color: '#4B5563', fontSize: 11, marginTop: 4 }}>
                  覆盖微博、知乎、B站、百度、抖音、头条、搜狗、Bing、HackerNews 等平台
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav activePage="hotspot" onNavigate={handleNavigate} />
    </div>
  );
}

// ─── 页面入口 ────────────────────────────────────────

export default function HotspotRadarPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><LoadingSpinner text="加载中..." /></div>}>
        <HotspotRadarInner />
      </Suspense>
    </ProtectedRoute>
  );
}
