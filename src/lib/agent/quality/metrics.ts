// 审核Agent 指标追踪 — 按 session 累计质量 pass/warn/fail

import type { ContentType, QualityMetricsSnapshot } from './types';

function emptyBucket(): { total: number; passed: number; warn: number; fail: number } {
  return { total: 0, passed: 0, warn: 0, fail: 0 };
}

class QualityMetricsTracker {
  private sessions = new Map<string, QualityMetricsSnapshot>();

  initSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) return;
    this.sessions.set(sessionId, {
      sessionId,
      totalChecks: 0,
      passed: 0,
      warnings: 0,
      failures: 0,
      byContentType: {},
      byTool: {},
    });
  }

  recordCheck(
    sessionId: string,
    toolName: string,
    contentType: ContentType,
    verdict: 'pass' | 'warn' | 'fail'
  ): void {
    let snap = this.sessions.get(sessionId);
    if (!snap) {
      this.initSession(sessionId);
      snap = this.sessions.get(sessionId)!;
    }

    snap.totalChecks++;
    if (verdict === 'pass') snap.passed++;
    else if (verdict === 'warn') snap.warnings++;
    else snap.failures++;

    // byContentType
    if (!snap.byContentType[contentType]) {
      snap.byContentType[contentType] = emptyBucket();
    }
    snap.byContentType[contentType].total++;
    if (verdict === 'pass') snap.byContentType[contentType].passed++;
    else if (verdict === 'warn') snap.byContentType[contentType].warn++;
    else snap.byContentType[contentType].fail++;

    // byTool
    if (!snap.byTool[toolName]) {
      snap.byTool[toolName] = emptyBucket();
    }
    snap.byTool[toolName].total++;
    if (verdict === 'pass') snap.byTool[toolName].passed++;
    else if (verdict === 'warn') snap.byTool[toolName].warn++;
    else snap.byTool[toolName].fail++;
  }

  getSessionStats(sessionId: string): QualityMetricsSnapshot | null {
    return this.sessions.get(sessionId) || null;
  }

  flushSession(sessionId: string): QualityMetricsSnapshot | null {
    const snap = this.sessions.get(sessionId);
    if (snap) this.sessions.delete(sessionId);
    return snap || null;
  }
}

export const qualityMetrics = new QualityMetricsTracker();
