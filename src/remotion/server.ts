// Remotion 独立渲染微服务
// 部署到 42.121.219.223（高配 ECS），由 101.37.66.5 的 LingJi Agent 通过 HTTP 调用
// 启动: REMOTION_SECRET=xxx tsx src/remotion/server.ts

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { renderRemotionComposition } from '../lib/remotion-local-render';

const PORT = parseInt(process.env.REMOTION_PORT || '3100', 10);
const SECRET = process.env.REMOTION_SECRET || '';

if (!SECRET) {
  console.error('[Remotion Server] 缺少 REMOTION_SECRET 环境变量，拒绝启动');
  process.exit(1);
}

function jsonResponse(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    jsonResponse(res, 200, { status: 'ok', uptime: process.uptime() });
    return;
  }

  // Render endpoint
  if (req.method === 'POST' && req.url === '/render') {
    try {
      const body = await readBody(req);
      const { compositionId, props, durationInFrames, fps, outputFormat, secret } = JSON.parse(body);

      if (secret !== SECRET) {
        jsonResponse(res, 403, { success: false, error: 'Unauthorized' });
        return;
      }

      if (!compositionId || !props) {
        jsonResponse(res, 400, { success: false, error: '缺少 compositionId 或 props' });
        return;
      }

      console.log(`[Remotion Server] 开始渲染: ${compositionId}`);

      const result = await renderRemotionComposition({
        compositionId,
        props,
        userId: 'remote-render',
        durationInFrames,
        fps,
        outputFormat: outputFormat || 'mp4',
      });

      console.log(`[Remotion Server] 渲染完成: ${result.url}`);
      jsonResponse(res, 200, { success: true, data: result });
    } catch (err) {
      console.error('[Remotion Server] 渲染失败:', err);
      jsonResponse(res, 500, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  jsonResponse(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[Remotion Server] 已启动: http://0.0.0.0:${PORT}`);
  console.log(`[Remotion Server] Chromium: ${process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'}`);
});
