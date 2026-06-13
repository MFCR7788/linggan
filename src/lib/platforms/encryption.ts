// Token 加密工具
// 用 AES-256-GCM 加密 OAuth access_token / refresh_token
// 密钥从 PLATFORM_ENCRYPTION_KEY 读(32 字节 hex)

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { getPlatformEncryptionKey } from '@/lib/runtime-config';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

function getKey(): Buffer {
  const raw = getPlatformEncryptionKey();
  if (!raw) {
    throw new Error('PLATFORM_ENCRYPTION_KEY 未配置(在 .env.local 写入 32 字节 hex 字符串)');
  }
  // 接受 hex 或字符串 — 不够 32 字节时用 scrypt 派生
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = scryptSync(raw, 'lingji-salt', 32);
  }
  return key;
}

/**
 * 加密
 * 输出格式: base64( iv(12) || authTag(16) || ciphertext )
 */
export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, enc]).toString('base64');
}

/**
 * 解密
 */
export function decryptToken(encrypted: string): string {
  const key = getKey();
  const buf = Buffer.from(encrypted, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString('utf8');
}

/**
 * 用于开发/测试环境:如果没配密钥,返回原值(警告)
 */
export function encryptTokenUnsafe(plain: string): string {
  if (!getPlatformEncryptionKey()) {
    console.warn('[encryption] PLATFORM_ENCRYPTION_KEY 未配置, 使用明文存储 (仅供开发)');
    return `plain:${plain}`;
  }
  return encryptToken(plain);
}

export function decryptTokenUnsafe(encrypted: string): string {
  if (encrypted.startsWith('plain:')) {
    return encrypted.substring(6);
  }
  return decryptToken(encrypted);
}
