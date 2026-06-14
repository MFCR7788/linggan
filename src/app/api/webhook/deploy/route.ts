// GitHub Webhook 接收端 - 触发阿里云服务器自部署
//
// 配置:
//   GitHub 仓库 Settings → Webhooks → Add webhook
//     Payload URL:  https://ai.zjsifan.com/api/webhook/deploy
//     Content type: application/json
//     Secret:       <与 GITHUB_WEBHOOK_SECRET 一致>
//     Events:       Just the push event
//
// 流程:
//   1. 验证 GitHub HMAC SHA-256 签名
//   2. 仅响应 push 到 main 分支的请求
//   3. 在后端 spawn 一个 deploy.sh 进程(不阻塞响应)
//   4. 返回 202 Accepted
import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT_PATH || '/opt/lingji/scripts/deploy.sh';
const DEPLOY_BRANCH = process.env.DEPLOY_BRANCH || 'main';

function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    console.error('[Webhook] GITHUB_WEBHOOK_SECRET 未配置');
    return false;
  }
  if (!signature) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  const event = request.headers.get('x-github-event');

  // 1. 签名验证
  if (!verifySignature(rawBody, signature)) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. 只处理 push 事件
  if (event !== 'push') {
    return new Response(JSON.stringify({ ok: true, ignored: `event=${event}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. 解析 payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const branch = (payload.ref || '').replace('refs/heads/', '');
  const pusher = payload.pusher?.name || 'unknown';
  const commits = Array.isArray(payload.commits) ? payload.commits.length : 0;
  const headSha = (payload.after || '').slice(0, 8);

  if (branch !== DEPLOY_BRANCH) {
    return new Response(JSON.stringify({
      ok: true,
      ignored: `branch=${branch}`,
      target: DEPLOY_BRANCH,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // 4. 触发部署(后台异步)
  console.log(`[Webhook] Trigger deploy: branch=${branch} pusher=${pusher} commits=${commits} head=${headSha}`);

  try {
    const logFd = require('fs').openSync('/var/log/lingji-deploy.log', 'a');
    const child = spawn('bash', [DEPLOY_SCRIPT], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOME: process.env.HOME || '/root',
        LANG: process.env.LANG || 'en_US.UTF-8',
        NODE_ENV: process.env.NODE_ENV || 'production',
        DEPLOY_TRIGGER: 'github-webhook',
      },
    });
    child.unref();
  } catch (err) {
    console.error('[Webhook] spawn 失败:', err);
    return new Response(JSON.stringify({ error: 'spawn failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 5. 立即返回 202
  return new Response(JSON.stringify({
    ok: true,
    accepted: true,
    branch,
    pusher,
    commits,
    head: headSha,
    deployLog: '/var/log/lingji-deploy.log',
  }), { status: 202, headers: { 'Content-Type': 'application/json' } });
}

// 拒接其他方法
export async function GET() {
  return new Response(JSON.stringify({
    error: 'Use POST',
    hint: '此端点仅接受 GitHub Webhook POST 请求',
  }), { status: 405, headers: { 'Content-Type': 'application/json' } });
}
