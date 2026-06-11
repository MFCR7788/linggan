// 模型成本感知路由 — 任务类型 → 推荐模型映射
// 参考 Hermes auxiliary_client.py _resolve_task_provider_model() 模式

import { ProviderRegistry } from './registry';

// ====== 任务类型 ======

export type TaskType =
  | 'main_chat'       // 主对话（复杂推理 + 工具调用）
  | 'simple_answer'   // 简单问答 / 闲聊
  | 'title_gen'       // 标题生成
  | 'memory_extract'  // 记忆提取
  | 'compress'        // 上下文压缩
  | 'embedding'       // 向量嵌入
  | 'code_gen'        // 代码生成
  | 'creative';       // 创意写作

// ====== 模型成本（每 1M tokens，美元估算） ======

interface ModelCost {
  inputPer1M: number;
  outputPer1M: number;
}

const MODEL_COSTS: Record<string, ModelCost> = {
  'agnes-2.0-flash': { inputPer1M: 0, outputPer1M: 0 },
  'qwen-turbo':     { inputPer1M: 0.15, outputPer1M: 0.30 },
  'qwen-plus':      { inputPer1M: 0.30, outputPer1M: 0.60 },
  'qwen-max':       { inputPer1M: 1.20, outputPer1M: 2.40 },
  'deepseek-v3':    { inputPer1M: 0.50, outputPer1M: 1.00 },
  'deepseek-r1':    { inputPer1M: 1.00, outputPer1M: 4.00 },
};

// ====== 任务 → 推荐模型（按性价比） ======

const TASK_MODEL_MAP: Record<TaskType, { preferred: string; fallback: string }> = {
  simple_answer:   { preferred: 'qwen-plus',  fallback: 'qwen-max' },
  title_gen:       { preferred: 'qwen-plus',  fallback: 'qwen-max' },
  memory_extract:  { preferred: 'qwen-plus',  fallback: 'qwen-max' },
  compress:        { preferred: 'qwen-plus',  fallback: 'qwen-max' },
  embedding:       { preferred: 'qwen-plus',  fallback: 'qwen-max' },
  main_chat:       { preferred: 'deepseek-v3', fallback: 'qwen-max' },
  creative:        { preferred: 'deepseek-v3', fallback: 'qwen-max' },
  code_gen:        { preferred: 'deepseek-v3', fallback: 'qwen-max' },
};

// ====== 路由逻辑 ======

export interface TaskModelResult {
  model: string;
  cost: ModelCost | null;
  taskType: TaskType;
}

export function resolveTaskModel(
  taskType: TaskType,
  explicitPreference?: string
): TaskModelResult {
  const registry = ProviderRegistry.instance;

  // 1. 用户显式指定 → 直接使用
  if (explicitPreference) {
    const cost = MODEL_COSTS[explicitPreference] || null;
    return { model: explicitPreference, cost, taskType };
  }

  // 2. 查任务映射表
  const mapping = TASK_MODEL_MAP[taskType];
  const preferred = mapping?.preferred || 'deepseek-v3';
  const fallback = mapping?.fallback || 'qwen-max';

  // 3. 验证 preferred 是否可用
  if (isModelAvailable(registry, preferred)) {
    return { model: preferred, cost: MODEL_COSTS[preferred] || null, taskType };
  }

  // 4. 降级到 fallback
  if (isModelAvailable(registry, fallback)) {
    return { model: fallback, cost: MODEL_COSTS[fallback] || null, taskType };
  }

  // 5. 最终降级：任意可用模型
  for (const provider of registry.listAvailable()) {
    if (provider.models.length > 0) {
      const m = provider.models[0];
      return { model: m.id, cost: MODEL_COSTS[m.id] || null, taskType };
    }
  }

  throw new Error('No available AI model found');
}

function isModelAvailable(registry: ProviderRegistry, modelId: string): boolean {
  for (const provider of registry.listAvailable()) {
    if (provider.models.some((m) => m.id === modelId)) return true;
  }
  return false;
}

// ====== 成本估算 ======

export interface CostEstimate {
  estimatedCostUsd: number;
  tokensUsed: number;
  model: string;
}

let sessionCostAccumulator = 0;
let sessionTokenCount = 0;

export function accumulateCost(tokens: number, model: string): void {
  const cost = MODEL_COSTS[model];
  if (!cost) return;

  const perTokenOutput = cost.outputPer1M / 1_000_000;
  sessionCostAccumulator += tokens * perTokenOutput;
  sessionTokenCount += tokens;
}

export function getSessionCostEstimate(model: string): CostEstimate {
  return {
    estimatedCostUsd: Math.round(sessionCostAccumulator * 10_000) / 10_000,
    tokensUsed: sessionTokenCount,
    model,
  };
}

export function resetSessionCost(): void {
  sessionCostAccumulator = 0;
  sessionTokenCount = 0;
}

// ====== 简单任务检测（基于用户消息判断是否可用便宜模型） ======

const SIMPLE_PATTERNS = [
  /^(你好|hi|hello|嘿|在吗|早上好|晚上好|下午好)[!！。.]*$/i,
  /^(谢谢|感谢|多谢|thanks?)[!！。.]*$/i,
  /^(好的|ok|嗯|哦|明白了|知道了)[!！。.]*$/i,
  /^(再见|拜拜|bye|回头见)[!！。.]*$/i,
  /^今天天气.{0,10}$/,
  /^现在几点/,
];

export function detectTaskType(userMessage: string): TaskType {
  const trimmed = userMessage.trim();

  // 代码相关（优先检测）
  if (/写.*(代码|程序|函数|算法)|编程|bug|修复|重构|debug/i.test(trimmed)) {
    return 'code_gen';
  }

  // 创意写作（优先检测）
  if (/(写|创作).*(小说|故事|诗歌|散文|文案|剧本|歌词)|帮我写(一|这篇)/i.test(trimmed)) {
    return 'creative';
  }

  // 检测简单模式
  if (SIMPLE_PATTERNS.some((p) => p.test(trimmed))) {
    return 'simple_answer';
  }

  // 短消息 + 无工具需求 → simple
  if (trimmed.length < 20 && !/[?？]/.test(trimmed)) {
    return 'simple_answer';
  }

  // 默认主对话
  return 'main_chat';
}
