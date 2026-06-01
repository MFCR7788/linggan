// 配额配置与检查
// 不同 plan 用户的存储 / 月上传次数限制

import type { UserPlan } from '@/types';

export interface QuotaConfig {
  storageMB: number;
  monthlyUploads: number;
}

export const QUOTA: Record<UserPlan, QuotaConfig> = {
  free: { storageMB: 200, monthlyUploads: 100 },
  pro: { storageMB: 5000, monthlyUploads: 1000 },
  creator: { storageMB: 50000, monthlyUploads: 10000 },
};

export interface QuotaCheckInput {
  plan: UserPlan;
  storageUsedMB: number; // 当前用量
  monthlyUploads: number; // 当前月上传数
  additionalBytes: number;
}

export interface QuotaCheckResult {
  ok: boolean;
  reason?: 'STORAGE_QUOTA_EXCEEDED' | 'MONTHLY_UPLOAD_LIMIT';
  message?: string;
}

export function checkQuota(input: QuotaCheckInput): QuotaCheckResult {
  const config = QUOTA[input.plan] || QUOTA.free;

  if (input.monthlyUploads + 1 > config.monthlyUploads) {
    return {
      ok: false,
      reason: 'MONTHLY_UPLOAD_LIMIT',
      message: `本月上传次数已达上限（${config.monthlyUploads}），升级套餐可获得更多额度`,
    };
  }

  const additionalMB = input.additionalBytes / 1024 / 1024;
  if (input.storageUsedMB + additionalMB > config.storageMB) {
    return {
      ok: false,
      reason: 'STORAGE_QUOTA_EXCEEDED',
      message: `存储空间不足（${config.storageMB}MB），升级套餐可获得更多空间`,
    };
  }

  return { ok: true };
}
