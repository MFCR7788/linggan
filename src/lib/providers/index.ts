// Provider 抽象层 — barrel export
// 导入 builtin 触发模块级自注册

export { ProviderRegistry } from './registry';
export { ModelRouter } from './model-router';
export {
  resolveTaskModel,
  detectTaskType,
  accumulateCost,
  getSessionCostEstimate,
  resetSessionCost,
} from './cost-matrix';
export type {
  TaskType,
  TaskModelResult,
  CostEstimate,
} from './cost-matrix';
export type {
  ProviderProfile,
  ModelCapability,
  ResolvedModel,
  ApiMode,
  ExtraBodyContext,
} from './types';

// 触发 builtin provider 自注册（side-effect import）
import './builtin/dashscope';
import './builtin/volcengine';
import './builtin/openrouter';
