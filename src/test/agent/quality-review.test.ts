import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQualityReviewHook } from '@/lib/hooks/builtin/quality-review';
import {
  getContentTypeForTool,
  getChecklistForTool,
  runQualityCheck,
  COPYWRITING_CHECKLIST,
  IMAGE_CHECKLIST,
  VIDEO_CHECKLIST,
} from '@/lib/agent/quality/checklists';
import { applyAutoFixes } from '@/lib/agent/quality/auto-fixer';
import { qualityMetrics } from '@/lib/agent/quality/metrics';
import type { ToolResult } from '@/lib/agent/types';
import type { HookContext } from '@/lib/hooks/types';

// ─── Helpers ──────────────────────────────────────────────────

function makeCtx(overrides: Partial<HookContext> = {}): HookContext {
  return {
    event: 'post_tool_call',
    userId: 'test-user',
    sessionId: 'test-session',
    toolName: 'generate_copywriting',
    toolResult: { success: true, output: '', data: {} },
    ...overrides,
  };
}

function makeToolResult(output: string, data?: unknown): ToolResult {
  return { success: true, output, data };
}

describe('getContentTypeForTool', () => {
  it('文案类工具返回 copywriting', () => {
    expect(getContentTypeForTool('generate_copywriting')).toBe('copywriting');
  });

  it('图片类工具返回 image', () => {
    expect(getContentTypeForTool('generate_image')).toBe('image');
    expect(getContentTypeForTool('edit_image')).toBe('image');
  });

  it('视频类工具返回 video', () => {
    expect(getContentTypeForTool('generate_video')).toBe('video');
    expect(getContentTypeForTool('compose_video')).toBe('video');
    expect(getContentTypeForTool('generate_product_video')).toBe('video');
  });

  it('数字人工具返回 digital_human', () => {
    expect(getContentTypeForTool('generate_digital_human')).toBe('digital_human');
  });

  it('非生成类工具返回 null', () => {
    expect(getContentTypeForTool('get_weather')).toBeNull();
    expect(getContentTypeForTool('unknown_tool')).toBeNull();
  });
});

describe('runQualityCheck', () => {
  it('干净文案通过所有检查', () => {
    const clean = '夏天防晒真的很重要！☀️\n\n我试了30款防晒霜，这3款最值得买～\n\n评论区告诉我你的肤质，我帮你推荐！';
    const findings = runQualityCheck(COPYWRITING_CHECKLIST, clean);
    expect(findings).toHaveLength(0);
  });

  it('检测到模板词', () => {
    const templated = '首先，防晒霜很重要。其次，要选对SPF值。最后，记得补涂。综上所述，防晒不可忽视。';
    const findings = runQualityCheck(COPYWRITING_CHECKLIST, templated);
    const templateFinding = findings.find((f) => f.itemId === 'no-template-words');
    expect(templateFinding).toBeDefined();
    expect(templateFinding!.passed).toBe(false);
    expect(templateFinding!.severity).toBe('major');
  });

  it('检测到学术化用语', () => {
    const academic = '由此可见，本篇文章旨在探讨AI技术。基于上述分析，笔者认为前景广阔。';
    const findings = runQualityCheck(COPYWRITING_CHECKLIST, academic);
    const academicFinding = findings.find((f) => f.itemId === 'no-academic-flavor');
    expect(academicFinding).toBeDefined();
    expect(academicFinding!.passed).toBe(false);
  });

  it('检测到泛化 CTA', () => {
    const vagueCta = '这个产品真的很好用！欢迎关注我～';
    const findings = runQualityCheck(COPYWRITING_CHECKLIST, vagueCta);
    const ctaFinding = findings.find((f) => f.itemId === 'specific-cta');
    expect(ctaFinding).toBeDefined();
    expect(ctaFinding!.passed).toBe(false);
  });

  it('检测到一大段无结构文字', () => {
    const longText = 'A'.repeat(300);
    const findings = runQualityCheck(COPYWRITING_CHECKLIST, longText);
    const structFinding = findings.find((f) => f.itemId === 'has-structure');
    expect(structFinding).toBeDefined();
    expect(structFinding!.passed).toBe(false);
  });
});

