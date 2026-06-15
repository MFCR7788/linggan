// AI 混剪 SSE 进度流 — 复用 smart-clip-progress 的 EventEmitter
import { subscribeToTask } from '@/lib/ai/smart-clip-progress';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return new Response('缺少 taskId', { status: 400 });
  }

  const encoder = new TextEncoder();
  let aborted = false;

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribeToTask(taskId, (event) => {
        if (aborted) { unsubscribe(); return; }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { unsubscribe(); }
      });

      const heartbeat = setInterval(() => {
        if (aborted) { clearInterval(heartbeat); return; }
        try { controller.enqueue(encoder.encode(': ping\n\n')); } catch { clearInterval(heartbeat); }
      }, 15000);

      const timeout = setTimeout(() => {
        clearInterval(heartbeat);
        unsubscribe();
        if (!aborted) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: '处理超时，请重新提交' })}\n\n`));
          } catch {}
          try { controller.close(); } catch {}
        }
      }, 10 * 60 * 1000);

      const cleanup = () => { clearInterval(heartbeat); clearTimeout(timeout); unsubscribe(); };
    },
    cancel() { aborted = true; },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export const OPTIONS = async () =>
  new Response(null, {
    headers: {
      Allow: 'GET, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
