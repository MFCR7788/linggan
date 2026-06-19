// Revideo 独立渲染微服务（MIT 许可，免费替代 Remotion $100/月）
// 部署到 42.121.219.223（高配 ECS），由 101.37.66.5 的 LingJi Agent 通过 HTTP 调用
// 启动: REVIDEO_SECRET=xxx tsx src/revideo/server.ts

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { renderRevideoComposition } from '../lib/revideo-local-render';

const PORT = parseInt(process.env.REVIDEO_PORT || '3101', 10);
const SECRET = process.env.REVIDEO_SECRET || '';

if (!SECRET) {
  console.error('[Revideo Server] 缺少 REVIDEO_SECRET 环境变量，拒绝启动');
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
  res.setHeader('Access-Control-Allow-Origin', process.env.LINGJI_APP_ORIGIN || 'https://zjsifan.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    jsonResponse(res, 200, { status: 'ok', uptime: process.uptime() });
    return;
  }

  if (req.method === 'POST' && req.url === '/render') {
    try {
      const body = await readBody(req);
      const { compositionId, props, durationInFrames, fps, secret } = JSON.parse(body);

      if (secret !== SECRET) {
        jsonResponse(res, 403, { success: false, error: 'Unauthorized' });
        return;
      }

      if (!compositionId || !props) {
        jsonResponse(res, 400, { success: false, error: '缺少 compositionId 或 props' });
        return;
      }

      console.log(`[Revideo Server] 开始渲染: ${compositionId}`);
      const startTime = Date.now();

      const result = await renderRevideoComposition({
        compositionId,
        props,
        userId: 'remote-render',
        durationInFrames,
        fps,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Revideo Server] 渲染完成: ${result.url} (${elapsed}s)`);
      jsonResponse(res, 200, { success: true, data: result });
    } catch (err) {
      console.error('[Revideo Server] 渲染失败:', err);
      jsonResponse(res, 500, {
        success: false,
        error: '渲染失败，请稍后重试',
      });
    }
    return;
  }

  jsonResponse(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[Revideo Server] 已启动: http://0.0.0.0:${PORT}`);
  console.log(`[Revideo Server] Chromium: ${process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'}`);
  console.log(`[Revideo Server] MIT 许可 — 免费使用，无水印`);
});
