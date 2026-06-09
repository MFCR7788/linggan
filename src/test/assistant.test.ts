// 灵集 AI V2.0 — Assistant 模块单元测试

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectIntent, type IntentType } from '@/lib/assistant/intent';
import { buildPrompt, PROMPT_MODULES } from '@/lib/assistant/prompts';

// ====== 意图检测 ======

describe('detectIntent', () => {
  it('识别自我介绍', () => {
    const r = detectIntent('你是谁', false, false);
    expect(r.type).toBe('knowledge');
    expect(r.label).toBe('自我介绍');
  });

  it('识别知识问答', () => {
    const r = detectIntent('什么是量子计算', false, false);
    expect(r.type).toBe('knowledge');
  });

  it('识别编程问题', () => {
    const r = detectIntent('帮我写一个 React 组件', false, false);
    expect(r.type).toBe('coding');
  });

  it('识别法律问题', () => {
    const r = detectIntent('帮我起草一份劳动合同', false, false);
    expect(r.type).toBe('legal');
  });

  it('识别天气查询（含明确地点）', () => {
    // "北京今天天气" — 不含"怎么样""是什么"等知识类触发词
    const r = detectIntent('北京明天天气', false, false);
    expect(r.type).toBe('weather');
  });

  it('识别文字创作', () => {
    const r = detectIntent('帮我写一篇小红书文案', false, false);
    expect(r.type).toBe('writing');
  });

  it('识别创意策划', () => {
    const r = detectIntent('帮我想一个品牌 slogan', false, false);
    expect(r.type).toBe('creative');
  });

  it('识别生活规划', () => {
    const r = detectIntent('帮我规划一个周末出游路线', false, false);
    expect(r.type).toBe('life');
  });

  it('识别日程管理', () => {
    const r = detectIntent('帮我添加一个日程明天上午9点开会', false, false);
    expect(r.type).toBe('schedule');
  });

  it('识别办公文档', () => {
    const r = detectIntent('帮我分析这个数据', false, false);
    expect(r.type).toBe('office');
  });

  it('识别图片生成意图', () => {
    const r = detectIntent('帮我画一只猫', false, false);
    expect(r.type).toBe('image');
    expect(r.wantsGeneration).toBe(true);
    expect(r.genType).toBe('text2img');
  });

  it('识别视频生成意图', () => {
    const r = detectIntent('帮我生成一个产品展示视频', false, false);
    expect(r.type).toBe('video');
    expect(r.wantsGeneration).toBe(true);
    expect(r.genType).toBe('text2vid');
  });

  it('有图片附件+无文字时走图片分析', () => {
    // keyword 匹配优先，但无文字内容时附件类型兜底
    const r = detectIntent('', true, false);
    expect(r.type).toBe('image');
    expect(r.wantsGeneration).toBe(false);
  });

  it('有视频附件+无文字时走视频分析', () => {
    const r = detectIntent('', false, true);
    expect(r.type).toBe('video');
    expect(r.wantsGeneration).toBe(false);
  });

  it('空输入兜底为 writing', () => {
    const r = detectIntent('嗯', false, false);
    expect(r.type).toBe('writing');
  });

  it('含"写"关键词优先走 writing 而非 creative', () => {
    // "帮我想几个口号并写出来" — 有写关键词
    const r = detectIntent('帮我写几个品牌口号', false, false);
    expect(r.type).toBe('writing');
  });

  it('legal 优先于 writing：起草合同走 legal', () => {
    const r = detectIntent('起草一份合同', false, false);
    expect(r.type).toBe('legal');
  });

  it('weather 匹配明确天气查询句式', () => {
    // "会不会下雨" 是明确查询句式
    const r = detectIntent('明天会不会下雨', false, false);
    expect(r.type).toBe('weather');
  });
});

// ====== Prompt 构建 ======

describe('buildPrompt', () => {
  it('writing 意图不需要 JSON', () => {
    const intent = detectIntent('帮我写一段文案', false, false);
    const { systemPrompt, userPrompt, requiresJSON } = buildPrompt(intent, '帮我写一段文案');
    expect(requiresJSON).toBe(false);
    expect(userPrompt).toContain('帮我写一段文案');
    expect(systemPrompt).toContain('灵集AI');
    expect(systemPrompt).toContain('文字创作助手');
  });

  it('图片生成意图需要 JSON', () => {
    const intent = detectIntent('画一只猫', false, false);
    const { systemPrompt, userPrompt, requiresJSON } = buildPrompt(intent, '画一只猫');
    expect(requiresJSON).toBe(true);
    expect(systemPrompt).toContain('JSON');
    expect(userPrompt).toContain('用户意图');
  });

  it('视频生成意图需要 JSON', () => {
    const intent = detectIntent('生成一个视频', false, false);
    const { requiresJSON } = buildPrompt(intent, '生成一个视频');
    expect(requiresJSON).toBe(true);
  });

  it('所有 11 种意图都有对应 prompt 模块', () => {
    const types: IntentType[] = [
      'writing', 'knowledge', 'life', 'schedule', 'office',
      'image', 'video', 'coding', 'creative', 'legal', 'weather',
    ];
    for (const t of types) {
      expect(PROMPT_MODULES[t]).toBeDefined();
      expect(PROMPT_MODULES[t].systemPrompt.length).toBeGreaterThan(100);
    }
  });
});

