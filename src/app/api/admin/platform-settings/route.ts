// 平台集成配置中心 API (V2.0.2 后续)
// 6 个 env 的查看/更新/清空/自动生成
// 注: 这是"配置中心",不是 env 的真源 — Vercel 的 process.env 仍是真源
//
// GET    /api/admin/platform-settings                → 拉 6 行元信息(不返 value)
// PUT    /api/admin/platform-settings                → 更新 1 个 { keyName, value }
// DELETE /api/admin/platform-settings?keyName=xxx    → 清空 1 个
// POST   /api/admin/platform-settings?action=auto-generate&keyName=PLATFORM_ENCRYPTION_KEY
//        → 自动生成 64 字符 hex,返明文一次(让用户复制到 Vercel)

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { encryptToken, decryptToken } from '@/lib/platforms/encryption';
import { randomBytes } from 'node:crypto';

export const dynamic = 'force-dynamic';

const VALID_KEYS = [
  'PLATFORM_ENCRYPTION_KEY',
  'CRON_SECRET',
  'WECHAT_MP_APP_ID',
  'WECHAT_MP_APP_SECRET',
  'WEIBO_APP_KEY',
  'WEIBO_APP_SECRET',
] as const;

type KeyName = typeof VALID_KEYS[number];

function isValidKey(k: string): k is KeyName {
  return (VALID_KEYS as readonly string[]).includes(k);
}

/**
 * 拉 6 行元信息(永远不返 value_encrypted)
 */
export const GET = withAuth(async () => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('platform_integration_settings')
    .select('key_name, is_configured, configured_at, configured_by, description, apply_url, category, value_encrypted')
    .order('category', { ascending: true });

  if (error) return createApiError(error.message, 500);

  // value_encrypted → hasValue 布尔(不返明文)
  const settings = (data || []).map((row: any) => ({
    keyName: row.key_name,
    isConfigured: row.is_configured,
    hasValue: !!row.value_encrypted,
    configuredAt: row.configured_at,
    configuredBy: row.configured_by,
    description: row.description,
    applyUrl: row.apply_url,
    category: row.category,
  }));

  return createApiResponse({ settings });
});

/**
 * 更新 1 个值
 */
export const PUT = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { keyName, value } = body as { keyName?: string; value?: string };

  if (!keyName || !isValidKey(keyName)) {
    return createApiError(`keyName 无效(允许: ${VALID_KEYS.join(', ')})`, 400);
  }
  if (typeof value !== 'string' || value.length === 0) {
    return createApiError('value 必填(非空字符串)', 400);
  }
  if (value.length > 1000) {
    return createApiError('value 超过 1000 字符', 400);
  }

  let encrypted: string;
  try {
    encrypted = encryptToken(value);
  } catch (e: any) {
    // PLATFORM_ENCRYPTION_KEY 未配置时无法加密 — 但当前 key 正是要存的
    // 用 unsafe 兜底
    return createApiError(
      `加密失败: ${e.message}。请先在 Vercel 配置 PLATFORM_ENCRYPTION_KEY,或在站内「平台集成」点击「自动生成」来初始化。`,
      500
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('platform_integration_settings')
    .update({
      value_encrypted: encrypted,
      is_configured: true,
      configured_by: user.id,
      configured_at: new Date().toISOString(),
    })
    .eq('key_name', keyName);

  if (error) return createApiError(error.message, 500);

  return createApiResponse({ ok: true, keyName }, '已保存(同步到 Vercel 后才生效)');
});

/**
 * 清空 1 个
 */
export const DELETE = withAuth(async ({ request }) => {
  const url = new URL(request.url);
  const keyName = url.searchParams.get('keyName');
  if (!keyName || !isValidKey(keyName)) {
    return createApiError('keyName 必填且有效', 400);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('platform_integration_settings')
    .update({
      value_encrypted: null,
      is_configured: false,
      configured_at: null,
      configured_by: null,
    })
    .eq('key_name', keyName);

  if (error) return createApiError(error.message, 500);

  return createApiResponse({ ok: true, keyName }, '已清空');
});

/**
 * 自动生成(只对 crypto/cron 类生效;oauth 4 个需要用户填)
 * 返明文一次,前端弹窗显示 + 提示"复制到 Vercel"
 */
export const POST = withAuth(async ({ request, user }) => {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  if (action !== 'auto-generate') {
    return createApiError('action 必须为 auto-generate', 400);
  }
  const keyName = url.searchParams.get('keyName');
  if (!keyName || !isValidKey(keyName)) {
    return createApiError('keyName 必填且有效', 400);
  }
  if (keyName !== 'PLATFORM_ENCRYPTION_KEY' && keyName !== 'CRON_SECRET') {
    return createApiError(`自动生成仅对 crypto/cron 类生效,${keyName} 需用户填`, 400);
  }

  // 生成 32 字节随机 hex
  const value = randomBytes(32).toString('hex');

  // 加密 + 写库
  let encrypted: string;
  try {
    encrypted = encryptToken(value);
  } catch (e: any) {
    return createApiError(`加密失败: ${e.message}`, 500);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('platform_integration_settings')
    .update({
      value_encrypted: encrypted,
      is_configured: true,
      configured_by: user.id,
      configured_at: new Date().toISOString(),
    })
    .eq('key_name', keyName);

  if (error) return createApiError(error.message, 500);

  return createApiResponse(
    { keyName, value },
    '已生成(只显示一次,请立即复制到 Vercel)'
  );
});
