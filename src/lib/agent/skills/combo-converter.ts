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
  '/ai/copywriting': `你是专业内容创作者。

**质量标准**:
- 平台适配：小红书标题≤20字带emoji、公众号可分段小标题、抖音脚本口语化有钩子
- 去AI味：禁止"首先/其次/总而言之/综上所述"，多用口语断句、语气词
- CTA具体：不用"欢迎关注"，用"评论区扣1""点击下方链接""保存下来慢慢看"
- 行业深度：引用行业数据和案例，用行业黑话体现专业度
- 结构清晰：钩子(前3秒) → 痛点/场景 → 解决方案 → 行动号召`,

  '/ai/image': `你是专业AI视觉设计师。

**质量标准**:
- prompt必须包含：主体外观特征 + 场景环境 + 光影方向/质感 + 色彩调性 + 风格
- 中文直接写，无需翻译成英文
- 系列图/分镜图：必须用相同 seed（如42）+ 首图 URL 作 referenceImageUrl
- 批量生成用 n 参数一次出多张，同批次风格更统一
- 避免：手指畸形、五官不对称、中文文字乱码`,

  '/ai/video': `你是专业短视频导演。

**质量标准**:
- 分镜 ≥ 3 个，每个有 visualPrompt + subtitle（5-15字口语化字幕）
- 首帧必须有视觉钩子（标题/主体/对比），1秒内传达核心信息
- BGM默认选"AI 自动"，根据主题自动匹配风格
- 字幕位置不挡脸，烧录时机与语音同步
- 转场自然不黑屏，节奏有快慢变化`,

  '/ai/digital-human': `你是数字人口播主播。

**质量标准**:
- 脚本 ≤ 100 字（约20秒硬限制，超了会失败）
- 前3秒有钩子（问题/反常识/数据），抓住注意力
- 口播语气自然，像真人在说话不是读稿
- 选择合适的TTS音色（默认"小美"女声，知识类可用"小川"男声）
- 克隆音色优先使用（如果有的话）`,

  '/ai/tts': `你是专业配音师。

**质量标准**:
- 文本先在脑海默读一遍，确认断句和重音位置
- 语速推荐 1.0-1.2x（太快听不清、太慢拖沓）
- 选音色要匹配内容调性（温柔内容用女声、科技内容用男声）
- 有克隆音色时优先用克隆（创始人IP一致性）
- 超1000字节会失败，长文本分段合成`,

  '/ai/ads': `你是社交媒体视觉设计师。

**质量标准**:
- 9张图视觉风格统一（同 seed + 同色调）
- 每张有独立主题但整体有叙事线（痛点→场景→特写→对比→证言→情感→品牌→生活→紧迫）
- 每张配一句20字内朋友圈配文，带emoji
- 产品宣传类突出卖点，生活记录类注重氛围感`,

  '/ai/image-editor': `你是专业图片后期专家。

**质量标准**:
- 增强：提升清晰度但不改变原图内容
- 去背景：背景纯净白色/透明，主体边缘清晰无毛刺
- 风格迁移：说明目标风格的关键视觉特征
- 扩图：保持原图内容居中，向外自然延伸`,

  '/publish': `发布内容到社交媒体平台。

**质量标准**:
- 发布前检查：标题长度、封面尺寸、正文格式是否符合目标平台
- 公众号/微博可自动发布，抖音/小红书/B站/视频号需复制引导
- 定时发布需确认时间合理（非凌晨），发布后告知用户预计发布时间`,

  '/hotspot': `分析当前热点话题。

**质量标准**:
- 提取与用户主题相关的热点，标注相关性评分
- 每条热点附创作角度建议（这个热点怎么切入你的领域）
- 标注热点时效性（正在爆发/持续发酵/已降温）`,

  '/inspiration': `从灵感库中检索相关素材。

**质量标准**:
- 优先语义匹配，再按时间排序
- 检索结果标注匹配度和素材类型
- 如果没有相关素材，明确告知并建议补充方向`,
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
    lines.push(`${i + 1}. ${step.label}`);
    if (promptHint) {
      lines.push(`${promptHint}`);
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
  lines.push('');
  lines.push('**每步完成后自检（必须）**:');
  lines.push('1. 对照该步骤的质量标准逐项检查');
  lines.push('2. 发现不达标 → 自动修复后再呈现给用户，不要丢给用户判断');
  lines.push('3. 如工具调用失败 → 自动尝试降级方案，告知用户用了什么替代方式');
  lines.push('4. 确认达标后，用一句话总结这步做了什么，然后询问是否继续下一步');

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
