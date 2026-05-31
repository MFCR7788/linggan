import { createApiResponse } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 搜索相似关键词建议（排除已订阅的）
export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q || q.length < 1) {
    return createApiResponse([]);
  }

  const supabase = createAdminClient();

  // 获取用户已订阅的关键词
  const { data: subscribed } = await supabase
    .from('monitor_keywords')
    .select('keyword')
    .eq('user_id', user.id);

  const subscribedSet = new Set((subscribed || []).map(s => s.keyword.toLowerCase()));

  // 从 keyword_library 搜索建议（如果表存在）
  const { data: libraryResults } = await supabase
    .from('keyword_library')
    .select('*')
    .or(`text.ilike.${q}%,text.ilike.%${q}%`)
    .order('user_count', { ascending: false })
    .limit(10);

  let suggestions: string[] = [];
  if (libraryResults && libraryResults.length > 0) {
    suggestions = libraryResults
      .filter(kw => !subscribedSet.has(kw.text.toLowerCase()))
      .map(kw => kw.text);
  }

  // 补充分类常见关键词（基于输入的前缀匹配）
  const commonCategories: Record<string, string[]> = {
    'AI': ['AI创作', 'AI视频生成', 'AI绘画', 'AI工具', 'AI大模型', 'AI编程', 'AI赚钱', 'AI替代'],
    '大模型': ['大模型', '国产大模型', '大模型应用', '大模型落地', 'LLM', '多模态'],
    '自媒体': ['自媒体', '短视频', '内容创作', '涨粉', '变现', '自媒体运营'],
    '创业': ['创业', '副业', '赚钱', '商业', '商业模式', '投资'],
    '科技': ['科技', '数码', '手机', '芯片', '新能源', '苹果'],
    '营销': ['营销', '品牌营销', '私域', '增长', '转化率', '用户运营'],
    '设计': ['设计', 'UI设计', '平面设计', '设计趋势', 'AIGC设计'],
    '编程': ['编程', '开发者', '开源', '代码', '程序员'],
  };

  for (const [cat, kws] of Object.entries(commonCategories)) {
    if (q.includes(cat) || cat.includes(q)) {
      for (const kw of kws) {
        if (!subscribedSet.has(kw.toLowerCase()) && kw.includes(q) && !suggestions.includes(kw)) {
          suggestions.push(kw);
        }
      }
    }
  }

  // 补充直接匹配
  if (suggestions.length < 5) {
    const directMatches = Object.values(commonCategories).flat().filter(kw =>
      kw.includes(q) && !subscribedSet.has(kw.toLowerCase()) && !suggestions.includes(kw)
    );
    suggestions.push(...directMatches.slice(0, 5));
  }

  return createApiResponse(suggestions.slice(0, 10));
});
