// OAuth state 工具
// state 是随机字符串,临时存到 KV/cookie 用来验证回调是用户本人发起的

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getPlatformEncryptionKey } from '@/lib/runtime-config';

const STATE_TTL_SEC = 600; // 10 分钟

interface StatePayload {
  userId: string;
  platform: string;
  nonce: string;
  exp: number;     // 过期时间戳(秒)
}

function getSecret(): string {
  const key = getPlatformEncryptionKey() || process.env.JWT_SECRET;
  if (!key) {
    throw new Error('PLATFORM_ENCRYPTION_KEY 或 JWT_SECRET 未配置，无法签名 OAuth state。请在 .env.local 中设置 PLATFORM_ENCRYPTION_KEY。');
  }
  return key;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex').substring(0, 16);
}

export function buildState(userId: string, platform: string): string {
  const payload: StatePayload = {
    userId,
    platform,
    nonce: randomBytes(8).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SEC,
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  return `${b64}.${sign(b64)}`;
}

export function verifyState(state: string): StatePayload | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  if (sign(b64) !== sig) return null;

  try {
    const json = Buffer.from(b64, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as StatePayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * 用 timingSafeEqual 防止时序攻击
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
