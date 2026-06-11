// GoalPlanner — 复杂任务分解为子目标
// 参考 Hermes goals.py Ralph-style goal loop + delegate_task 模式
// Agent loop 开始时调用，生成执行计划

import { defaultModelRouter } from '@/lib/providers/model-router';
import { detectTaskType } from '@/lib/providers/cost-matrix';
import type { ExecutionPlan, PlanStep } from './types';

const PLAN_PROMPT = `你是一个任务规划助手。分析用户请求，判断是否需要分解为多步骤计划。

用户请求: {userMessage}

规则:
- 简单任务（1-2 步即可完成，如问候、简单问答、单步搜索）→ needsPlan: false
- 复杂任务（需要 3+ 步骤，如品牌全案、综合分析、多工具协作）→ needsPlan: true

如果 needsPlan 为 true，返回执行计划:
{
  "needsPlan": true,
  "goal": "简洁的一行目标描述",
  "subgoals": [
    {
      "id": 1,
      "title": "步骤标题",
      "description": "具体做什么",
      "expectedTools": ["工具名"]
    }
  ]
}

如果不需要计划:
{
  "needsPlan": false,
  "goal": "",
  "subgoals": []
}

重要: 复杂任务 3-7 个子目标，每个子目标明确列出预期工具。预期工具必须是实际存在的工具（如 search_web, generate_image, read_inspiration 等），不要编造工具名。
只返回 JSON，不要其他内容。`;

export class GoalPlanner {
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async plan(userMessage: string): Promise<ExecutionPlan | null> {
    if (!this.enabled) return null;

    // 快速判断：短消息不需要计划
    const taskType = detectTaskType(userMessage);
    if (taskType === 'simple_answer') return null;

    const prompt = PLAN_PROMPT.replace('{userMessage}', userMessage);

    try {
      const response = await defaultModelRouter.chat(
        [{ role: 'user', content: prompt }],
        {
          temperature: 0.2,
          maxTokens: 1024,
          taskType: 'simple_answer', // 计划生成用便宜模型
        }
      );

      const plan = this.parseResponse(response);
      if (!plan || !plan.needsPlan || plan.subgoals.length === 0) return null;

      return {
        goal: plan.goal,
        subgoals: plan.subgoals.map((s: { id: number; title: string; description: string; expectedTools: string[] }) => ({
          id: String(s.id),
          title: s.title,
          description: s.description,
          expectedTools: s.expectedTools || [],
          done: false,
        })),
      };
    } catch (e) {
      console.warn('[GoalPlanner] 计划生成失败:', e);
      return null;
    }
  }

  private parseResponse(text: string): { needsPlan: boolean; goal: string; subgoals: Array<{ id: number; title: string; description: string; expectedTools: string[] }> } | null {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

/** 根据已执行的工具更新计划进度 */
export function updatePlanProgress(plan: ExecutionPlan, completedTools: string[]): ExecutionPlan {
  const subgoals = plan.subgoals.map((sg) => {
    if (sg.done) return sg;

    const allToolsDone = sg.expectedTools.length > 0
      && sg.expectedTools.every((t) => completedTools.includes(t));

    return { ...sg, done: allToolsDone };
  });

  return { ...plan, subgoals };
}

export function isPlanComplete(plan: ExecutionPlan): boolean {
  return plan.subgoals.every((sg) => sg.done);
}

export function getCurrentStep(plan: ExecutionPlan): PlanStep | null {
  return plan.subgoals.find((sg) => !sg.done) || null;
}

/** 全局单例 */
let globalPlanner: GoalPlanner | null = null;

export function getGoalPlanner(): GoalPlanner {
  if (!globalPlanner) {
    globalPlanner = new GoalPlanner();
  }
  return globalPlanner;
}
