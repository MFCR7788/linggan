// 目标分解测试

import { describe, it, expect } from 'vitest';
import {
  updatePlanProgress,
  isPlanComplete,
  getCurrentStep,
} from '@/lib/agent/goal-planner';
import { GoalProgressTracker } from '@/lib/agent/goal-progress';
import type { ExecutionPlan } from '@/lib/agent/types';

const samplePlan: ExecutionPlan = {
  goal: '创建品牌全案',
  subgoals: [
    { id: '1', title: '市场调研', description: '搜索行业趋势', expectedTools: ['search_web'], done: false },
    { id: '2', title: '品牌定位', description: '分析目标受众', expectedTools: ['search_web', 'read_inspiration'], done: false },
    { id: '3', title: '内容创作', description: '生成文案初稿', expectedTools: ['generate_image'], done: false },
  ],
};

describe('updatePlanProgress', () => {
  it('完成一个工具后标记对应步骤', () => {
    const updated = updatePlanProgress(samplePlan, ['search_web']);
    expect(updated.subgoals[0].done).toBe(true);
    expect(updated.subgoals[1].done).toBe(false);
    expect(updated.subgoals[2].done).toBe(false);
  });

  it('多个工具完成时标记多个步骤', () => {
    const planCopy = JSON.parse(JSON.stringify(samplePlan));
    const updated = updatePlanProgress(planCopy, ['search_web', 'read_inspiration']);
    expect(updated.subgoals[0].done).toBe(true);
    expect(updated.subgoals[1].done).toBe(true); // 两个工具都完成
    expect(updated.subgoals[2].done).toBe(false);
  });

  it('已完成步骤保持 done', () => {
    const planCopy = JSON.parse(JSON.stringify(samplePlan));
    planCopy.subgoals[0].done = true;
    const updated = updatePlanProgress(planCopy, ['generate_image']);
    expect(updated.subgoals[0].done).toBe(true); // 保持 done
    expect(updated.subgoals[2].done).toBe(true);
  });

  it('空工具列表不影响进度', () => {
    const planCopy = JSON.parse(JSON.stringify(samplePlan));
    const updated = updatePlanProgress(planCopy, []);
    expect(updated.subgoals.every(s => !s.done)).toBe(true);
  });
});

describe('isPlanComplete', () => {
  it('所有步骤完成返回 true', () => {
    const plan: ExecutionPlan = {
      goal: 'test',
      subgoals: [
        { id: '1', title: 'a', description: '', expectedTools: [], done: true },
        { id: '2', title: 'b', description: '', expectedTools: [], done: true },
      ],
    };
    expect(isPlanComplete(plan)).toBe(true);
  });

  it('部分完成返回 false', () => {
    const plan: ExecutionPlan = {
      goal: 'test',
      subgoals: [
        { id: '1', title: 'a', description: '', expectedTools: [], done: true },
        { id: '2', title: 'b', description: '', expectedTools: [], done: false },
      ],
    };
    expect(isPlanComplete(plan)).toBe(false);
  });
});

describe('getCurrentStep', () => {
  it('返回第一个未完成的步骤', () => {
    const plan = JSON.parse(JSON.stringify(samplePlan));
    plan.subgoals[0].done = true;
    const step = getCurrentStep(plan);
    expect(step?.title).toBe('品牌定位');
  });

  it('全部完成返回 null', () => {
    const plan: ExecutionPlan = {
      goal: 'test',
      subgoals: [
        { id: '1', title: 'a', description: '', expectedTools: [], done: true },
      ],
    };
    expect(getCurrentStep(plan)).toBeNull();
  });
});

describe('GoalProgressTracker', () => {
  it('setPlan 初始化追踪器', () => {
    const tracker = new GoalProgressTracker();
    tracker.setPlan(samplePlan);
    expect(tracker.hasPlan()).toBe(true);

    const snapshot = tracker.getSnapshot();
    expect(snapshot?.goal).toBe('创建品牌全案');
    expect(snapshot?.totalSteps).toBe(3);
    expect(snapshot?.completedSteps).toBe(0);
  });

  it('markToolExecuted 自动更新进度', () => {
    const tracker = new GoalProgressTracker();
    const planCopy = JSON.parse(JSON.stringify(samplePlan));
    tracker.setPlan(planCopy);

    tracker.markToolExecuted('search_web');
    const snapshot = tracker.getSnapshot();
    expect(snapshot?.completedSteps).toBe(1);
    expect(snapshot?.currentStep?.title).toBe('品牌定位');
  });

  it('reset 清空状态', () => {
    const tracker = new GoalProgressTracker();
    tracker.setPlan(samplePlan);
    tracker.reset();
    expect(tracker.hasPlan()).toBe(false);
    expect(tracker.getSnapshot()).toBeNull();
  });
});