describe('applyAutoFixes', () => {
  it('移除学术化用语', () => {
    const output = '由此可见，AI技术发展迅速。基于上述分析，本篇文章旨在提供参考。';
    const findings = runQualityCheck(COPYWRITING_CHECKLIST, output);
    const result = applyAutoFixes(output, 'copywriting', findings);
    expect(result.fixed).toBe(true);
    expect(result.modifiedOutput).not.toContain('由此可见');
    expect(result.modifiedOutput).not.toContain('基于上述');
    expect(result.modifiedOutput).not.toContain('本篇文章旨在');
    expect(result.changes.length).toBeGreaterThan(0);
  });

  it('替换泛化 CTA 为具体互动引导', () => {
    const output = '这个防晒霜真的很好用！欢迎关注我！';
    const findings = runQualityCheck(COPYWRITING_CHECKLIST, output);
    const result = applyAutoFixes(output, 'copywriting', findings);
    expect(result.fixed).toBe(true);
    expect(result.modifiedOutput).not.toContain('欢迎关注');
    expect(result.modifiedOutput).toContain('评论区告诉我');
  });

  it('干净文案不触发修复', () => {
    const output = '夏天到了！快来评论区告诉我你的防晒秘诀～';
    const findings = runQualityCheck(COPYWRITING_CHECKLIST, output);
    const result = applyAutoFixes(output, 'copywriting', findings);
    expect(result.fixed).toBe(false);
    expect(result.modifiedOutput).toBe(output);
  });

  it('major 级别问题不自动修复', () => {
    const output = '首先，这个产品不错。其次，价格合理。最后，推荐购买。';
    const findings = runQualityCheck(COPYWRITING_CHECKLIST, output);
    const majorOnly = findings.filter((f) => f.severity === 'major');
    expect(majorOnly.length).toBeGreaterThan(0);
    // major 问题不应被 auto-fix
    const result = applyAutoFixes(output, 'copywriting', majorOnly);
    expect(result.fixed).toBe(false);
  });
});

describe('createQualityReviewHook — post_tool_call', () => {
  const hook = createQualityReviewHook();

  beforeEach(() => {
    qualityMetrics.flushSession('test-session');
  });

  it('检测到质量问题时修改 toolResult.output', async () => {
    const result = makeToolResult(
      '首先，防晒霜很重要。其次，要选SPF值高的。最后，记得补涂。欢迎关注我！'
    );
    const ctx = makeCtx({ toolResult: result });

    await hook.handler({ ...ctx, event: 'post_tool_call' });

    expect(result.output).toContain('[🔍 质量审核]');
    expect(result.output).toContain('模板词');
  });

  it('干净输出不添加质量反馈', async () => {
    const cleanOutput =
      '夏天防晒真的太重要了！☀️\n\n我实测了30款防晒霜，选出这3款最好用的～\n\n你是油皮还是干皮？评论区告诉我！';
    const result = makeToolResult(cleanOutput);
    const ctx = makeCtx({ toolResult: result });

    await hook.handler({ ...ctx, event: 'post_tool_call' });

    expect(result.output).not.toContain('[🔍 质量审核]');
    expect(result.output).toBe(cleanOutput);
  });

  it('无对应检查清单的工具跳过检查', async () => {
    const result = makeToolResult('some weather data');
    const ctx = makeCtx({ toolName: 'get_weather', toolResult: result });

    await hook.handler({ ...ctx, event: 'post_tool_call' });

    expect(result.output).not.toContain('[🔍 质量审核]');
  });

  it('失败的工具结果跳过检查', async () => {
    const result: ToolResult = {
      success: false,
      output: '首先这个不对其次那个也不行',
      error: '生成失败',
    };
    const ctx = makeCtx({ toolResult: result });

    await hook.handler({ ...ctx, event: 'post_tool_call' });

    expect(result.output).not.toContain('[🔍 质量审核]');
  });

  it('空输出跳过检查', async () => {
    const result = makeToolResult('');
    const ctx = makeCtx({ toolResult: result });

    await hook.handler({ ...ctx, event: 'post_tool_call' });

    expect(result.output).toBe('');
  });

  it('noAutoFix 选项禁用自动修复', async () => {
    const noFixHook = createQualityReviewHook({ noAutoFix: true });
    const output = '由此可见，AI技术发展迅速。欢迎关注我！';
    const result = makeToolResult(output);
    const ctx = makeCtx({ toolResult: result });

    await noFixHook.handler({ ...ctx, event: 'post_tool_call' });

    // 应该有质量审核反馈
    expect(result.output).toContain('[🔍 质量审核]');
    // 但不应该有自动修复提示
    expect(result.output).not.toContain('已自动修复');
    // 原始内容应该保持不变
    expect(result.output).toContain('由此可见');
  });

  it('enabledTypes 过滤只检查指定类型', async () => {
    const imageOnlyHook = createQualityReviewHook({
      enabledTypes: new Set(['image']),
    });
    const output = '首先，这个产品很好。其次，价格实惠。';
    const result = makeToolResult(output);
    const ctx = makeCtx({ toolResult: result });

    await imageOnlyHook.handler({ ...ctx, event: 'post_tool_call' });

    // 文案不在 enabledTypes 中，不应检查
    expect(result.output).not.toContain('[🔍 质量审核]');
  });
});

