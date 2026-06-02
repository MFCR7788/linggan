// 配额配置与检查
// 不同 plan 用户的存储 / 月上传次数限制

import type { UserPlan } from '@/types';

export interface QuotaConfig {
  storageMB: number;
  monthlyUploads: number;
  monthlyImageBatch: number;      // V2.0.1: 每月批量生图任务数（按"批"计）
  monthlyImageBatchItems: number; // V2.0.1: 每月批量生图张数
}

export const QUOTA: Record<UserPlan, QuotaConfig> = {
  free: { storageMB: 200, monthlyUploads: 100, monthlyImageBatch: 20, monthlyImageBatchItems: 200 },
  pro: { storageMB: 5000, monthlyUploads: 1000, monthlyImageBatch: 200, monthlyImageBatchItems: 5000 },
  creator: { storageMB: 50000, monthlyUploads: 10000, monthlyImageBatch: 2000, monthlyImageBatchItems: 50000 },
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

// V2.0.1 批量生图配额检查
export interface BatchQuotaCheckInput {
  plan: UserPlan;
  monthlyImageBatch: number;       // 本月已用批次数
  monthlyImageBatchItems: number;  // 本月已用张数
  additionalBatches: number;       // 本次要提交的批次数
  additionalItems: number;         // 本次要生成的总张数
}

export interface BatchQuotaCheckResult {
  ok: boolean;
  reason?: 'BATCH_LIMIT_EXCEEDED' | 'BATCH_ITEMS_LIMIT_EXCEEDED';
  message?: string;
  usedBatches?: number;
  limitBatches?: number;
  usedItems?: number;
  limitItems?: number;
}

export function checkBatchQuota(input: BatchQuotaCheckInput): BatchQuotaCheckResult {
  const config = QUOTA[input.plan] || QUOTA.free;

  if (input.monthlyImageBatch + input.additionalBatches > config.monthlyImageBatch) {
    return {
      ok: false,
      reason: 'BATCH_LIMIT_EXCEEDED',
      message: `本月批量任务数超额（${input.monthlyImageBatch + input.additionalBatches}/${config.monthlyImageBatch}），升级套餐可获得更多额度`,
      usedBatches: input.monthlyImageBatch,
      limitBatches: config.monthlyImageBatch,
    };
  }

  if (input.monthlyImageBatchItems + input.additionalItems > config.monthlyImageBatchItems) {
    return {
      ok: false,
      reason: 'BATCH_ITEMS_LIMIT_EXCEEDED',
      message: `本月批量生图张数超额（${input.monthlyImageBatchItems + input.additionalItems}/${config.monthlyImageBatchItems}），升级套餐可获得更多额度`,
      usedItems: input.monthlyImageBatchItems,
      limitItems: config.monthlyImageBatchItems,
    };
  }

  return { ok: true };
}
