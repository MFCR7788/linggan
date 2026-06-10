// ComboSkillSource — 推荐组合技能匹配上下文来源
// 基于关键词快速匹配用户意图 → 推荐对应创作流程 → 注入 workflow prompt

import type { ContextSource, ContextInput, ContextChunk } from '../assembler';
import type { SkillDefinition } from '@/lib/assistant/types';
import { AgentSkillMatcher } from '@/lib/agent/skills/agent-skill-matcher';
import { buildSkillPromptBlock } from '@/lib/agent/skills/skill-tool-bridge';

export class ComboSkillSource implements ContextSource {
  readonly name = 'combo-skills';
  readonly priority = 25; // 介于 knowledge(20) 和 skills(30) 之间

  private matcher: AgentSkillMatcher;

  constructor(matcher: AgentSkillMatcher) {
    this.matcher = matcher;
  }

  async isAvailable(): Promise<boolean> {
    return this.matcher.getAllSkills().length > 0;
  }

  async fetch(input: ContextInput): Promise<ContextChunk | null> {
    try {
      const result = this.matcher.match(input.userMessage, {
        minScore: 0.15,
        topK: 3,
        autoBindThreshold: 0.3,
      });

      if (result.matches.length === 0) return null;

      const matchedSkills = result.matches.map(m => m.skill);
      const promptBlock = buildSkillPromptBlock(matchedSkills);

      return {
        source: this.name,
        promptBlock,
        priority: this.priority,
        raw: {
          matchedSkills: result.recommendations,
          skillIds: matchedSkills.map(s => s.id),
        },
      };
    } catch {
      return null;
    }
  }
}
