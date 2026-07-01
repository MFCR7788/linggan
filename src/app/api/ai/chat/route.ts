import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { getVideoTaskStatus } from '@/lib/ai-services';
import { executeChatPipeline } from '@/lib/assistant/chat-pipeline';

// ====== POST 处理器 ======
export const POST = withAuth(async ({ request, user }) => {
  const modelErrors: string[] = [];
  try {
    const body = await request.json();
    const { content = '', images = [], videos = [], documents = [], searchResults, session_id, model: selectedModel, stream: useStream } = body;

    if (!content && images.length === 0 && videos.length === 0 && documents.length === 0) {
      return NextResponse.json({
        success: false,
        error: '内容不能为空'
      }, { status: 400 });
    }

    // 基础 prompt 注入检测
    if (content && typeof content === 'string') {
      const lower = content.toLowerCase();
      const injectionPatterns = [
        /ignore\s+(all\s+)?(previous|prior|above|your)\s+instructions?/i,
        /system\s*:\s*you\s+are\s+now/i,
        /pretend\s+you\s+are\s+(a\s+)?(different|another)/i,
        /you\s+are\s+now\s+(DAN|jailbroken|unrestricted)/i,
        /forget\s+(all\s+)?your\s+(training|programming|rules)/i,
        /<\|im_start\|>/i,
        /<\|im_end\|>/i,
      ];
      if (injectionPatterns.some(p => p.test(lower))) {
        return NextResponse.json({
          success: false,
          error: '检测到异常输入模式，请重新描述您的需求'
        }, { status: 400 });
      }
    }

    const hasImages = images.length > 0;
    const hasVideos = videos.length > 0;
    const hasDocuments = documents.length > 0;

    const creditCost = CREDIT_COSTS.ai_text.perCall;
    try {
      await consume(user.id, creditCost, 'ai_chat', 'AI 对话', { contentLen: content.length, hasImages, hasVideos, hasDocuments });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    const result = await executeChatPipeline({
      content,
      images,
      videos,
      documents,
      searchResults,
      sessionId: session_id,
      selectedModel,
      useStream,
      userId: user.id,
      requestUrl: request.url,
    });

    // Streaming 模式：直接返回 SSE 响应
    if (result.type === 'stream') {
      return result.response;
    }

    // 非 Streaming 模式：返回 JSON 响应
    return NextResponse.json({
      success: true,
      ...result.analysis,
      _model: result.modelUsed,
      _intent: result.intentType,
      _context: result.contextStats,
      _modelErrors: result.modelErrors.length > 0 ? result.modelErrors : undefined,
      // 链接抓取失败信号:前端用这个决定是否显示"建议贴正文"提示
      // 阈值 200:analyze-link 已先试 SSR HTML,再 fallback jina.ai reader
      // 仍 < 200 字说明这个 URL 真没救了(SPA 反爬 + 404 + 登录墙)
      linkFetchFailed: result.linkFetchFailed,
    });

  } catch (error) {
    console.error('聊天 API 错误:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      error: errMsg.length > 500 ? errMsg.substring(0, 500) + '...' : errMsg,
      modelErrors: modelErrors.length > 0 ? modelErrors.slice(0, 5) : undefined,
    });
  }
});

// GET /api/ai/chat?action=video_status&taskId=xxx — 查询视频生成状态
export const GET = withAuth(async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'video_status') {
    const taskId = searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ success: false, error: '缺少 taskId' }, { status: 400 });
    }
    try {
      const result = await getVideoTaskStatus(taskId);
      return NextResponse.json({ success: true, data: result });
    } catch (e) {
      console.error('视频状态查询失败:', e);
      return NextResponse.json({ success: false, error: '查询失败' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: false, error: '未知操作' }, { status: 400 });
});
