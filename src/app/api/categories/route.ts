// 分类 API 端点
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 6 个基本分类定义
const BASIC_CATEGORIES = [
  { name: '灵感', icon: '💡', color: '#3B82F6', sort_order: 0 },
  { name: '选题', icon: '📝', color: '#8B5CF6', sort_order: 1 },
  { name: '文案', icon: '✍️', color: '#F43F5E', sort_order: 2 },
  { name: '图片', icon: '🖼️', color: '#10B981', sort_order: 3 },
  { name: '视频', icon: '🎬', color: '#F59E0B', sort_order: 4 },
  { name: '日程', icon: '📅', color: '#6B7280', sort_order: 5 },
];

// 获取分类列表
export const GET = withAuth(async ({ user }) => {
  const supabase = createAdminClient();

  // 从数据库获取用户的真实分类
  const { data: dbCategories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });

  if (dbCategories && dbCategories.length > 0) {
    const dbMap = new Map(dbCategories.map(c => [c.name, c]));

    // 构建 6 个基本分类，自动补齐数据库中缺失的
    const result: Array<Record<string, unknown>> = [];
    for (const basic of BASIC_CATEGORIES) {
      let db = dbMap.get(basic.name);
      if (!db) {
        // 数据库中缺少该基本分类，自动创建
        const { data: newCat } = await supabase
          .from('categories')
          .insert({
            user_id: user.id,
            name: basic.name,
            icon: basic.icon,
            color: basic.color,
            is_default: true,
            sort_order: basic.sort_order,
          })
          .select()
          .single();
        if (newCat) {
          db = newCat;
        }
      }
      result.push({
        id: db ? db.id : crypto.randomUUID(),
        name: basic.name,
        icon: basic.icon,
        color: basic.color,
        is_default: true,
        sort_order: basic.sort_order,
        created_at: db?.created_at || new Date().toISOString(),
      });
    }

    // 只返回 6 个基本分类，不包含用户自建分类
    return createApiResponse(result);
  }

  // 数据库无分类，创建并返回默认分类
  const created = [];
  for (const basic of BASIC_CATEGORIES) {
    const { data: newCat } = await supabase
      .from('categories')
      .insert({
        user_id: user.id,
        name: basic.name,
        icon: basic.icon,
        color: basic.color,
        is_default: true,
        sort_order: basic.sort_order,
      })
      .select()
      .single();
    if (newCat) {
      created.push(newCat);
    }
  }
  return createApiResponse(created.length > 0 ? created : BASIC_CATEGORIES.map((b, i) => ({
    ...b,
    id: String(i + 1),
    is_default: true,
    created_at: new Date().toISOString(),
  })));
}, {
  onError: (error) => {
    console.error('获取分类列表错误:', error);
    return createApiResponse(
      BASIC_CATEGORIES.map((b, i) => ({
        ...b,
        id: String(i + 1),
        is_default: true,
        created_at: new Date().toISOString(),
      }))
    );
  },
});

// 创建分类
export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { name, icon, color, is_default, sort_order } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return createApiError('分类名称不能为空', 400);
  }
  if (name.trim().length > 30) {
    return createApiError('分类名称不能超过30个字符', 400);
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: user.id,
      name: name.trim(),
      icon: icon || '📁',
      color: color || '#6B7280',
      is_default: is_default || false,
      sort_order: sort_order || 0
    })
    .select()
    .single();

  if (error) {
    return createApiError('创建分类失败', 500);
  }

  return createApiResponse(data, '分类创建成功');
});
