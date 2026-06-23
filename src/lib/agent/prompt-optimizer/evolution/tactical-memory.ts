// 战术记忆 — 会话内模式追踪（Map 存储，会话结束即清）
// 跟踪：框架选择→结果反馈 的即时模式，影响当前会话的后续框架选择

interface TacticalEntry {
  frameworkId: string;
  rating: 1 | -1;
  timestamp: number;
  promptSnippet: string;
}

interface FrameworkAdjustment {
  /** 框架权重偏置（叠加到 optimizer 评分） */
  bias: number;
  /** 调整原因 */
  reason: string;
  /** 基于的样本数 */
  samples: number;
}

export class TacticalMemory {
  private entries: Map<string, TacticalEntry[]> = new Map();
  private readonly maxEntries = 20;

  /** 记录一次反馈 */
  record(
    sessionId: string,
    frameworkId: string,
    rating: 1 | -1,
    promptSnippet: string,
  ): void {
    const list = this.entries.get(sessionId) || [];
    list.push({
      frameworkId,
      rating,
      timestamp: Date.now(),
      promptSnippet: promptSnippet.substring(0, 100),
    });
    if (list.length > this.maxEntries) list.shift();
    this.entries.set(sessionId, list);
  }

  /** 获取会话内某框架的偏置（-0.15 ~ +0.15） */
  getFrameworkBias(sessionId: string, frameworkId: string): FrameworkAdjustment | null {
    const list = this.entries.get(sessionId);
    if (!list || list.length === 0) return null;

    const relevant = list.filter((e) => e.frameworkId === frameworkId);
    if (relevant.length === 0) return null;

    const positives = relevant.filter((e) => e.rating === 1).length;
    const ratio = positives / relevant.length;

    // 3+ 样本才给显著偏置
    if (relevant.length < 3) {
      return {
        bias: (ratio - 0.5) * 0.1,
        reason: `会话内 ${relevant.length} 次${frameworkId}反馈 (${(ratio * 100).toFixed(0)}% 正面)`,
        samples: relevant.length,
      };
    }

    return {
      bias: (ratio - 0.5) * 0.3,
      reason: `会话内 ${relevant.length} 次${frameworkId}反馈 (${(ratio * 100).toFixed(0)}% 正面)`,
      samples: relevant.length,
    };
  }

  /** 获取会话内所有框架偏置汇总 */
  getAllBiases(sessionId: string): Map<string, FrameworkAdjustment> {
    const biases = new Map<string, FrameworkAdjustment>();
    const list = this.entries.get(sessionId);
    if (!list) return biases;

    const frameworkIds = new Set(list.map((e) => e.frameworkId));
    for (const fid of frameworkIds) {
      const bias = this.getFrameworkBias(sessionId, fid);
      if (bias) biases.set(fid, bias);
    }
    return biases;
  }

  /** 获取最近表现最好的框架 ID */
  getBestFramework(sessionId: string): string | null {
    const list = this.entries.get(sessionId);
    if (!list || list.length === 0) return null;

    const recent = list.slice(-5);
    const scores = new Map<string, number>();
    for (const e of recent) {
      scores.set(e.frameworkId, (scores.get(e.frameworkId) || 0) + e.rating);
    }
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const [fid, score] of scores) {
      if (score > bestScore) { bestScore = score; best = fid; }
    }
    return best;
  }

  /** 清理会话数据 */
  clear(sessionId: string): void {
    this.entries.delete(sessionId);
  }
}

export const tacticalMemory = new TacticalMemory();
