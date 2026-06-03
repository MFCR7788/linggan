'use client';

// 账号类型 hook — 读 / 写 user.accountType
// 优先级:1) useUser() 的 accountType 字段  2) localStorage 兜底(dev 模式常用)
// 写入:调 PATCH /user/profile,成功后写 localStorage 立即生效(不等待 invalidate)

import { useCallback, useMemo } from 'react';
import { useUser } from './use-user';
import { apiClient } from '@/lib/api-client';
import { getAccountTypePreset } from '@/lib/account-presets';
import type { AccountTypeId } from '@/lib/account-presets';

const LS_KEY = 'lingji_account_type';

/** 从 localStorage 读账号类型(SSR 安全) */
function getLocalAccountType(): AccountTypeId | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(LS_KEY);
    return (v as AccountTypeId) || null;
  } catch {
    return null;
  }
}

/** 写 localStorage */
function setLocalAccountType(id: AccountTypeId | null) {
  if (typeof window === 'undefined') return;
  try {
    if (id) localStorage.setItem(LS_KEY, id);
    else localStorage.removeItem(LS_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export function useAccountType() {
  const { data: user, refetch } = useUser();
  const localType = useMemo(() => getLocalAccountType(), []);

  // user.account_type 是后端真源,localStorage 是兜底(dev 模式 / 后端暂不支持)
  const accountType: AccountTypeId | null = useMemo(() => {
    const fromUser = (user?.account_type as AccountTypeId) || null;
    return fromUser || localType;
  }, [user?.account_type, localType]);

  const preset = useMemo(() => getAccountTypePreset(accountType), [accountType]);

  /** 写入账号类型:同步写 localStorage,异步 PATCH /user/profile,成功后 refetch */
  const setAccountType = useCallback(
    async (id: AccountTypeId | null) => {
      // 立即写 localStorage(下次读立即生效)
      setLocalAccountType(id);

      // 调后端 PATCH(若失败不阻塞本地,下次同步会被覆盖)
      if (id) {
        try {
          const res = await apiClient.patch('/user/profile', { account_type: id });
          if (res.success) {
            // refetch 拿最新 user
            await refetch();
            return { ok: true, error: null };
          }
          return { ok: false, error: res.error || '保存失败' };
        } catch (e: any) {
          return { ok: false, error: e?.message || '保存失败' };
        }
      }
      return { ok: true, error: null };
    },
    [refetch]
  );

  return {
    accountType,
    preset,
    setAccountType,
  };
}
