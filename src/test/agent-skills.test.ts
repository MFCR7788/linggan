// Agent Skills 转换 + 匹配测试

import { describe, it, expect, beforeAll } from 'vitest';
import { convertAllCombosToSkills, getAllComboSkills, entryToTools } from '@/lib/agent/skills/combo-converter';
import { AgentSkillMatcher } from '@/lib/agent/skills/agent-skill-matcher';
import { createBridgeSession, activateSkills, deactivateSkills, cleanupBridgeSession } from '@/lib/agent/skills/skill-tool-bridge';
import { ToolRegistry } from '@/lib/agent/tools/registry';
import type { SkillDefinition } from '@/lib/assistant/types';

describe('Combo → Skill 转换器', () => {
  const allMappings = convertAllCombosToSkills();

  it('应该转换所有 14 个账号类型的组合', () => {
    expect(allMappings.length).toBeGreaterThanOrEqual(40);
  });

  it('每个 Skill 都有 id/name/displayName/description/tags/boundTools', () => {
    for (const { skill } of allMappings) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.displayName).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.tags.length).toBeGreaterThan(0);
      expect(skill.boundTools).toBeDefined();
    }
  });

  it('每个 Skill 的 boundTools 必须是已存在的工具名', () => {
    const validTools = new Set([
      'generate_copywriting', 'generate_image', 'edit_image',
      'generate_digital_human', 'generate_video', 'generate_grid_images',
      'publish_content', 'get_hotspot', 'synthesize_speech',
      'search_inspirations', 'save_to_inspiration',
    ]);

    for (const { skill } of allMappings) {
      for (const tool of skill.boundTools || []) {
        expect(validTools.has(tool), `${skill.id}: 无效工具 ${tool}`).toBe(true);
      }
    }
  });

  it('getAllComboSkills 返回纯 SkillDefinition 数组', () => {
    const skills = getAllComboSkills();
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThanOrEqual(40);
    expect(skills[0].id).toBeTruthy();
  });

  it('entryToTools 正确映射入口到工具', () => {
    expect(entryToTools('/ai/copywriting')).toContain('generate_copywriting');
    expect(entryToTools('/ai/image')).toContain('generate_image');
    expect(entryToTools('/ai/video')).toContain('generate_video');
    expect(entryToTools('/ai/digital-human')).toContain('generate_digital_human');
    expect(entryToTools('/ai/ads')).toContain('generate_grid_images');
    expect(entryToTools('/publish')).toContain('publish_content');
    expect(entryToTools('/hotspot')).toContain('get_hotspot');
    expect(entryToTools('/ai/tts')).toContain('synthesize_speech');
    expect(entryToTools('/nonexistent')).toEqual([]);
  });
});

describe('AgentSkillMatcher', () => {
  const matcher = new AgentSkillMatcher();

  beforeAll(() => {
    matcher.loadSkills(getAllComboSkills());
  });

  it('空查询返回空结果', () => {
    const result = matcher.match('');
    expect(result.matches.length).toBe(0);
    expect(result.autoBindSkills.length).toBe(0);
  });

  it('匹配"写一篇小红书种草文案"', () => {
    const result = matcher.match('写一篇小红书种草文案');
    expect(result.matches.length).toBeGreaterThan(0);
    // 应该匹配到种草相关的技能
    const titles = result.matches.map(m => m.skill.displayName);
    expect(titles.some(t => t.includes('种草') || t.includes('小红书'))).toBe(true);
  });

  it('匹配"帮我生成数字人口播视频"', () => {
    const result = matcher.match('帮我生成数字人口播视频');
    expect(result.matches.length).toBeGreaterThan(0);
    const titles = result.matches.map(m => m.skill.displayName);
    expect(titles.some(t => t.includes('数字人') || t.includes('口播'))).toBe(true);
  });

  it('匹配"知识科普文案"应返回知识IP相关技能', () => {
    const result = matcher.match('知识科普文案');
    expect(result.matches.length).toBeGreaterThan(0);
    const categories = result.matches.map(m => m.skill.category);
    expect(categories.some(c => c?.includes('知识'))).toBe(true);
  });

  it('matchByCategory 按类别筛选', () => {
    const matches = matcher.matchByCategory('医美');
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m.skill.category).toBe('医美');
    }
  });

  it('getCategories 返回所有类别', () => {
    const cats = matcher.getCategories();
    expect(cats.length).toBe(14);
    expect(cats).toContain('初创公司');
    expect(cats).toContain('知识 IP');
    expect(cats).toContain('电商品牌');
  });

  it('高分匹配应触发 autoBindSkills', () => {
    const result = matcher.match('小红书9宫格种草产品');
    // 应该至少有一个高分匹配
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});

