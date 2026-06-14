// 审核Agent 自动修复器 — 对 minor 级别问题自动修复输出

import type { ContentType, QualityFinding } from './types';

export interface AutoFixResult {
  fixed: boolean;
  originalOutput: string;
  modifiedOutput: string;
  changes: string[];
}

/**
 * 对工具输出应用自动修复。
 * 仅处理 severity='minor' 的问题。
 * major/critical 问题只追加反馈，不修改内容。
 */
export function applyAutoFixes(
  output: string,
  contentType: ContentType,
  findings: QualityFinding[]
): AutoFixResult {
  let modified = output;
  const changes: string[] = [];

  for (const finding of findings) {
    if (finding.passed) continue;
    if (finding.severity !== 'minor') continue;

    switch (finding.itemId) {
      // ── 文案修复 ──
      case 'no-academic-flavor': {
        const replacements: [RegExp, string][] = [
          [/由此可见[，,]?\s*/g, ''],
          [/基于上述[，,]?\s*/g, ''],
          [/本篇文章旨在[，,]?\s*/g, ''],
          [/笔者认为[，,]?\s*/g, ''],
          [/我们不难发现[，,]?\s*/g, ''],
        ];
        for (const [pattern, replacement] of replacements) {
          if (pattern.test(modified)) {
            modified = modified.replace(pattern, replacement);
            changes.push(`移除学术用语: ${pattern.source}`);
          }
        }
        break;
      }
      case 'specific-cta': {
        // 将泛化的 "欢迎关注" 替换为更具体的 CTA
        if (/欢迎关注/.test(modified) && !/评论区|点击下方|扣1|私信/.test(modified)) {
          modified = modified.replace(
            /欢迎关注[我我]?[！!。.]?/g,
            '喜欢就点赞收藏，评论区告诉我你的想法～'
          );
          changes.push('CTA 从泛化"欢迎关注"替换为具体互动引导');
        }
        break;
      }
      case 'platform-title-length': {
        // 精简超长标题
        modified = modified.replace(/^(#+\s*)(.{25,})$/m, (_match, prefix: string, title: string) => {
          changes.push(`精简超长标题: "${title.substring(0, 20)}..."`);
          return prefix + title.substring(0, 20) + '...';
        });
        break;
      }
      // ── 视频修复 ──
      case 'subtitle-length': {
        // 字幕过长无法自动修复（需要重写），仅标记
        break;
      }
      case 'bgm-selected': {
        // BGM 未选择，无法自动修复（需要 LLM 决定风格）
        break;
      }
      // ── 图片修复 ──
      case 'series-consistency': {
        // seed 缺失无法自动修复（需要重新生成）
        break;
      }
      // ── 数字人修复 ──
      case 'voice-specified': {
        // 音色未指定无法自动修复
        break;
      }
      // ── 内容提取修复 ──
      case 'extract-method': {
        // 提取方式未说明，追加标注
        if (!/语音识别|网页提取|API|自动提取/.test(modified)) {
          modified += '\n\n📌 内容来源：通过 AI 自动提取';
          changes.push('追加提取方式标注');
        }
        break;
      }
    }
  }

  return {
    fixed: changes.length > 0,
    originalOutput: output,
    modifiedOutput: modified,
    changes,
  };
}
