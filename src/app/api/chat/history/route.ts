import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';

// GET /api/chat/history — 获取会话列表或某会话的消息或我的作品
//   ?session_id=xxx  → 获取该会话的消息
//   ?works=true&type=文案|图片|视频|配音  → 获取我的作品（AI 生成内容）
//   ?works=true&type=视频&sourcePlatform=ai_digital_human  → 按来源平台过滤
//   无参数           → 获取会话列表
export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');
  const worksMode = searchParams.get('works');
  const supabase = createAdminClient();

  if (worksMode === 'true') {
    // 获取我的作品：chat_messages + content_items 合并
    const workType = searchParams.get('type'); // 文案 | 图片 | 视频 | 配音
    const sourcePlatform = searchParams.get('sourcePlatform'); // 可选，按来源平台过滤

    // 1. chat_messages 中的 AI 创作记录
    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select('id, content, content_type, metadata, created_at, session_id')
      .eq('user_id', user.id)
      .eq('type', 'ai')
      .contains('metadata', { source: 'ai_creation' })
      .order('created_at', { ascending: false })
      .limit(30);

    if (msgError) {
      console.error('[Works] 查询 chat_messages 失败:', msgError);
    }

    // 2. content_items 中的直接保存作品（如 AI 视频向导、图片生成）
    const { data: contentItems, error: ciError } = await supabase
      .from('content_items')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (ciError) {
      console.error('[Works] 查询 content_items 失败:', ciError);
    }

    // 映射统一格式
    const chatWorks = (messages || []).map((m: any) => {
      // 严格判断：必须有实际的 videoUrl/imageUrl 才算视频/图片作品
      const hasVideo = !!(m.metadata?.generatedVideo?.videoUrl);
      const hasImage = !!(m.metadata?.generatedImage?.imageUrl);
      const workTypeResult: string = hasVideo ? '视频' : hasImage ? '图片' : '文案';
      const emoji = hasVideo ? '🎬' : hasImage ? '🖼️' : '📄';
      const title = (m.content || '').replace(/<[^>]*>/g, '').substring(0, 40) + ((m.content || '').length > 40 ? '...' : '');
      return {
        id: m.id,
        emoji,
        title: title || 'AI 生成内容',
        type: workTypeResult,
        time: m.created_at,
        session_id: m.session_id,
        metadata: m.metadata,
        content: m.content,
        content_type: m.content_type,
        source_platform: m.metadata?.source_platform || null,
        _source: 'chat',
      };
    })
    // 移除没有最终视频/图片的中间生成记录（只有 segments 没有 videoUrl）
    .filter((w: any) => {
      const gv = w.metadata?.generatedVideo;
      if (gv && !gv.videoUrl && gv.segments) return false;
      return true;
    });

    const contentWorks = (contentItems || []).map((ci: any) => {
      const ciType = ci.type === 'video' ? '视频' : ci.type === 'image' ? '图片' : ci.type === 'voice' ? '配音' : '文案';
      const emoji = ci.type === 'video' ? '🎬' : ci.type === 'image' ? '🖼️' : ci.type === 'voice' ? '🔊' : '📄';
      const mediaUrl = ci.media_urls?.[0] || '';
      return {
        id: ci.id,
        emoji,
        title: ci.title || 'AI 生成内容',
        type: ciType,
        time: ci.created_at,
        session_id: ci.session_id || '',
        metadata: {
          source: 'content_item',
          generatedVideo: ci.type === 'video' && mediaUrl ? { videoUrl: mediaUrl } : undefined,
          generatedImage: ci.type === 'image' && mediaUrl ? { imageUrl: mediaUrl } : undefined,
          videoThumbnail: ci.thumbnail_url || undefined,
        },
        content: ci.ai_summary || ci.original_text || '',
        content_type: ci.type,
        source_platform: ci.source_platform || null,
        _source: 'content_item',
      };
    });

    // 合并并按时间倒序
    let works = [...chatWorks, ...contentWorks]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 30);

    // 过滤：只保留有实质内容的（文字长度>5 或有生成结果）
    works = works.filter((w: any) =>
      (w.title?.length || 0) > 5 || w.type === '图片' || w.type === '视频'
    );

    // 按类型筛选
    if (workType && workType !== '全部') {
      works = works.filter((w: any) => w.type === workType);
    }

    // 按来源平台筛选
    if (sourcePlatform) {
      works = works.filter((w: any) => w.source_platform === sourcePlatform);
    }

    return createApiResponse(works);
  }

  if (sessionId) {
    // 获取某会话的消息
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();
    if (!session) return createApiError('会话不存在', 404);

    const { data: messages } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    return createApiResponse({ session, messages: messages || [] });
  }

  // 获取会话列表
  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20);

  return createApiResponse(sessions || []);
});

// POST /api/chat/history — 创建会话或添加消息
//   { action: 'create_session', title? }  → 创建新会话
//   { action: 'save_messages', session_id, messages }  → 保存消息
//   { action: 'update_title', session_id, title }  → 更新标题
export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { action } = body;
  const supabase = createAdminClient();

  if (action === 'create_session') {
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({ user_id: user.id, title: body.title || '新对话' })
      .select()
      .single();
    if (error) return createApiError('创建失败', 500);
    return createApiResponse(data);
  }

  if (action === 'save_messages') {
    const { session_id, messages } = body;
    if (!session_id || !messages?.length) return createApiError('参数不足', 400);

    const { error } = await supabase.from('chat_messages').insert(
      messages.map((m: any) => ({
        session_id,
        user_id: user.id,
        type: m.type,
        content: m.content,
        content_type: m.content_type || 'text',
        attachments: m.attachments || [],
        metadata: m.metadata || {},
      }))
    );
    if (error) return createApiError('保存失败', 500);

    // 更新会话时间
    await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', session_id);

    // 如果是第一条消息，自动用内容生成标题
    const { count } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session_id);
    if (count === 1) {
      const firstMsg = messages[0];
      const title = firstMsg.content
        ? firstMsg.content.substring(0, 30) + (firstMsg.content.length > 30 ? '...' : '')
        : '新对话';
      await supabase.from('chat_sessions').update({ title }).eq('id', session_id);
    }

    return createApiResponse({ saved: messages.length });
  }

  if (action === 'update_title') {
    const { session_id, title } = body;
    if (!session_id || !title) return createApiError('参数不足', 400);
    await supabase.from('chat_sessions').update({ title }).eq('id', session_id).eq('user_id', user.id);
    return createApiResponse({ success: true });
  }

  return createApiError('未知操作', 400);
});

// DELETE /api/chat/history?session_id=xxx — 删除会话
export const DELETE = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');
  if (!sessionId) return createApiError('缺少 session_id', 400);

  const supabase = createAdminClient();
  await supabase.from('chat_messages').delete().eq('session_id', sessionId);
  await supabase.from('chat_sessions').delete().eq('id', sessionId).eq('user_id', user.id);
  return createApiResponse({ success: true });
});