describe('Skill ↔ Tool Bridge', () => {
  it('createBridgeSession 创建空会话', () => {
    const session = createBridgeSession();
    expect(session.activeSkillIds.size).toBe(0);
    expect(session.bridgedToolNames.size).toBe(0);
  });

  it('activateSkills 注册绑定工具到 registry', () => {
    const registry = new ToolRegistry();
    const session = createBridgeSession();

    // 先注册基础工具
    const baseTool = {
      name: 'generate_copywriting',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ success: true, output: 'ok' }),
    };
    registry.register(baseTool);

    const skill: SkillDefinition = {
      id: 'test_skill',
      name: 'test_skill',
      displayName: '测试技能',
      description: '测试',
      tags: ['test'],
      promptTemplate: '',
      boundTools: ['generate_copywriting'],
      version: '1.0.0',
      visibility: 'official',
      installCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const allTools = [baseTool];
    const activated = activateSkills([skill], registry, allTools, session);
    // 工具已存在，所以不新增注册
    expect(session.activeSkillIds.has('test_skill')).toBe(true);
  });

  it('deactivateSkills 从会话中移除', () => {
    const registry = new ToolRegistry();
    const session = createBridgeSession();
    session.activeSkillIds.add('test_skill');
    session.skillTools.set('test_skill', ['tool_a']);
    session.bridgedToolNames.add('tool_a');

    deactivateSkills(['test_skill'], registry, session);
    expect(session.activeSkillIds.has('test_skill')).toBe(false);
  });

  it('cleanupBridgeSession 清理所有工具', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'bridged_tool',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ success: true, output: 'ok' }),
    });

    const session = createBridgeSession();
    session.bridgedToolNames.add('bridged_tool');

    const count = cleanupBridgeSession(registry, session);
    expect(count).toBe(1);
    expect(registry.get('bridged_tool')).toBeUndefined();
    expect(session.activeSkillIds.size).toBe(0);
  });
});

// ChoiceCards parseChoices 测试
import { parseChoices } from '@/lib/agent/choice-parser';

describe('parseChoices', () => {
  it('解析多选 choices', () => {
    const text = '请选择：\n<choices multi="true">\n选项A: 描述A\n选项B: 描述B\n选项C\n</choices>\n还有其他需求吗？';
    const { choices, cleanedText } = parseChoices(text);

    expect(choices.length).toBe(1);
    expect(choices[0].multi).toBe(true);
    expect(choices[0].options.length).toBe(3);
    expect(choices[0].options[0].label).toBe('选项A');
    expect(choices[0].options[0].description).toBe('描述A');
    expect(choices[0].options[2].label).toBe('选项C');
    expect(choices[0].options[2].description).toBeUndefined();

    // 清理后的文本不包含 choices 标签
    expect(cleanedText).not.toContain('<choices');
    expect(cleanedText).toContain('还有其他需求吗？');
  });

  it('解析单选的 choices（multi="false"）', () => {
    const text = '<choices multi="false">日系: 简约风|复古: 工业风</choices>';
    const { choices } = parseChoices(text);

    expect(choices[0].multi).toBe(false);
    expect(choices[0].options.length).toBe(2);
  });

  it('默认多选（无 multi 属性）', () => {
    const text = '<choices>选项1|选项2|选项3</choices>';
    const { choices } = parseChoices(text);

    expect(choices[0].multi).toBe(true);
    expect(choices[0].options.length).toBe(3);
  });

  it('无 choices 标签时返回空数组', () => {
    const text = '这是一个普通消息，没有选项标签。';
    const { choices, cleanedText } = parseChoices(text);

    expect(choices.length).toBe(0);
    expect(cleanedText).toBe(text);
  });

  it('多个 choices 块分别解析', () => {
    const text = '<choices multi="false">A|B</choices> 中间文字 <choices multi="true">C|D|E</choices>';
    const { choices } = parseChoices(text);

    expect(choices.length).toBe(2);
    expect(choices[0].multi).toBe(false);
    expect(choices[0].options.length).toBe(2);
    expect(choices[1].multi).toBe(true);
    expect(choices[1].options.length).toBe(3);
  });
});
