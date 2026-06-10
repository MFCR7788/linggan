import { describe, it, expect, beforeEach } from 'vitest';
import { activateSkillTools, activateSkillsTools } from '@/lib/assistant/skills/tool-binding';
import { ToolRegistry } from '@/lib/agent/tools/registry';
import type { SkillDefinition } from '@/lib/assistant/types';
import type { ToolDefinition } from '@/lib/agent/types';

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ success: true, output: `${name} result` }),
  };
}

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: 'skill-1',
    name: 'test_skill',
    displayName: '测试技能',
    description: 'A test skill',
    category: 'content',
    tags: ['test'],
    promptTemplate: 'Write about {{topic}}',
    version: '1.0.0',
    visibility: 'official',
    installCount: 10,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Skill Tool Binding', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('activateSkillTools', () => {
    it('无 boundTools 时返回 null', () => {
      const skill = makeSkill();
      const result = activateSkillTools(skill, registry);
      expect(result).toBeNull();
    });

    it('有 boundTools 时正确激活', () => {
      registry.register(makeTool('web_search'));
      registry.register(makeTool('generate_image'));

      const skill = makeSkill({ boundTools: ['web_search', 'generate_image'] });
      const result = activateSkillTools(skill, registry);

      expect(result).not.toBeNull();
      expect(result!.skillId).toBe('skill-1');
      expect(result!.boundTools).toEqual(['web_search', 'generate_image']);
    });

    it('requiredTools 不可用时返回 null', () => {
      registry.register(makeTool('web_search'));

      const skill = makeSkill({
        boundTools: ['web_search'],
        requiredTools: ['unavailable_tool'],
      });
      const result = activateSkillTools(skill, registry);
      expect(result).toBeNull();
    });

    it('requiredTools 全部可用时激活', () => {
      registry.register(makeTool('web_search'));
      registry.register(makeTool('generate_image'));

      const skill = makeSkill({
        boundTools: ['web_search', 'generate_image'],
        requiredTools: ['web_search'],
      });
      const result = activateSkillTools(skill, registry);
      expect(result).not.toBeNull();
    });
  });

  describe('activateSkillsTools', () => {
    it('批量激活多个技能', () => {
      registry.register(makeTool('web_search'));
      registry.register(makeTool('generate_image'));
      registry.register(makeTool('get_weather'));

      const skills = [
        makeSkill({ id: 's1', name: 'search_skill', boundTools: ['web_search'] }),
        makeSkill({ id: 's2', name: 'image_skill', boundTools: ['generate_image', 'web_search'] }),
        makeSkill({ id: 's3', name: 'chat_skill' }), // no boundTools
      ];

      const activations = activateSkillsTools(skills, registry);
      expect(activations).toHaveLength(2);
      expect(activations[0].skillName).toBe('search_skill');
      expect(activations[1].skillName).toBe('image_skill');
    });
  });
});
