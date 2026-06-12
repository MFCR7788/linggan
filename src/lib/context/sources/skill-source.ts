// SkillSource — 技能匹配 + 工具绑定上下文来源
// 匹配到的技能注入完整 prompt_template，让 Agent 按工作流执行

import type { ContextSource, ContextInput, ContextChunk } from '../assembler';
import type { SkillsHub } from '@/lib/assistant/skills/hub';
import type { ToolRegistry } from '@/lib/agent/tools/registry';
import { activateSkillTools } from '@/lib/assistant/skills/tool-binding';

const PROMPT_INJECT_THRESHOLD = 0.25; // 匹配分数高于此值时注入完整 prompt_template

export class SkillSource implements ContextSource {
  readonly name = 'skills';
  readonly priority = 30;

  private hub: SkillsHub;
  private toolRegistry?: ToolRegistry;

  constructor(hub: SkillsHub, toolRegistry?: ToolRegistry) {
    this.hub = hub;
    this.toolRegistry = toolRegistry;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async fetch(input: ContextInput): Promise<ContextChunk | null> {
    try {
      const matches = this.hub.matchSkills(input.userMessage, 5);

      if (matches.length === 0) return null;

      // 激活匹配技能的绑定工具
      const activatedSkills: string[] = [];

      if (this.toolRegistry) {
        for (const match of matches) {
          const activation = activateSkillTools(match.skill, this.toolRegistry);
          if (activation) {
            activatedSkills.push(activation.skillName);
          }
        }
      }

      // 构建技能提示块
      const parts: string[] = [];

      // 高匹配度技能：注入完整 prompt_template
      const highMatches = matches.filter((m) => m.score >= PROMPT_INJECT_THRESHOLD);
      const lowMatches = matches.filter((m) => m.score < PROMPT_INJECT_THRESHOLD);

      for (const match of highMatches) {
        // 加载完整技能内容（含 prompt_template）
        const fullSkill = await this.hub.viewSkill(match.skill.id);
        if (fullSkill?.promptTemplate) {
          parts.push(
            `<activated-skill name="${fullSkill.name}" display="${fullSkill.displayName}" score="${match.score.toFixed(2)}">\n` +
            '以下是该技能的完整工作流程。你必须严格按照步骤执行，每步完成后向用户展示结果并确认。\n\n' +
            fullSkill.promptTemplate +
            '\n</activated-skill>'
          );
        }
      }

      // 低匹配度技能：仅列名称，供用户参考
      if (lowMatches.length > 0) {
        const list = lowMatches.map((m) => `- ${m.skill.displayName}（相关度 ${(m.score * 100).toFixed(0)}%）`).join('\n');
        parts.push(`<available-skills>\n以下技能也可用，但匹配度较低，仅在用户明确需要时使用：\n${list}\n</available-skills>`);
      }

      if (parts.length === 0) return null;

      return {
        source: this.name,
        promptBlock: parts.join('\n\n'),
        priority: this.priority,
        raw: activatedSkills,
      };
    } catch {
      return null;
    }
  }
}
