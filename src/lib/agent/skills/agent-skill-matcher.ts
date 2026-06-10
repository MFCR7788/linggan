// Agent Skill 匹配器
// 快速关键词匹配，不需要数据库，直接在内存中运行
// 用于 Agent 每轮对话前检测用户意图 → 推荐技能 → 绑定工具

import type { SkillDefinition, SkillMatch } from '@/lib/assistant/types';

export interface MatchOptions {
  /** 最低匹配分数阈值（0-1），默认 0.15 */
  minScore?: number;
  /** 最多返回技能数，默认 3 */
  topK?: number;
  /** 匹配到的技能自动绑定的最低分数阈值，默认 0.4 */
  autoBindThreshold?: number;
}

export interface MatchResult {
  /** 所有匹配的技能（按分数降序） */
  matches: SkillMatch[];
  /** 达到自动绑定阈值的技能（应自动注册其 boundTools） */
  autoBindSkills: SkillDefinition[];
  /** 推荐的技能显示名列表（用于 UI 提示） */
  recommendations: Array<{ name: string; displayName: string; score: number }>;
}

/**
 * 基于关键词 + 标签的快速技能匹配器
 * 不做语义/embedding 匹配，仅用关键词重叠度打分
 */
export class AgentSkillMatcher {
  private skills: SkillDefinition[] = [];
  /** 关键词 → 技能ID 倒排索引 */
  private keywordIndex = new Map<string, Set<string>>();

  /** 加载技能列表并构建倒排索引 */
  loadSkills(skills: SkillDefinition[]): void {
    this.skills = skills;
    this.buildIndex();
  }

  /** 追加技能 */
  addSkills(skills: SkillDefinition[]): void {
    this.skills.push(...skills);
    for (const skill of skills) {
      this.indexSkill(skill);
    }
  }

  /** 匹配用户查询 */
  match(query: string, opts: MatchOptions = {}): MatchResult {
    const { minScore = 0.15, topK = 3, autoBindThreshold = 0.4 } = opts;

    if (!query.trim() || this.skills.length === 0) {
      return { matches: [], autoBindSkills: [], recommendations: [] };
    }

    const q = query.toLowerCase();
    const scored: SkillMatch[] = [];

    for (const skill of this.skills) {
      const score = this.computeScore(q, skill);
      if (score >= minScore) {
        scored.push({ skill, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK);

    return {
      matches: top,
      autoBindSkills: top
        .filter(m => m.score >= autoBindThreshold)
        .map(m => m.skill),
      recommendations: top.map(m => ({
        name: m.skill.name,
        displayName: m.skill.displayName,
        score: m.score,
      })),
    };
  }

  /** 按类别匹配 */
  matchByCategory(category: string, topK = 3): SkillMatch[] {
    return this.skills
      .filter(s => s.category === category)
      .map(skill => ({ skill, score: 0.8 }))
      .slice(0, topK);
  }

  /** 获取所有已加载技能 */
  getAllSkills(): SkillDefinition[] {
    return this.skills;
  }

  /** 获取所有类别 */
  getCategories(): string[] {
    return [...new Set(this.skills.map(s => s.category).filter(Boolean))] as string[];
  }

  // ─── 私有方法 ────────────────────────────────────────────

  private buildIndex(): void {
    this.keywordIndex.clear();
    for (const skill of this.skills) {
      this.indexSkill(skill);
    }
  }

  private indexSkill(skill: SkillDefinition): void {
    const terms = new Set<string>();

    // 索引名称
    for (const part of skill.name.toLowerCase().split(/[_\-\s]+/)) {
      if (part.length >= 2) terms.add(part);
    }

    // 索引显示名
    for (const ch of skill.displayName.match(/[一-鿿a-zA-Z0-9]{2,}/g) || []) {
      terms.add(ch.toLowerCase());
    }

    // 索引标签
    for (const tag of skill.tags) {
      terms.add(tag.toLowerCase());
    }

    // 索引类别
    if (skill.category) {
      terms.add(skill.category.toLowerCase());
    }

    // 索引描述中的关键词
    for (const word of skill.description.split(/[，,、\s]+/)) {
      const trimmed = word.trim();
      if (trimmed.length >= 2) terms.add(trimmed.toLowerCase());
    }

    for (const term of terms) {
      if (!this.keywordIndex.has(term)) {
        this.keywordIndex.set(term, new Set());
      }
      this.keywordIndex.get(term)!.add(skill.id);
    }
  }

  private computeScore(query: string, skill: SkillDefinition): number {
    let score = 0;
    let hitCount = 0;

    // 名称精确匹配（最高权重）
    if (skill.name.toLowerCase() === query) return 1.0;

    // 名称包含查询
    if (skill.name.toLowerCase().includes(query)) {
      score += 0.7;
      hitCount++;
    }

    // 查询包含名称部分
    const nameParts = skill.name.toLowerCase().split(/[_\-\s]+/);
    for (const part of nameParts) {
      if (part.length >= 2 && query.includes(part)) {
        score += 0.5;
        hitCount++;
      }
    }

    // 显示名匹配
    const displayText = skill.displayName.replace(/[^\w一-鿿]/g, '').toLowerCase();
    if (query.includes(displayText) || displayText.includes(query)) {
      score += 0.5;
      hitCount++;
    }

    // 标签匹配
    for (const tag of skill.tags) {
      if (query.includes(tag.toLowerCase())) {
        score += 0.35;
        hitCount++;
      }
    }

    // 类别匹配
    if (skill.category && query.includes(skill.category.toLowerCase())) {
      score += 0.2;
      hitCount++;
    }

    // 描述关键词匹配
    const descWords = skill.description.split(/[，,、\s]+/);
    for (const word of descWords) {
      const w = word.trim().toLowerCase();
      if (w.length >= 2 && query.includes(w)) {
        score += 0.15;
        hitCount++;
      }
    }

    // 命中加权：命中越多置信度越高
    if (hitCount >= 5) score = Math.min(score * 1.3, 1.0);
    else if (hitCount >= 3) score = Math.min(score * 1.15, 1.0);

    return Math.round(Math.min(score, 1.0) * 1000) / 1000;
  }
}

/** 单例 */
export const agentSkillMatcher = new AgentSkillMatcher();
