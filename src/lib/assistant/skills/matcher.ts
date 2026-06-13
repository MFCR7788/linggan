// SkillMatcher — 技能匹配器
// 基于关键词 + 语义相似度匹配用户意图与可用技能

import type { SkillDefinition, SkillMatch } from '../types';
import type { SkillRegistry } from './registry';

export class SkillMatcher {
  private registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  /** 为用户查询匹配最相关的技能 */
  match(query: string, installedSkillIds: string[], topK: number = 3): SkillMatch[] {
    const allSkills = this.registry.getAll();
    if (allSkills.length === 0) return [];

    const q = query.toLowerCase();

    const scored = allSkills
      .filter(s => installedSkillIds.includes(s.id) || s.visibility === 'official')
      .map(skill => ({
        skill,
        score: this.computeScore(q, skill),
      }))
      .filter(s => s.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  /** 为特定意图匹配技能 */
  matchByIntent(intent: string, installedSkillIds: string[], topK: number = 3): SkillMatch[] {
    const allSkills = this.registry.getAll();
    const intentLC = intent.toLowerCase();

    const scored = allSkills
      .filter(s => installedSkillIds.includes(s.id) || s.visibility === 'official')
      .map(skill => ({
        skill,
        score: this.computeCategoryScore(intentLC, skill),
      }))
      .filter(s => s.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  private computeScore(query: string, skill: SkillDefinition): number {
    let score = 0;

    // 名称精确匹配（最高权重）
    if (skill.name.toLowerCase() === query) score += 1.0;
    else if (skill.name.toLowerCase().includes(query)) score += 0.8;

    // 显示名称匹配
    if (skill.displayName.toLowerCase().includes(query)) score += 0.6;

    // 描述关键词匹配
    const descWords = skill.description.toLowerCase().split(/\s+/);
    const queryWords = query.split(/\s+/);
    for (const qw of queryWords) {
      if (qw.length < 2) continue;
      if (skill.name.toLowerCase().includes(qw)) score += 0.4;
      if (descWords.some(w => w.includes(qw))) score += 0.3;
    }

    // 标签匹配
    for (const tag of skill.tags) {
      if (query.includes(tag.toLowerCase())) score += 0.5;
      if (tag.toLowerCase().includes(query)) score += 0.3;
    }

    // 触发关键词匹配（SkillDefinition.triggerKeywords 用于精准匹配）
    if (skill.triggerKeywords && skill.triggerKeywords.length > 0) {
      for (const kw of skill.triggerKeywords) {
        if (query.includes(kw.toLowerCase())) score += 0.6;
      }
    }

    // 类别匹配
    if (skill.category && query.includes(skill.category.toLowerCase())) score += 0.2;

    // 受欢迎度加成
    score += Math.min(skill.installCount / 100, 0.1);

    return Math.min(score, 1.0);
  }

  private computeCategoryScore(intent: string, skill: SkillDefinition): number {
    let score = 0;

    // 类别直接匹配
    if (skill.category && intent.includes(skill.category.toLowerCase())) {
      score += 0.7;
    }

    // 标签匹配
    for (const tag of skill.tags) {
      if (intent.includes(tag.toLowerCase())) score += 0.4;
    }

    // 触发关键词匹配
    if (skill.triggerKeywords && skill.triggerKeywords.length > 0) {
      for (const kw of skill.triggerKeywords) {
        if (intent.includes(kw.toLowerCase())) score += 0.5;
      }
    }

    // 描述匹配
    if (skill.description.toLowerCase().includes(intent)) score += 0.3;

    // 官方技能加成
    if (skill.visibility === 'official') score += 0.1;

    return Math.min(score, 1.0);
  }
}
