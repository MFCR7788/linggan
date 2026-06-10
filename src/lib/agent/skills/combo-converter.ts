// 推荐组合 → Agent Skill 转换器
// 将 account-presets.ts 中的 RecommendationCombo 转为 SkillDefinition
// 自动提取触发关键词、绑定工具、生成 workflow steps

import type { SkillDefinition } from '@/lib/assistant/types';
import type { RecommendationCombo, LingjiEntry } from '@/lib/account-presets';
import { ACCOUNT_TYPE_PRESETS } from '@/lib/account-presets';

// ─── 入口 → 工具名映射 ──────────────────────────────────────

const ENTRY_TO_TOOLS: Record<string, string[]> = {
  '/ai/copywriting': ['generate_copywriting'],
  '/ai/image': ['generate_image'],
  '/ai/image-editor': ['edit_image'],
  '/ai/digital-human': ['generate_digital_human'],
  '/ai/video': ['generate_video'],
  '/ai/ads': ['generate_grid_images'],
  '/publish': ['publish_content'],
  '/hotspot': ['get_hotspot'],
  '/ai/tts': ['synthesize_speech'],
  '/inspiration': ['search_inspirations', 'save_to_inspiration'],
};

// ─── 入口 → 默认 prompt 模板 ────────────────────────────────

const ENTRY_PROMPT_TEMPLATES: Record<string, string> = {
  '/ai/copywriting': '你是一个专业的内容创作者。根据用户的主题和要求，生成高质量的多平台文案。',
  '/ai/image': '你是一个专业的AI视觉设计师。根据描述生成高质量的图片，注重构图、光影和色彩。',
  '/ai/video': '你是一个专业的短视频导演。将文案脚本转化为视觉分镜方案。',
  '/ai/digital-human': '你是一个数字人口播主播。用自然生动的表达传递信息。',
  '/ai/tts': '你是一个专业的配音师。根据文案选择合适的语音语调。',
  '/ai/ads': '你是一个社交媒体视觉设计师。制作吸引眼球的9宫格内容。',
  '/ai/image-editor': '你是一个专业的图片后期专家。优化和增强图片视觉效果。',
  '/publish': '发布内容到社交媒体平台。检查格式和平台要求。',
  '/hotspot': '分析当前热点话题。提取与用户主题相关的热点。',
  '/inspiration': '从灵感库中检索相关素材和内容。',
};

// ─── 关键词提取 ──────────────────────────────────────────────

const STOP_WORDS = new Set([
  '一个', '一套', '一键', '一条龙', '三件套', '双轮', '驱动',
  '的', '了', '是', '在', '和', '与', '或', '到', '从', '让',
  '把', '被', '用', '对', '为', '以', '等', '及', '其', '该',
  '这', '那', '可以', '需要', '能够', '支持', '提供', '实现',
  '通过', '进行', '使用', '用于', '基于', '根据', '按照',
]);

function extractKeywords(text: string): string[] {
  // 从中文文本中提取有意义的短词
  const keywords: string[] = [];

  // 匹配 2-4 字中文词
  const chineseWords = text.match(/[一-鿿]{2,4}/g) || [];
  for (const w of chineseWords) {
    if (!STOP_WORDS.has(w) && w.length >= 2) {
      keywords.push(w);
    }
  }

  // 匹配英文/数字词
  const enWords = text.match(/[a-zA-Z0-9]{2,}/g) || [];
  for (const w of enWords) {
    keywords.push(w.toLowerCase());
  }

  return [...new Set(keywords)];
}

function collectKeywords(combo: RecommendationCombo): string[] {
  const sources = [
    combo.title,
    combo.desc,
    ...combo.steps.map(s => s.label),
    combo.prefills?.topic || '',
    combo.prefills?.style || '',
    combo.prefills?.industry || '',
  ].filter(Boolean);

  const allKeywords = new Set<string>();
  for (const src of sources) {
    for (const kw of extractKeywords(src)) {
      allKeywords.add(kw);
    }
  }

  // 去重后限制数量
  return Array.from(allKeywords).slice(0, 20);
}

// ─── 工具收集 ────────────────────────────────────────────────

function collectTools(steps: RecommendationCombo['steps']): string[] {
  const tools = new Set<string>();
  for (const step of steps) {
    const mapped = ENTRY_TO_TOOLS[step.entry];
    if (mapped) {
      for (const t of mapped) tools.add(t);
    }
  }
  return Array.from(tools);
}

