// GoalProgress — 追踪计划执行进度
// UI 事件通知，每次工具调用后自动更新进度

import type { ExecutionPlan, PlanStep } from './types';
import { updatePlanProgress, isPlanComplete, getCurrentStep } from './goal-planner';

export interface ProgressSnapshot {
  goal: string;
  totalSteps: number;
  completedSteps: number;
  currentStep: PlanStep | null;
  isComplete: boolean;
  subgoals: PlanStep[];
}

export class GoalProgressTracker {
  private plan: ExecutionPlan | null = null;
  private completedTools: Set<string> = new Set();

  setPlan(plan: ExecutionPlan): void {
    this.plan = plan;
    this.completedTools.clear();
  }

  markToolExecuted(toolName: string): void {
    this.completedTools.add(toolName);

    if (this.plan) {
      this.plan = updatePlanProgress(this.plan, [...this.completedTools]);
    }
  }

  getSnapshot(): ProgressSnapshot | null {
    if (!this.plan) return null;
    const subgoals = this.plan.subgoals;
    const completedSteps = subgoals.filter((sg) => sg.done).length;

    return {
      goal: this.plan.goal,
      totalSteps: subgoals.length,
      completedSteps,
      currentStep: getCurrentStep(this.plan),
      isComplete: isPlanComplete(this.plan),
      subgoals,
    };
  }

  hasPlan(): boolean {
    return this.plan !== null;
  }

  reset(): void {
    this.plan = null;
    this.completedTools.clear();
  }
}
