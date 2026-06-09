// SkillsHub — 技能中心（progressive disclosure）
// 三层披露：元数据列表 → 技能详情(prompt) → 关联文件内容
// 参考 Hermes Agent skills_tool.py 的渐进式披露设计

import type { SkillDefinition, SkillMatch, SkillInvocation, SkillResult } from '../types';
import { SkillRegistry } from './registry';
import { SkillMatcher } from './matcher';
import { SkillExecutor } from './executor';

export type DisclosureLevel = 'metadata' | 'full' | 'files';

export interface SkillsHubOptions {
  userId: string;
  autoInit?: boolean;
}

export class SkillsHub {
  readonly registry: SkillRegistry;
  readonly matcher: SkillMatcher;
  readonly executor: SkillExecutor;
  private userId: string;
  private installedIds: string[] = [];

  constructor(options: SkillsHubOptions) {
    this.userId = options.userId;
    this.registry = new SkillRegistry();
    this.matcher = new SkillMatcher(this.registry);
    this.executor = new SkillExecutor();
  }

  /** 初始化：加载技能注册表 + 用户已安装列表 */
  async initialize(): Promise<void> {
    await this.registry.initialize();
    this.installedIds = await this.registry.getInstalledSkillIds(this.userId);
  }

  /*
   * Progressive Disclosure — 三层披露
   */

  /** Level 1: 获取技能元数据列表（不含 prompt template + files） */
  async listSkills(params?: {
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<SkillDefinition[]> {
    let skills: SkillDefinition[];

    if (params?.search) {
      skills = this.registry.search(params.search);
    } else {
      skills = this.registry.getAll();
    }

    if (params?.category) {
      skills = skills.filter(s => s.category === params.category);
    }

    const start = params?.offset || 0;
    const end = params?.limit ? start + params.limit : undefined;
    const page = skills.slice(start, end);

    // 返回 metadata 级别（strip prompt + files）
    return page.map(s => this.toMetadata(s));
  }

  /** Level 2: 查看完整技能内容（含 prompt template） */
  async viewSkill(skillId: string): Promise<SkillDefinition | null> {
    const skill = this.registry.getFull(skillId);
    if (!skill) return null;
    return { ...skill, linkedContent: undefined }; // prompt 可见，files 按需
  }

  /** Level 3: 获取技能关联文件内容 */
  async getSkillFiles(skillId: string): Promise<Record<string, string[]> | null> {
    const skill = this.registry.getFull(skillId);
    return skill?.linkedFiles || null;
  }

  /** 获取技能关联内容（额外知识片段） */
  async getSkillContent(skillId: string): Promise<Record<string, string> | null> {
    const skill = this.registry.getFull(skillId);
    return skill?.linkedContent || null;
  }

  /*
   * 匹配 & 执行
   */

  /** 匹配用户查询的可用技能 */
  matchSkills(query: string, topK?: number): SkillMatch[] {
    return this.matcher.match(query, this.installedIds, topK);
  }

  /** 匹配特定意图的技能 */
  matchSkillsByIntent(intent: string, topK?: number): SkillMatch[] {
    return this.matcher.matchByIntent(intent, this.installedIds, topK);
  }

  /** 执行技能 */
  async invoke(skillId: string, params: Record<string, unknown>, userQuery?: string): Promise<SkillResult> {
    const skill = this.registry.getFull(skillId);
    if (!skill) {
      return { success: false, output: '', error: `技能 ${skillId} 不存在`, durationMs: 0 };
    }

    const input: SkillInvocation = { skillId, skillName: skill.name, params };
    return this.executor.execute(skill, input, { userQuery });
  }

  /*
   * 安装管理
   */

  /** 安装技能 */
  async install(skillId: string): Promise<boolean> {
    const ok = await this.registry.install(this.userId, skillId);
    if (ok) {
      this.installedIds = await this.registry.getInstalledSkillIds(this.userId);
    }
    return ok;
  }

  /** 卸载技能 */
  async uninstall(skillId: string): Promise<boolean> {
    const ok = await this.registry.uninstall(this.userId, skillId);
    if (ok) {
      this.installedIds = this.installedIds.filter(id => id !== skillId);
    }
    return ok;
  }

  /** 获取已安装技能 ID 列表 */
  get installedSkillIds(): string[] {
    return this.installedIds;
  }

  /** 生成用于 System Prompt 的技能列表（含简短说明） */
  buildSkillsPromptBlock(): string {
    const installed = this.registry
      .getAll()
      .filter(s => this.installedIds.includes(s.id) || s.visibility === 'official');

    if (installed.length === 0) return '';

    const lines = installed.map(
      s => `- **${s.displayName}** (\`${s.name}\`): ${s.description.slice(0, 80)}`
    );

    return (
      '<available-skills>\n' +
      '以下是你可以调用的技能。当用户请求匹配某个技能时，说明该技能的作用并指导用户如何使用。\n\n' +
      lines.join('\n') +
      '\n</available-skills>'
    );
  }

  /** 按分类组织技能列表（Hub 页面前端用） */
  getHubCategories(): { category: string; skills: SkillDefinition[] }[] {
    const grouped = this.registry.getByCategory();
    return Array.from(grouped.entries())
      .map(([category, skills]) => ({
        category,
        skills: skills.map(s => this.toMetadata(s)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }

  private toMetadata(skill: SkillDefinition): SkillDefinition {
    return {
      ...skill,
      promptTemplate: '',
      linkedFiles: undefined,
      linkedContent: undefined,
    };
  }
}
