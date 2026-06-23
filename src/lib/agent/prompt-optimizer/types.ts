// 提示词优化器类型定义

export interface PromptFramework {
  id: string;
  name: string;
  category: 'marketing' | 'creative' | 'technical' | 'analysis' | 'planning' | 'education' | 'general';
  industries: string[];
  description: string;
  template: string;
  applicableTasks: string[];
  /** 动态权重（V4 由 WeightAdjuster 更新），默认 0.5 */
  weight: number;
}

export interface OptimizationRequest {
  originalPrompt: string;
  userId: string;
  sessionId?: string;
  frameworkId?: string;
  hints?: {
    industry?: string;
    taskType?: string;
  };
  /** 框架 ID → 偏置值（-0.3 ~ +0.3），来自战术+战略记忆 */
  memoryBiases?: Map<string, number>;
}

export interface OptimizationResult {
  original: string;
  optimized: string;
  frameworkUsed: { id: string; name: string; confidence: number };
  reasoning: string;
  tokensUsed: number;
  timestamp: string;
}

export interface PromptOptimizerRaw {
  original: string;
  optimized: string;
  frameworkId: string;
  frameworkName: string;
  confidence: number;
}
