// 一次性回填脚本：为所有 content_items 生成 embedding 并写入 inspiration_embeddings
// 访问 GET /api/migrate/index-inspirations?secret=xxx 执行（受 CRON_SECRET 保护）
// 分批处理，每批 25 条，避免 DashScope API 限流

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getCronSecret } from '@/lib/runtime-config';
import { indexContentItemsBatch } from '@/lib/assistant/embedding';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 分钟

export async function GET(request: Request) {
  const expectedSecret = getCronSecret();
  if (!expectedSecret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET 未配置' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const secret =
    searchParams.get('secret') ||
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (secret !== expectedSecret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const batchSize = Math.min(parseInt(searchParams.get('batchSize') || '100', 10), 500);
  const dryRun = searchParams.get('dryRun') === '1';

  console.log(`[IndexInspirations] 开始回填，batchSize=${batchSize}，dryRun=${dryRun}`);

  const supabase = createAdminClient();

  // 获取所有 active 且尚未索引的 content_items
  const { data: items, error: fetchError } = await supabase
    .from('content_items')
    .select('id, user_id, title, original_text, ai_summary')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(batchSize);

  if (fetchError) {
    console.error('[IndexInspirations] 查询失败:', fetchError.message);
    return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ success: true, indexed: 0, total: 0, message: '没有需要回填的内容' });
  }

  // 过滤掉已经在 inspiration_embeddings 中有记录的内容
  let toIndex = items;
  try {
    const ids = items.map((i: any) => i.id);
    const { data: existing } = await supabase
      .from('inspiration_embeddings')
      .select('content_id')
      .in('content_id', ids);

    if (existing && existing.length > 0) {
      const existingIds = new Set(existing.map((e: any) => e.content_id));
      toIndex = items.filter((i: any) => !existingIds.has(i.id));
    }
  } catch (e) {
    console.warn('[IndexInspirations] 查重失败，继续全量索引:', e);
  }

  console.log(`[IndexInspirations] ${items.length} 条记录，已索引 ${items.length - toIndex.length}，需索引 ${toIndex.length}`);

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      total: items.length,
      toIndex: toIndex.length,
      skipped: items.length - toIndex.length,
    });
  }

  // 组装嵌入文本
  const batchItems = toIndex.map((item: any) => ({
    id: item.id,
    userId: item.user_id,
    text: [item.title, item.original_text, item.ai_summary].filter(Boolean).join(' ').slice(0, 2000),
  }));

  const result = await indexContentItemsBatch(batchItems);

  console.log(`[IndexInspirations] 完成：${result.indexed} 成功，${result.failed} 失败`);

  return NextResponse.json({
    success: true,
    indexed: result.indexed,
    failed: result.failed,
    total: items.length,
    skipped: items.length - toIndex.length,
    message: `索引完成：${result.indexed} 成功，${result.failed} 失败，${items.length - toIndex.length} 跳过`,
  });
}