// ─── 名称生成 ────────────────────────────────────────────────

function toSkillName(comboId: string): string {
  // startup-product → startup_product
  return comboId.replace(/-/g, '_');
}

function toSkillDisplayName(combo: RecommendationCombo): string {
  return `${combo.emoji} ${combo.title}`;
}

// ─── Prompt 模板生成 ─────────────────────────────────────────

function buildPromptTemplate(combo: RecommendationCombo): string {
  const lines: string[] = [
    `你正在执行「${combo.title}」创作流程。`,
    '',
    `**流程说明**: ${combo.desc}`,
    '',
    '**步骤**:',
  ];

  for (let i = 0; i < combo.steps.length; i++) {
    const step = combo.steps[i];
    const promptHint = ENTRY_PROMPT_TEMPLATES[step.entry] || '';
    lines.push(`${i + 1}. ${step.label} → 调用工具并生成内容`);
    if (promptHint) {
      lines.push(`   _角色_: ${promptHint}`);
    }
  }

  if (combo.prefills) {
    lines.push('');
    lines.push('**预设参数**:');
    if (combo.prefills.topic) lines.push(`- 主题: ${combo.prefills.topic}`);
    if (combo.prefills.style) lines.push(`- 风格: ${combo.prefills.style}`);
    if (combo.prefills.industry) lines.push(`- 行业: ${combo.prefills.industry}`);
  }

  lines.push('');
  lines.push('**执行规则**:');
  lines.push('1. 严格按照以上步骤顺序，逐步调用工具完成');
  lines.push('2. 每步生成内容后询问用户是否满意，再进入下一步');
  lines.push('3. 如用户提供额外素材（图片、链接等），优先使用');
  lines.push('4. 最终将所有生成内容汇总，给出完整交付物');

  return lines.join('\n');
}

// ─── 主转换函数 ──────────────────────────────────────────────

export interface ComboSkillMapping {
  skill: SkillDefinition;
  /** 原始 combo ID */
  comboId: string;
  /** 所属账号类型 */
  accountTypeId: string;
  /** 账号类型标签 */
  accountTypeLabel: string;
}

/**
 * 将单个 RecommendationCombo 转为 SkillDefinition
 */
export function comboToSkill(
  combo: RecommendationCombo,
  accountTypeId: string,
  accountTypeLabel: string
): ComboSkillMapping {
  const tags = collectKeywords(combo);
  const boundTools = collectTools(combo.steps);

  const skill: SkillDefinition = {
    id: `combo_${combo.id}`,
    name: toSkillName(combo.id),
    displayName: toSkillDisplayName(combo),
    description: combo.desc,
    category: accountTypeLabel,
    tags,
    promptTemplate: buildPromptTemplate(combo),
    parameterSchema: combo.prefills
      ? {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(combo.prefills).map(([k, v]) => [k, { type: 'string', default: v }])
          ),
        }
      : undefined,
    boundTools,
    requiredTools: boundTools,
    version: '1.0.0',
    visibility: 'official',
    installCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { skill, comboId: combo.id, accountTypeId, accountTypeLabel };
}

/**
 * 一次性转换所有账号类型的所有推荐组合为 Skill
 * 返回总数约 40+ 个 Skill
 */
export function convertAllCombosToSkills(): ComboSkillMapping[] {
  const result: ComboSkillMapping[] = [];

  for (const preset of ACCOUNT_TYPE_PRESETS) {
    for (const combo of preset.combos) {
      result.push(comboToSkill(combo, preset.id, preset.label));
    }
  }

  return result;
}

/** 获取所有 combo 技能的 SkillDefinition 列表 */
export function getAllComboSkills(): SkillDefinition[] {
  return convertAllCombosToSkills().map(m => m.skill);
}

/** 获取 combo ID → Skill 的快速查找 Map */
export function getComboSkillMap(): Map<string, ComboSkillMapping> {
  const map = new Map<string, ComboSkillMapping>();
  for (const m of convertAllCombosToSkills()) {
    map.set(m.comboId, m);
  }
  return map;
}

/** 获取入口 → 工具名映射（供外部使用） */
export function getEntryToolMap(): Record<string, string[]> {
  return { ...ENTRY_TO_TOOLS };
}

/** 解析入口路径对应的工具名列表 */
export function entryToTools(entry: string): string[] {
  return ENTRY_TO_TOOLS[entry] || [];
}
