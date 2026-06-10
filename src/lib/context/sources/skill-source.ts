// SkillSource — 技能匹配 + 工具绑定上下文来源

import type { ContextSource, ContextInput, ContextChunk } from '../assembler';
import type { SkillsHub } from '@/lib/assistant/skills/hub';
import type { ToolRegistry } from '@/lib/agent/tools/registry';
import { activateSkillTools } from '@/lib/assistant/skills/tool-binding';

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
      const matches = this.hub.matchSkills(input.userMessage, 3);

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

      const skillsBlock = this.hub.buildSkillsPromptBlock();

      return {
        source: this.name,
        promptBlock: skillsBlock,
        priority: this.priority,
        raw: activatedSkills,
      };
    } catch {
      return null;
    }
  }
}
