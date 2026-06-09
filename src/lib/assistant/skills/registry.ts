// SkillRegistry — 技能注册中心
// 管理技能的 CRUD、安装/卸载、搜索
// 从 Supabase skills 表加载，支持内存缓存

import type { SkillDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase-server';

interface SkillRow {
  id: string;
  name: string;
  display_name: string;
  description: string;
  category: string | null;
  tags: string[] | null;
  prompt_template: string;
  parameter_schema: Record<string, unknown> | null;
  linked_files: Record<string, string[]> | null;
  linked_content: Record<string, string> | null;
  version: string;
  author_id: string | null;
  visibility: 'private' | 'public' | 'official';
  install_count: number;
  created_at: string;
  updated_at: string;
}

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();
  private initialized = false;

  /** 从数据库加载所有 public + official 技能到内存缓存 */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('skills')
        .select('*')
        .in('visibility', ['public', 'official'])
        .order('install_count', { ascending: false });

      if (error) {
        console.warn('[SkillRegistry] 加载失败:', error.message);
        return;
      }

      for (const row of data as SkillRow[]) {
        this.skills.set(row.id, mapSkill(row));
      }
      this.initialized = true;
    } catch (e) {
      console.warn('[SkillRegistry] 初始化异常:', e);
    }
  }

  /** 获取所有已加载的技能 */
  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /** 按 category 分组 */
  getByCategory(): Map<string, SkillDefinition[]> {
    const grouped = new Map<string, SkillDefinition[]>();
    for (const skill of this.skills.values()) {
      const cat = skill.category || '其他';
      const list = grouped.get(cat) || [];
      list.push(skill);
      grouped.set(cat, list);
    }
    return grouped;
  }

  /** 获取单个技能（metadata 级别，不包含 prompt_template 和 linked_files） */
  getMetadata(id: string): SkillDefinition | undefined {
    const skill = this.skills.get(id);
    if (!skill) return undefined;
    // Progressive disclosure: metadata 不返回 prompt template
    return { ...skill, promptTemplate: '', linkedFiles: undefined, linkedContent: undefined };
  }

  /** 获取完整技能内容（包含 prompt template） */
  getFull(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  /** 搜索技能（按名称、描述、标签） */
  search(query: string): SkillDefinition[] {
    const q = query.toLowerCase();
    return this.getAll().filter(s => {
      if (s.name.toLowerCase().includes(q)) return true;
      if (s.displayName.toLowerCase().includes(q)) return true;
      if (s.description.toLowerCase().includes(q)) return true;
      if (s.tags.some(t => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  /** 安装技能到用户 */
  async install(userId: string, skillId: string): Promise<boolean> {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    try {
      const supabase = createAdminClient();
      // 检查是否已安装
      const { data: existing } = await supabase
        .from('user_skills')
        .select('id')
        .eq('user_id', userId)
        .eq('skill_id', skillId)
        .maybeSingle();

      if (existing) return true; // 已安装

      const { error } = await supabase.from('user_skills').insert({
        user_id: userId,
        skill_id: skillId,
        enabled: true,
        custom_config: null,
      });

      if (error) {
        console.warn('[SkillRegistry] 安装失败:', error.message);
        return false;
      }

      // 更新安装计数
      await supabase.rpc('increment_skill_install', { p_skill_id: skillId });
      return true;
    } catch (e) {
      console.warn('[SkillRegistry] 安装异常:', e);
      return false;
    }
  }

  /** 卸载技能 */
  async uninstall(userId: string, skillId: string): Promise<boolean> {
    try {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from('user_skills')
        .delete()
        .eq('user_id', userId)
        .eq('skill_id', skillId);

      return !error;
    } catch {
      return false;
    }
  }

  /** 获取用户已安装的技能 ID 列表 */
  async getInstalledSkillIds(userId: string): Promise<string[]> {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('user_skills')
        .select('skill_id')
        .eq('user_id', userId)
        .eq('enabled', true);

      return (data || []).map(r => r.skill_id);
    } catch {
      return [];
    }
  }

  /** 创建自定义技能 */
  async create(
    skill: Omit<SkillDefinition, 'id' | 'createdAt' | 'updatedAt' | 'installCount'>
  ): Promise<SkillDefinition | null> {
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('skills')
        .insert({
          name: skill.name,
          display_name: skill.displayName,
          description: skill.description,
          category: skill.category || null,
          tags: skill.tags,
          prompt_template: skill.promptTemplate,
          parameter_schema: skill.parameterSchema || null,
          linked_files: skill.linkedFiles || null,
          linked_content: skill.linkedContent || null,
          version: skill.version,
          author_id: skill.authorId || null,
          visibility: skill.visibility,
        })
        .select()
        .single();

      if (error) {
        console.warn('[SkillRegistry] 创建失败:', error.message);
        return null;
      }

      const mapped = mapSkill(data as SkillRow);
      this.skills.set(mapped.id, mapped);
      return mapped;
    } catch (e) {
      console.warn('[SkillRegistry] 创建异常:', e);
      return null;
    }
  }

  /** 更新技能 */
  async update(
    id: string,
    patch: Partial<Omit<SkillDefinition, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<SkillDefinition | null> {
    try {
      const supabase = createAdminClient();
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) updates.name = patch.name;
      if (patch.displayName !== undefined) updates.display_name = patch.displayName;
      if (patch.description !== undefined) updates.description = patch.description;
      if (patch.promptTemplate !== undefined) updates.prompt_template = patch.promptTemplate;
      if (patch.parameterSchema !== undefined) updates.parameter_schema = patch.parameterSchema;
      if (patch.tags !== undefined) updates.tags = patch.tags;
      if (patch.version !== undefined) updates.version = patch.version;

      const { data, error } = await supabase
        .from('skills')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.warn('[SkillRegistry] 更新失败:', error.message);
        return null;
      }

      const mapped = mapSkill(data as SkillRow);
      this.skills.set(id, mapped);
      return mapped;
    } catch (e) {
      console.warn('[SkillRegistry] 更新异常:', e);
      return null;
    }
  }

  /** 删除技能 */
  async delete(id: string): Promise<boolean> {
    try {
      const supabase = createAdminClient();
      const { error } = await supabase.from('skills').delete().eq('id', id);
      if (!error) this.skills.delete(id);
      return !error;
    } catch {
      return false;
    }
  }
}

function mapSkill(row: SkillRow): SkillDefinition {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    description: row.description,
    category: row.category || undefined,
    tags: row.tags || [],
    promptTemplate: row.prompt_template,
    parameterSchema: row.parameter_schema || undefined,
    linkedFiles: row.linked_files || undefined,
    linkedContent: row.linked_content || undefined,
    version: row.version,
    authorId: row.author_id || undefined,
    visibility: row.visibility,
    installCount: row.install_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
