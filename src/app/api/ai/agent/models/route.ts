// GET /api/ai/agent/models — 返回当前可用的 Agent 模型列表（按 provider API key 过滤）
// 仅返回 supportsTools 的模型

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { ProviderRegistry } from '@/lib/providers/registry';

export const GET = withAuth(async () => {
  const registry = ProviderRegistry.instance;
  const models: Array<{
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    maxOutputTokens: number;
    supportsVision: boolean;
  }> = [];

  for (const p of registry.listAvailable()) {
    for (const m of p.models) {
      if (!m.supportsTools) continue;
      models.push({
        id: m.id,
        name: m.name,
        provider: p.displayName,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        supportsVision: m.supportsVision,
      });
    }
  }

  return NextResponse.json({ success: true, data: models });
});
