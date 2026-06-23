// 关键词更新器 — 根据成功反馈更新 skills 表的 trigger_keywords

import { createAdminClient } from '@/lib/supabase-server';

interface KeywordUpdate {
  skillName: string;
  addedKeywords: string[];
  removedKeywords: string[];
  reason: string;
}

/**
 * 分析近期反馈，更新 skills 触发关键词
 * 从成功反馈的原始 prompt 中提取高频词，补充到对应技能的 trigger_keywords
 */
export async function updateTriggerKeywords(): Promise<{
  updates: KeywordUpdate[];
  log: string;
}> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  // 1. 获取近期正面反馈的 prompt
  const { data: feedbacks } = await supabase
    .from('prompt_feedback')
    .select('original_prompt, framework_used, feedback_tags')
    .eq('rating', 1)
    .gte('created_at', since)
    .limit(100);

  if (!feedbacks || feedbacks.length === 0) {
    return { updates: [], log: '无近期正面反馈，跳过关键词更新' };
  }

  // 2. 提取高频词（按框架分组）
  const frameworkKeywords = new Map<string, Map<string, number>>();
  for (const f of feedbacks as Array<{ original_prompt: string; framework_used: string }>) {
    const fid = f.framework_used || 'unknown';
    if (!frameworkKeywords.has(fid)) frameworkKeywords.set(fid, new Map());
    const wordMap = frameworkKeywords.get(fid)!;

    // 简单分词：提取 2-6 字的中文词
    const words = extractKeywords(f.original_prompt);
    for (const w of words) {
      wordMap.set(w, (wordMap.get(w) || 0) + 1);
    }
  }

  // 3. 获取所有 skills 及其当前 trigger_keywords
  const { data: skills } = await supabase
    .from('skills')
    .select('name, trigger_keywords');

  if (!skills || skills.length === 0) {
    return { updates: [], log: '无可用技能，跳过关键词更新' };
  }

  // 4. 匹配框架 → 技能 并更新关键词
  const updates: KeywordUpdate[] = [];
  const frameworkToSkill: Record<string, string> = {
    aida: 'xiaohongshu-optimizer',
    pas: 'xiaohongshu-optimizer',
    bab: 'xiaohongshu-optimizer',
    spark: 'seo-title-gen',
    trace: 'seo-title-gen',
  };

  for (const [fid, wordMap] of frameworkKeywords) {
    const skillName = frameworkToSkill[fid];
    if (!skillName) continue;

    const skill = (skills as Array<{ name: string; trigger_keywords: string[] }>)
      .find((s) => s.name === skillName);
    if (!skill) continue;

    const currentKws = new Set(skill.trigger_keywords || []);

    // 高频词 → 新关键词候选（出现 >= 2 次，且不在已有列表中）
    const candidates = Array.from(wordMap.entries())
      .filter(([word, count]) => count >= 2 && !currentKws.has(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    if (candidates.length === 0) continue;

    // 追加到 trigger_keywords
    const newKeywords = [...new Set([...Array.from(currentKws), ...candidates])];
    await supabase
      .from('skills')
      .update({ trigger_keywords: newKeywords })
      .eq('name', skillName);

    updates.push({
      skillName,
      addedKeywords: candidates,
      removedKeywords: [],
      reason: `基于 ${wordMap.size} 个高频词的正面反馈`,
    });
  }

  // 5. 记录日志
  if (updates.length > 0) {
    await supabase.from('prompt_evolution_log').insert({
      event_type: 'keyword_update',
      details: { updates: updates.map((u) => ({ skill: u.skillName, added: u.addedKeywords })) },
      affected_frameworks: frameworkToSkill ? Object.keys(frameworkToSkill) : [],
      summary: `更新了 ${updates.length} 个技能的触发关键词`,
      triggered_by: 'cron',
    });
  }

  return {
    updates,
    log: updates.length > 0
      ? `更新了 ${updates.length} 个技能的触发关键词：\n` + updates
          .map((u) => `  ${u.skillName}: +${u.addedKeywords.join(', ')}`)
          .join('\n')
      : '无关键词需要更新',
  };
}

/** 从文本中提取 2-4 字的中文关键词 */
function extractKeywords(text: string): string[] {
  const words: string[] = [];
  // 移除非中文字符
  const cleaned = text.replace(/[^一-鿿]/g, '');
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= cleaned.length - len; i++) {
      words.push(cleaned.substring(i, i + len));
    }
  }
  return words;
}
