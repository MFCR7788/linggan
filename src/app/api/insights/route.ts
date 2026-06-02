// 数据看板 API
// GET /api/insights?range=7d|30d|90d
// 返回: 总览 + 平台对比 + 时间线 + Top 10

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const VALID_RANGES: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const GET = withAuth(async ({ request, user }) => {
  const url = new URL(request.url);
  const rangeKey = url.searchParams.get('range') || '30d';
  const days = VALID_RANGES[rangeKey] || 30;
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const supabase = createAdminClient();

  // 1) 总览
  const { data: pubs, error: pubsErr } = await supabase
    .from('publications')
    .select('id, platform, status, published_at')
    .eq('user_id', user.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (pubsErr) return createApiError(pubsErr.message, 500);

  const totalPublished = (pubs || []).filter((p) => p.status === 'published').length;
  const pubIds = (pubs || []).filter((p) => p.status === 'published').map((p) => p.id);

  // 2) 自动抓取的指标(2 平台)
  const { data: autoMetrics } = pubIds.length
    ? await supabase
        .from('publication_metrics')
        .select('publication_id, views, likes, comments, shares, collects, captured_at')
        .in('publication_id', pubIds)
        .order('captured_at', { ascending: false })
    : { data: [] as any[] };

  // 3) 手动录入的指标(4 平台)
  const { data: manualMetrics } = pubIds.length
    ? await supabase
        .from('publication_manual_metrics')
        .select('publication_id, views, likes, comments, shares, collects, captured_at, notes')
        .in('publication_id', pubIds)
        .order('captured_at', { ascending: false })
    : { data: [] as any[] };

  // 取每个 publication 的最新一次抓取(自动 or 手动)
  const latestByPub = new Map<string, { views: number; likes: number; comments: number; shares: number; collects: number; source: 'auto' | 'manual' }>();
  for (const m of autoMetrics || []) {
    if (!latestByPub.has(m.publication_id)) {
      latestByPub.set(m.publication_id, {
        views: m.views || 0,
        likes: m.likes || 0,
        comments: m.comments || 0,
        shares: m.shares || 0,
        collects: m.collects || 0,
        source: 'auto',
      });
    }
  }
  for (const m of manualMetrics || []) {
    if (!latestByPub.has(m.publication_id)) {
      latestByPub.set(m.publication_id, {
        views: m.views || 0,
        likes: m.likes || 0,
        comments: m.comments || 0,
        shares: m.shares || 0,
        collects: m.collects || 0,
        source: 'manual',
      });
    }
  }

  const totals = { views: 0, likes: 0, comments: 0, shares: 0, collects: 0 };
  for (const v of latestByPub.values()) {
    totals.views += v.views;
    totals.likes += v.likes;
    totals.comments += v.comments;
    totals.shares += v.shares;
    totals.collects += v.collects;
  }
  const totalInteractions = totals.likes + totals.comments + totals.shares + totals.collects;
  const avgEngagement = totals.views > 0 ? (totalInteractions / totals.views) * 100 : 0;

  // 4) 平台对比
  const platformStats = new Map<string, { count: number; views: number; likes: number; comments: number; shares: number; collects: number }>();
  for (const pub of pubs || []) {
    if (pub.status !== 'published') continue;
    const stats = platformStats.get(pub.platform) || { count: 0, views: 0, likes: 0, comments: 0, shares: 0, collects: 0 };
    stats.count += 1;
    const m = latestByPub.get(pub.id);
    if (m) {
      stats.views += m.views;
      stats.likes += m.likes;
      stats.comments += m.comments;
      stats.shares += m.shares;
      stats.collects += m.collects;
    }
    platformStats.set(pub.platform, stats);
  }
  const platformComparison = Array.from(platformStats.entries()).map(([platform, s]) => ({
    platform,
    count: s.count,
    views: s.views,
    avgViews: s.count > 0 ? Math.round(s.views / s.count) : 0,
    engagement: s.views > 0 ? ((s.likes + s.comments + s.shares + s.collects) / s.views) * 100 : 0,
  }));

  // 5) 时间线(按天聚合)
  const timelineMap = new Map<string, { published: number; views: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400 * 1000);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    timelineMap.set(key, { published: 0, views: 0 });
  }
  for (const pub of pubs || []) {
    if (!pub.published_at) continue;
    const d = new Date(pub.published_at);
    if (d.getTime() < Date.now() - days * 86400 * 1000) continue;
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    const stats = timelineMap.get(key) || { published: 0, views: 0 };
    stats.published += 1;
    const m = latestByPub.get(pub.id);
    if (m) stats.views += m.views;
    timelineMap.set(key, stats);
  }
  const timeline = Array.from(timelineMap.entries()).map(([date, v]) => ({ date, ...v }));

  // 6) Top 10 作品(按互动率)
  const topItems = Array.from(latestByPub.entries())
    .map(([pubId, m]) => {
      const pub = (pubs || []).find((p) => p.id === pubId);
      if (!pub) return null;
      const interactions = m.likes + m.comments + m.shares + m.collects;
      const engagement = m.views > 0 ? (interactions / m.views) * 100 : 0;
      return {
        publicationId: pubId,
        platform: pub.platform,
        views: m.views,
        likes: m.likes,
        comments: m.comments,
        shares: m.shares,
        engagement,
        source: m.source,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.engagement - a!.engagement))
    .slice(0, 10);

  return createApiResponse({
    range: rangeKey,
    days,
    overview: {
      totalPublished,
      totalPublications: (pubs || []).length,
      ...totals,
      totalInteractions,
      avgEngagement: Number(avgEngagement.toFixed(2)),
    },
    platformComparison,
    timeline,
    topItems,
  });
});
