// SkillExecutor — 技能执行器
// 渲染 prompt template + 调用 LLM 执行技能

import type { SkillDefinition, SkillInvocation, SkillResult } from '../types';
import { callDeepSeek } from '@/lib/ai-services';

export class SkillExecutor {
  /** 执行单个技能 */
  async execute(
    skill: SkillDefinition,
    input: SkillInvocation,
    context?: { userQuery?: string }
  ): Promise<SkillResult> {
    const start = Date.now();

    try {
      const prompt = this.renderTemplate(skill.promptTemplate, input.params, context);
      const output = await callDeepSeek(prompt, {
        temperature: 0.3,
        maxTokens: 1500,
      });

      return {
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        output: '',
        error: msg,
        durationMs: Date.now() - start,
      };
    }
  }

  /** 渲染 prompt 模板，替换参数占位符 */
  private renderTemplate(
    template: string,
    params: Record<string, unknown>,
    context?: { userQuery?: string }
  ): string {
    let result = template;

    // 替换 {{paramName}} 占位符
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{{${key}}}`;
      result = result.replaceAll(placeholder, String(value));
    }

    // 注入用户查询（如果有）
    if (context?.userQuery) {
      result = result.replace('{{user_query}}', context.userQuery);
      // 如果模板中没有显式占位符，追加到末尾
      if (!template.includes('{{user_query}}')) {
        result += `\n\n用户输入：${context.userQuery}`;
      }
    }

    // 清理未替换的占位符（用空字符串替换）
    result = result.replace(/\{\{\w+\}\}/g, '（未指定）');

    return result;
  }
}
