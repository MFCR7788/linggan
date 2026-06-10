// Skills↔Tools 桥接 — 技能匹配后自动注册绑定工具到 ToolRegistry

import type { SkillDefinition } from '../types';
import type { ToolRegistry } from '@/lib/agent/tools/registry';

export interface SkillToolActivation {
  skillId: string;
  skillName: string;
  boundTools: string[];
  activatedAt: number;
}

/**
 * 将技能的 boundTools 注册到 ToolRegistry
 * 只在全局工具列表中存在这些工具时激活（技能不定义新工具，只绑定已有工具）
 */
export function activateSkillTools(
  skill: SkillDefinition,
  globalRegistry: ToolRegistry
): SkillToolActivation | null {
  if (!skill.boundTools || skill.boundTools.length === 0) return null;

  // 检查 requiredTools
  if (skill.requiredTools) {
    for (const toolName of skill.requiredTools) {
      if (!globalRegistry.get(toolName)) {
        return null; // 必需工具不可用，不激活
      }
    }
  }

  return {
    skillId: skill.id,
    skillName: skill.name,
    boundTools: skill.boundTools,
    activatedAt: Date.now(),
  };
}

/**
 * 批量激活技能的工具绑定
 */
export function activateSkillsTools(
  skills: SkillDefinition[],
  globalRegistry: ToolRegistry
): SkillToolActivation[] {
  return skills
    .map((s) => activateSkillTools(s, globalRegistry))
    .filter((a): a is SkillToolActivation => a !== null);
}
