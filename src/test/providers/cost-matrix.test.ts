// 成本矩阵 + 任务路由测试

import { describe, it, expect } from 'vitest';
import {
  detectTaskType,
  resolveTaskModel,
  accumulateCost,
  getSessionCostEstimate,
  resetSessionCost,
} from '@/lib/providers/cost-matrix';

describe('detectTaskType', () => {
  it('简单问候识别为 simple_answer', () => {
    expect(detectTaskType('你好')).toBe('simple_answer');
    expect(detectTaskType('早上好')).toBe('simple_answer');
    expect(detectTaskType('谢谢')).toBe('simple_answer');
    expect(detectTaskType('OK')).toBe('simple_answer');
  });

  it('短消息识别为 simple_answer', () => {
    expect(detectTaskType('嗯嗯')).toBe('simple_answer');
    expect(detectTaskType('知道了')).toBe('simple_answer');
  });

  it('代码相关识别为 code_gen', () => {
    expect(detectTaskType('帮我写一个排序函数')).toBe('code_gen');
    expect(detectTaskType('这段代码有bug帮我修复')).toBe('code_gen');
    expect(detectTaskType('重构一下这个组件')).toBe('code_gen');
  });

  it('创意写作识别为 creative', () => {
    expect(detectTaskType('帮我写一篇小说')).toBe('creative');
    expect(detectTaskType('创作一首诗歌')).toBe('creative');
    expect(detectTaskType('写一段品牌文案')).toBe('creative');
  });

  it('复杂长消息默认识别为 main_chat', () => {
    expect(detectTaskType('请帮我做一套完整的品牌全案策划，包括市场分析和竞品调研')).toBe('main_chat');
  });
});

describe('resolveTaskModel', () => {
  it('显式指定模型优先于任务类型', () => {
    const result = resolveTaskModel('main_chat', 'deepseek-r1');
    expect(result.model).toBe('deepseek-r1');
    expect(result.taskType).toBe('main_chat');
  });

  it('taskType 正确传递到结果', () => {
    const result = resolveTaskModel('simple_answer', 'qwen-plus');
    expect(result.taskType).toBe('simple_answer');
  });

  it('未知模型返回 null cost', () => {
    const result = resolveTaskModel('main_chat', 'unknown-model');
    expect(result.model).toBe('unknown-model');
    expect(result.cost).toBeNull();
  });

  it('已知模型返回对应 cost', () => {
    const result = resolveTaskModel('main_chat', 'deepseek-v3');
    expect(result.cost).not.toBeNull();
    expect(result.cost!.inputPer1M).toBe(0.50);
    expect(result.cost!.outputPer1M).toBe(1.00);
  });
});

describe('cost tracking', () => {
  it('accumulateCost 累加', () => {
    resetSessionCost();
    accumulateCost(1000, 'deepseek-v3');
    const est = getSessionCostEstimate('deepseek-v3');
    expect(est.tokensUsed).toBe(1000);
    expect(est.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('resetSessionCost 归零', () => {
    accumulateCost(500, 'qwen-plus');
    resetSessionCost();
    const est = getSessionCostEstimate('qwen-plus');
    expect(est.tokensUsed).toBe(0);
  });
});
