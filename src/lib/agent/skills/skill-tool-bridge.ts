// Skill ↔ Tool 桥接
// 当技能匹配后，将其 boundTools 自动注册到 ToolRegistry
// 技能过期/会话结束后自动清理

import type { SkillDefinition } from '@/lib/assistant/types';
import type { ToolRegistry } from '@/lib/agent/tools/registry';
import type { ToolDefinition } from '@/lib/agent/types';

export interface BridgeSession {
  /** 当前激活的技能 ID 集合 */
  activeSkillIds: Set<string>;
  /** 技能 ID → 绑定的工具名列表 */
  skillTools: Map<string, string[]>;
  /** 已通过桥接注册的工具名（用于清理） */
  bridgedToolNames: Set<string>;
}

/**
 * 创建桥接会话
 */
export function createBridgeSession(): BridgeSession {
  return {
    activeSkillIds: new Set(),
    skillTools: new Map(),
    bridgedToolNames: new Set(),
  };
}

/**
 * 激活技能：注册其 boundTools 到 registry
 * 返回新注册的工具名列表
 */
export function activateSkills(
  skills: SkillDefinition[],
  registry: ToolRegistry,
  allTools: ToolDefinition[],
  session: BridgeSession
): string[] {
  const newlyRegistered: string[] = [];

  for (const skill of skills) {
    if (session.activeSkillIds.has(skill.id)) continue;
    if (!skill.boundTools || skill.boundTools.length === 0) continue;

    session.activeSkillIds.add(skill.id);
    session.skillTools.set(skill.id, [...skill.boundTools]);

    for (const toolName of skill.boundTools) {
      // 已注册则跳过
      if (registry.get(toolName)) continue;
      if (session.bridgedToolNames.has(toolName)) continue;

      const tool = allTools.find(t => t.name === toolName);
      if (tool) {
        registry.register(tool, {
          override: false,
          toolset: `skill_${skill.id}`,
        });
        session.bridgedToolNames.add(toolName);
        newlyRegistered.push(toolName);
      }
    }
  }

  return newlyRegistered;
}

/**
 * 停用技能：从 registry 中移除其绑定的工具
 */
export function deactivateSkills(
  skillIds: string[],
  registry: ToolRegistry,
  session: BridgeSession
): string[] {
  const removed: string[] = [];

  for (const skillId of skillIds) {
    if (!session.activeSkillIds.has(skillId)) continue;

    session.activeSkillIds.delete(skillId);
    const toolNames = session.skillTools.get(skillId) || [];

    for (const toolName of toolNames) {
      // 检查是否还有其他激活的技能在使用此工具
      let stillNeeded = false;
      for (const [otherSkillId, otherTools] of session.skillTools) {
        if (otherSkillId !== skillId && session.activeSkillIds.has(otherSkillId)) {
          if (otherTools.includes(toolName)) {
            stillNeeded = true;
            break;
          }
        }
      }

      if (!stillNeeded) {
        registry.deregister(toolName);
        session.bridgedToolNames.delete(toolName);
        removed.push(toolName);
      }
    }

    session.skillTools.delete(skillId);
  }

  return removed;
}

/**
 * 清理桥接会话中的所有工具
 */
export function cleanupBridgeSession(
  registry: ToolRegistry,
  session: BridgeSession
): number {
  let count = 0;
  for (const toolName of session.bridgedToolNames) {
    if (registry.deregister(toolName)) count++;
  }
  session.activeSkillIds.clear();
  session.skillTools.clear();
  session.bridgedToolNames.clear();
  return count;
}

/**
 * 构建 skill 系统提示块（注入到 Agent system prompt）
 */
export function buildSkillPromptBlock(skills: SkillDefinition[]): string {
  if (skills.length === 0) return '';

  const lines = skills.map(s => {
    const tools = s.boundTools?.length ? ` [工具: ${s.boundTools.join(', ')}]` : '';
    return `- **${s.displayName}**: ${s.description.slice(0, 100)}${tools}`;
  });

  return (
    '<available-skills>\n' +
    '你已匹配以下创作技能。当用户的需求与技能匹配时，按技能流程逐步调用工具完成创作。\n' +
    '每个技能有预设步骤，按顺序执行，每步完成后询问用户意见。\n\n' +
    lines.join('\n') +
    '\n</available-skills>'
  );
}
