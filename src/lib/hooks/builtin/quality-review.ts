// 审核Agent Hook — 在工具调用后自动检查生成内容质量
// 纯 pattern/function 检测，零 LLM 调用，通过 HookManager 注册
//
// 工作流：
//   post_tool_call → 识别内容类型 → 运行结构化检查
//     → minor 问题自动修复 → major/critical 问题追加反馈
//     → 记录质量指标
//   agent:end → flush 指标到 ctx.custom.qualityMetrics

import type { HookDefinition } from '../types';
import type { ContentType } from '@/lib/agent/quality/types';
import {
  getChecklistForTool,
  getContentTypeForTool,
  runQualityCheck,
} from '@/lib/agent/quality/checklists';
import { applyAutoFixes } from '@/lib/agent/quality/auto-fixer';
import { qualityMetrics } from '@/lib/agent/quality/metrics';

export interface QualityReviewOptions {
  /** 启用的内容类型（默认全部启用） */
  enabledTypes?: Set<ContentType>;
  /** 禁用自动修复，仅标记问题（默认 false） */
  noAutoFix?: boolean;
  /** 质量反馈追加到输出的最大长度（默认 400） */
  maxFeedbackLength?: number;
}

const ALL_CONTENT_TYPES: ContentType[] = [
  'copywriting', 'image', 'video', 'digital_human',
  'content_extract', 'tts', 'publish', 'search',
];

/**
 * 创建审核 Agent Hook。
 * 可在不同场景下用不同配置创建多个实例。
 */
export function createQualityReviewHook(options: QualityReviewOptions = {}): HookDefinition {
  const enabledTypes = options.enabledTypes ?? new Set(ALL_CONTENT_TYPES);
  const noAutoFix = options.noAutoFix ?? false;
  const maxFeedbackLength = options.maxFeedbackLength ?? 400;

  return {
    name: 'quality-review',
    description: '审核Agent：在工具调用后检查生成内容质量，自动修复小问题，标记大问题',
    events: ['post_tool_call', 'agent:end'],

    handler: async (ctx) => {
      if (ctx.event === 'post_tool_call') {
        const toolName = ctx.toolName;
        const toolResult = ctx.toolResult;
        if (!toolName || !toolResult?.success) return;
        if (!toolResult.output || toolResult.output.trim().length === 0) return;

        const contentType = getContentTypeForTool(toolName);
        if (!contentType) return;
        if (!enabledTypes.has(contentType)) return;

        const checklist = getChecklistForTool(toolName);
        if (!checklist) return;

        // 运行检查
        const findings = runQualityCheck(checklist, toolResult.output, toolResult.data);
        if (findings.length === 0) {
          qualityMetrics.recordCheck(
            ctx.sessionId || 'unknown', toolName, contentType, 'pass'
          );
          return;
        }

        // 判定总体结果
        const hasFailures = findings.some(
          (f) => f.severity === 'critical' && !f.passed
        );
        const hasWarnings = findings.some(
          (f) => f.severity === 'major' && !f.passed
        );
        const verdict = hasFailures ? 'fail' : hasWarnings ? 'warn' : 'pass';

        qualityMetrics.recordCheck(
          ctx.sessionId || 'unknown', toolName, contentType, verdict
        );

        // 构建质量反馈块
        const failedItems = findings.filter((f) => !f.passed);
        const minorIssues = failedItems.filter((f) => f.severity === 'minor');
        const majorIssues = failedItems.filter(
          (f) => f.severity === 'major' || f.severity === 'critical'
        );

        const lines: string[] = [];
        lines.push('\n\n---');
        lines.push('[🔍 质量审核]');

        if (majorIssues.length > 0) {
          lines.push('⚠️ 以下问题建议修复：');
          for (const item of majorIssues) {
            const label = item.severity === 'critical' ? '严重' : '重要';
            lines.push(`  - [${label}] ${item.detail}`);
            if (item.fixSuggestion) {
              lines.push(`    💡 ${item.fixSuggestion}`);
            }
          }
        }

        if (minorIssues.length > 0) {
          if (majorIssues.length > 0) lines.push('');
          lines.push('📝 小建议：');
          for (const item of minorIssues) {
            lines.push(`  - ${item.detail}`);
          }
        }

        lines.push('---\n');

        let feedback = lines.join('\n');
        if (feedback.length > maxFeedbackLength) {
          feedback =
            feedback.substring(0, maxFeedbackLength) + '\n...(已截断)\n---\n';
        }

        // 应用自动修复（仅 minor 级别）
        if (!noAutoFix) {
          const fixResult = applyAutoFixes(
            toolResult.output,
            contentType,
            failedItems
          );
          if (fixResult.fixed) {
            toolResult.output = fixResult.modifiedOutput;
            feedback += `\n✅ 已自动修复 ${fixResult.changes.length} 项：${fixResult.changes.join('；')}`;
          }
        }

        // 追加反馈到工具输出（引用传递，自动流入 LLM 上下文）
        toolResult.output += feedback;
      }

      if (ctx.event === 'agent:end') {
        // 将 session 质量指标 flush 到 custom 数据中
        const sessionId = ctx.sessionId || 'unknown';
        const stats = qualityMetrics.flushSession(sessionId);
        if (stats) {
          if (!ctx.custom) ctx.custom = {};
          ctx.custom.qualityMetrics = stats;
        }
      }
    },
  };
}

/** 预配置的默认实例：全部类型启用，自动修复开启 */
export const qualityReviewHook: HookDefinition = createQualityReviewHook();
