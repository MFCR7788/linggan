// 内容合规检查器 — 基于 knowledge_base 合规规则库
// 在 AI 生成内容后检查，命中规则时追加 ⚠️ 提示
// 日期: 2026-06-13

import { createAdminClient } from '@/lib/supabase-server';
import { generateEmbedding } from '@/lib/assistant/embedding';

export interface ComplianceIssue {
  rule_title: string;
  rule_summary: string;
  matched_fragment: string;
  severity: 'warning' | 'caution';
}

interface ComplianceRule {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
}

/** 从 knowledge_base 加载合规规则 */
async function loadRules(): Promise<ComplianceRule[]> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('knowledge_base')
      .select('id, title, content, category, tags')
      .eq('category', 'compliance')
      .eq('visibility', 'public')
      .limit(50);

    return (data || []) as ComplianceRule[];
  } catch {
    return [];
  }
}

/** 关键词预筛（快速，不调 API） */
function keywordMatch(text: string, rule: ComplianceRule): boolean {
  const lower = text.toLowerCase();
  const keywords = [...rule.tags, rule.title];
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) return true;
  }
  return false;
}

/** 检查 AI 回复的合规性，返回发现的问题 */
export async function checkCompliance(
  input: string,
  output: string
): Promise<ComplianceIssue[]> {
  const rules = await loadRules();
  if (rules.length === 0) return [];

  const combined = `${input}\n${output}`;
  const issues: ComplianceIssue[] = [];

  // 逐条规则检查
  for (const rule of rules) {
    // 快速关键词筛选
    if (!keywordMatch(combined, rule)) continue;

    // 关键词命中 → 检查 severity
    const severityTags = rule.tags.map((t) => t.toLowerCase());
    const severity: 'warning' | 'caution' = severityTags.includes('high-risk')
      ? 'warning'
      : 'caution';

    // 尝试找出匹配片段（取输出中包含关键词的句子）
    const matchedFragment = extractMatchedFragment(output, rule.tags, 80);

    issues.push({
      rule_title: rule.title,
      rule_summary: rule.content.slice(0, 150),
      matched_fragment: matchedFragment || '(内容关键词匹配)',
      severity,
    });
  }

  return issues;
}

/** 从输出中提取包含关键词的片段 */
function extractMatchedFragment(
  text: string,
  keywords: string[],
  maxLen: number
): string | null {
  for (const kw of keywords.slice(0, 3)) {
    const idx = text.indexOf(kw);
    if (idx >= 0) {
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + kw.length + maxLen);
      return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
    }
  }
  return null;
}

/** 格式化合规提示（追加到 AI 回复末尾） */
export function formatComplianceNote(issues: ComplianceIssue[]): string {
  if (issues.length === 0) return '';

  const warnings = issues.filter((i) => i.severity === 'warning');
  const cautions = issues.filter((i) => i.severity === 'caution');

  const lines: string[] = [];
  lines.push('');
  lines.push('---');
  lines.push('⚖️ **内容合规提醒**');

  for (const w of warnings) {
    lines.push(`⚠️ **${w.rule_title}**：${w.rule_summary}`);
  }
  for (const c of cautions) {
    lines.push(`📌 ${c.rule_title}：${c.rule_summary}`);
  }

  lines.push('');
  lines.push('> 以上提示基于公共合规规则自动生成，不构成法律建议。如有疑问，请咨询专业法律人士。');

  return lines.join('\n');
}
