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
        if (aborted) {
          unsubscribe();
          return;
        }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // 连接已关闭
          unsubscribe();
        }
      });

      // 心跳保活：每 15 秒发一个 ping
      const heartbeat = setInterval(() => {
        if (aborted) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      // 设置 10 分钟超时
      const timeout = setTimeout(() => {
        clearInterval(heartbeat);
        unsubscribe();
        if (!aborted) {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'error', message: '处理超时，请重新提交' })}\n\n`
              )
            );
          } catch {}
          try { controller.close(); } catch {}
        }
      }, 10 * 60 * 1000);

      const cleanup = () => {
        clearInterval(heartbeat);
        clearTimeout(timeout);
        unsubscribe();
      };

      // 当 execute 完成时发送 complete 事件也会触发
      // 由 execute route 负责发 complete 并关闭
    },
    cancel() {
      aborted = true;
    },
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

// 允许 GET 和 OPTIONS
export const OPTIONS = async () =>
  new Response(null, {
    headers: {
      Allow: 'GET, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
