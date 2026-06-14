// 审核Agent 类型定义 — 结构化质量检查、自动修复、指标追踪

/** 内容类型（对应不同质量检查清单） */
export type ContentType =
  | 'copywriting'     // 文案
  | 'image'           // 图片
  | 'video'           // 视频
  | 'digital_human'   // 数字人
  | 'content_extract' // 内容提取
  | 'tts'             // 配音
  | 'publish'         // 发布
  | 'search';         // 搜索

/** 问题严重程度 */
export type Severity = 'minor' | 'major' | 'critical';

/** 单条质量检查项 */
export interface ChecklistItem {
  /** 唯一标识（如 'no-template-words'） */
  id: string;
  /** 人类可读的描述 */
  description: string;
  /** 严重程度：minor=自动修复, major=标记反馈, critical=要求重做 */
  severity: Severity;
  /**
   * 检测函数。regex 用于简单文本匹配，function 用于复杂逻辑。
   * 返回 true 表示发现问题。
   */
  detect: RegExp | ((output: string, data?: unknown) => boolean);
  /** 自动修复建议文本（仅 minor 级别会被自动处理） */
  fixSuggestion?: string;
}

/** 按内容类型组织的质量检查清单 */
export interface QualityChecklist {
  contentType: ContentType;
  items: ChecklistItem[];
}

/** 单条检查发现 */
export interface QualityFinding {
  checklistId: string;
  itemId: string;
  severity: Severity;
  /** true = 通过检查（无问题），false = 发现问题 */
  passed: boolean;
  /** 问题详情 */
  detail: string;
  /** 修复建议 */
  fixSuggestion?: string;
  /** 是否已被自动修复 */
  autoFixed: boolean;
}

/** 一次质量审核的完整报告 */
export interface QualityReport {
  toolName: string;
  contentType: ContentType | null;
  findings: QualityFinding[];
  /** 总体判定 */
  overallVerdict: 'pass' | 'warn' | 'fail';
  timestamp: number;
}

/** 按 session 聚合的质量指标 */
export interface QualityMetricsSnapshot {
  sessionId: string;
  totalChecks: number;
  passed: number;
  warnings: number;
  failures: number;
  byContentType: Record<string, { total: number; passed: number; warn: number; fail: number }>;
  byTool: Record<string, { total: number; passed: number; warn: number; fail: number }>;
}
