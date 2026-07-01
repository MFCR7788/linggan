// 混剪任务状态查询 API
// GET /api/ai/video-mix/status?taskId=xxx

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return createApiError('缺少 taskId 参数', 400);
  }

  try {
    const supabase = createAdminClient();
    const { data: task, error } = await supabase
      .from('ai_tasks')
      .select('id, status, progress, output, error_message, created_at, updated_at')
      .eq('id', taskId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !task) {
      return createApiError('任务不存在', 404);
    }

    let outputUrl: string | undefined;
    if (task.output) {
      try {
        const out = typeof task.output === 'string' ? JSON.parse(task.output) : task.output;
        outputUrl = out.videoUrl || out.outputUrl || out.url;
      } catch { /* ignore */ }
    }

    return createApiResponse({
      taskId: task.id,
      status: task.status,
      progress: task.progress || 0,
      outputUrl,
      error: task.error_message || undefined,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    });
  } catch (e) {
    console.error('[video-mix/status] 查询失败:', e);
    return createApiError('查询任务状态失败', 500);
  }
});