// ====== 类型 ======

describe('KnowledgeManager (类型验证)', () => {
  it('KnowledgeManager 导入正常', async () => {
    const { KnowledgeManager } = await import('@/lib/assistant/knowledge/manager');
    const mgr = new KnowledgeManager();
    expect(mgr.providerNames).toEqual([]);
  });
});

describe('MemoryManager (类型验证)', () => {
  it('MemoryManager 导入正常', async () => {
    const { MemoryManager } = await import('@/lib/assistant/memory/manager');
    const mgr = new MemoryManager();
    expect(mgr.providerNames).toEqual([]);
  });
});

describe('Embedding (类型验证)', () => {
  it('generateEmbedding 函数存在', async () => {
    const mod = await import('@/lib/assistant/embedding');
    expect(typeof mod.generateEmbedding).toBe('function');
    expect(typeof mod.generateEmbeddings).toBe('function');
    expect(typeof mod.indexContentItem).toBe('function');
    expect(typeof mod.indexContentItemsBatch).toBe('function');
  });
});

describe('Skills (类型验证)', () => {
  it('SkillRegistry 导入正常', async () => {
    const { SkillRegistry } = await import('@/lib/assistant/skills/registry');
    const reg = new SkillRegistry();
    expect(reg.getAll()).toEqual([]);
  });

  it('SkillMatcher 导入正常', async () => {
    const { SkillRegistry } = await import('@/lib/assistant/skills/registry');
    const { SkillMatcher } = await import('@/lib/assistant/skills/matcher');
    const matcher = new SkillMatcher(new SkillRegistry());
    const results = matcher.match('测试', [], 3);
    expect(results).toEqual([]);
  });

  it('SkillExecutor 类型导入正常', async () => {
    const { SkillExecutor } = await import('@/lib/assistant/skills/executor');
    expect(typeof SkillExecutor).toBe('function');
  });
});

// ====== ContextPipeline (类型验证) ======

describe('ContextPipeline (类型验证)', () => {
  it('ContextPipeline 导入正常', async () => {
    const { ContextPipeline } = await import('@/lib/assistant/pipeline');
    expect(typeof ContextPipeline).toBe('function');
  });
});

// ====== sanitizeContext ======

describe('sanitizeContext', () => {
  it('移除 memory-context 标签', async () => {
    const { sanitizeContext, buildMemoryContextBlock } = await import(
      '@/lib/assistant/memory/provider'
    );
    const clean = sanitizeContext('<memory-context>test</memory-context>');
    expect(clean).not.toContain('memory-context');
    expect(clean).toContain('test');
  });

  it('buildMemoryContextBlock 包裹内容', async () => {
    const { buildMemoryContextBlock } = await import('@/lib/assistant/memory/provider');
    const block = buildMemoryContextBlock('重要记忆');
    expect(block).toContain('<memory-context>');
    expect(block).toContain('重要记忆');
    expect(block).toContain('</memory-context>');
  });

  it('空字符串返回空', async () => {
    const { buildMemoryContextBlock } = await import('@/lib/assistant/memory/provider');
    expect(buildMemoryContextBlock('')).toBe('');
    expect(buildMemoryContextBlock('  ')).toBe('');
  });
});

// ====== Prompts 常量 ======

describe('Prompts 常量', () => {
  it('LINGJI_IDENTITY 包含关键信息', async () => {
    const { LINGJI_IDENTITY } = await import('@/lib/assistant/prompts');
    expect(LINGJI_IDENTITY).toContain('灵集AI');
    expect(LINGJI_IDENTITY).toContain('创作助手');
  });

  it('GLOBAL_CAPABILITIES 包含全局能力', async () => {
    const { GLOBAL_CAPABILITIES } = await import('@/lib/assistant/prompts');
    expect(GLOBAL_CAPABILITIES).toContain('文字纠错');
    expect(GLOBAL_CAPABILITIES).toContain('格式优化');
  });
});

// ====== 统一导出 ======

describe('统一导出 index.ts', () => {
  it('导出所有核心类', async () => {
    const mod = await import('@/lib/assistant/index');
    expect(mod.MemoryManager).toBeDefined();
    expect(mod.KnowledgeManager).toBeDefined();
    expect(mod.ContextPipeline).toBeDefined();
    expect(mod.SkillRegistry).toBeDefined();
    expect(mod.SkillMatcher).toBeDefined();
    expect(mod.SkillExecutor).toBeDefined();
    expect(mod.SkillsHub).toBeDefined();
    expect(mod.detectIntent).toBeDefined();
    expect(mod.generateEmbedding).toBeDefined();
    expect(mod.LINGJI_IDENTITY).toBeDefined();
    expect(mod.PROMPT_MODULES).toBeDefined();
  });
});
