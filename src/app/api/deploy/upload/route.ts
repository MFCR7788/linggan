// HTTPS 部署上传端点 — 替代 SSH 传输
//
// CI 构建完成后通过 HTTPS POST 上传 deploy.tar.gz
// 服务端验证共享密钥后，后台执行部署脚本
//
// 使用方式:
//   curl -X POST -H "Authorization: Bearer <DEPLOY_SECRET>" \
//     -H "Content-Type: application/octet-stream" \
//     --data-binary @deploy.tar.gz \
//     https://zjsifan.com/api/deploy/upload

import { NextRequest, NextResponse } from 'next/server';
import { createWriteStream } from 'fs';
import { spawn } from 'child_process';
import { mkdir, writeFile, chmod } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEPLOY_SECRET = process.env.DEPLOY_SECRET || '';
const INCOMING_DIR = '/opt/deploy-incoming';
const ENV_FILE = '/opt/lingji/.env.local';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!DEPLOY_SECRET || authHeader !== `Bearer ${DEPLOY_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = request.body;
  if (!body) {
    return NextResponse.json({ error: 'No body' }, { status: 400 });
  }

  try {
    await mkdir(INCOMING_DIR, { recursive: true });

    const ts = Date.now();
    const tarPath = join(INCOMING_DIR, `deploy-${ts}.tar.gz`);
    const fileStream = createWriteStream(tarPath);
    const reader = body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!fileStream.write(value)) {
          await new Promise<void>(resolve => fileStream.once('drain', () => resolve()));
        }
      }
    } finally {
      reader.releaseLock();
      fileStream.end();
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    const deployScript = join(INCOMING_DIR, `run-${ts}.sh`);
    const script = [
      '#!/bin/bash',
      'exec >> /var/log/lingji-deploy.log 2>&1',
      'echo "=== Deploy started $(date) ==="',
      '',
      'cd /opt',
      'rm -rf /opt/deploy-pkg /opt/lingji-new 2>/dev/null || true',
      `if ! tar xzf "${tarPath}" 2>/dev/null; then`,
      '  echo "FATAL: tar extract failed"',
      '  exit 1',
      'fi',
      `rm -f "${tarPath}"`,
      'echo "Extracted OK"',
      '',
      '# Copy old node_modules as base',
      'if [ -d /opt/lingji/node_modules ]; then',
      '  echo "Copying node_modules from old deployment..."',
      '  cp -a /opt/lingji/node_modules /opt/deploy-pkg/node_modules 2>&1 || echo "Copy had warnings but continuing..."',
      '  echo "node_modules copy done"',
      'else',
      '  echo "No old node_modules to copy"',
      'fi',
      '',
      `if [ -f "${ENV_FILE}" ]; then`,
      `  cp "${ENV_FILE}" /opt/deploy-pkg/.env.local`,
      '  echo "Copied .env.local"',
      'fi',
      '',
      '# Enable swap',
      'swapon /swapfile 2>/dev/null || true',
      '',
      '# Install dependencies',
      'cd /opt/deploy-pkg',
      'echo "Installing dependencies..."',
      'if ! npm install --omit=dev --no-audit --no-fund --prefer-offline; then',
      '  echo "Incremental install failed, trying clean install..."',
      '  rm -rf node_modules',
      '  npm install --omit=dev --no-audit --no-fund || { echo "FATAL: npm install failed"; exit 1; }',
      'fi',
      'echo "Dependencies OK"',
      'cd /opt',
      '',
      '# Verify node_modules exists',
      'if [ ! -d /opt/deploy-pkg/node_modules/next ]; then',
      '  echo "FATAL: next not found in node_modules"',
      '  exit 1',
      'fi',
      '',
      '# Atomic swap',
      'if [ -d /opt/lingji ]; then',
      '  rm -rf /opt/lingji-old 2>/dev/null || true',
      '  mv /opt/lingji /opt/lingji-old',
      'fi',
      'mv /opt/deploy-pkg /opt/lingji',
      'echo "Swap done"',
      '',
      '# Restart',
      'pm2 stop lingji 2>/dev/null || true',
      'pm2 delete lingji 2>/dev/null || true',
      'cd /opt/lingji',
      'pm2 start node_modules/next/dist/bin/next --name lingji -- start -p 3000',
      'pm2 save',
      'echo "=== Deploy OK $(date) ==="',
      'pm2 list',
    ].join('\n');

    await writeFile(deployScript, script);
    await chmod(deployScript, 0o755);

    // 延迟 3 秒执行，确保 HTTP 响应已返回
    const child = spawn(
      'nohup',
      ['bash', '-c', `sleep 3 && bash "${deployScript}" && rm -f "${deployScript}"`],
      {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
        env: {
          PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          HOME: process.env.HOME || '/root',
          NODE_ENV: process.env.NODE_ENV || 'production',
        },
      }
    );
    child.unref();

    return NextResponse.json({ ok: true, message: 'Deploy scheduled' });
  } catch (err) {
    console.error('[deploy/upload]', err);
    return NextResponse.json(
      { error: 'Upload failed', detail: String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST', hint: 'CI 通过 POST 上传 deploy.tar.gz' },
    { status: 405 }
  );
}