describe('createQualityReviewHook — agent:end', () => {
  beforeEach(() => {
    qualityMetrics.flushSession('test-session');
  });

  it('agent:end 时 flush 指标到 custom', async () => {
    const hook = createQualityReviewHook();

    // 先触发一次检查来积累指标
    const result = makeToolResult(
      '首先，这是一个问题文案。其次，欢迎关注。'
    );
    const ctx = makeCtx({ toolResult: result });
    await hook.handler({ ...ctx, event: 'post_tool_call' });

    // 然后触发 agent:end — 直接传对象（不展开），让 handler mutate 它
    const endCtx: HookContext = {
      event: 'agent:end',
      userId: 'test-user',
      sessionId: 'test-session',
    };
    await hook.handler(endCtx);

    // handler 在 agent:end 时应创建 ctx.custom 并写入 qualityMetrics
    expect(endCtx.custom).toBeDefined();
    expect(endCtx.custom!.qualityMetrics).toBeDefined();
    const metrics = endCtx.custom!.qualityMetrics as {
      totalChecks: number;
    };
    expect(metrics.totalChecks).toBeGreaterThan(0);
  });
});

describe('qualityMetrics', () => {
  beforeEach(() => {
    qualityMetrics.flushSession('test-session');
  });

  it('记录 pass/warn/fail 并聚合', () => {
    qualityMetrics.initSession('test-session');
    qualityMetrics.recordCheck('test-session', 'generate_copywriting', 'copywriting', 'pass');
    qualityMetrics.recordCheck('test-session', 'generate_image', 'image', 'warn');
    qualityMetrics.recordCheck('test-session', 'generate_video', 'video', 'fail');
    qualityMetrics.recordCheck('test-session', 'generate_copywriting', 'copywriting', 'pass');

    const stats = qualityMetrics.getSessionStats('test-session')!;
    expect(stats.totalChecks).toBe(4);
    expect(stats.passed).toBe(2);
    expect(stats.warnings).toBe(1);
    expect(stats.failures).toBe(1);
    expect(stats.byContentType.copywriting.total).toBe(2);
    expect(stats.byContentType.copywriting.passed).toBe(2);
    expect(stats.byTool.generate_image.warn).toBe(1);
    expect(stats.byTool.generate_video.fail).toBe(1);
  });

  it('flushSession 返回并清除数据', () => {
    qualityMetrics.initSession('test-session');
    qualityMetrics.recordCheck('test-session', 'generate_copywriting', 'copywriting', 'pass');

    const flushed = qualityMetrics.flushSession('test-session');
    expect(flushed).not.toBeNull();
    expect(flushed!.totalChecks).toBe(1);

    // flush 后数据应被清除
    const after = qualityMetrics.getSessionStats('test-session');
    expect(after).toBeNull();
  });
});
