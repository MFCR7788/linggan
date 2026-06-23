// 提示词优化核心引擎 — 框架选择 + LLM 优化 + 记忆偏置

import type { OptimizationRequest, OptimizationResult, PromptFramework, PromptOptimizerRaw } from './types';
import { ALL_FRAMEWORKS, FRAMEWORKS_BY_INDUSTRY, FRAMEWORKS_BY_TASK } from './frameworks';
import { defaultModelRouter } from '@/lib/providers/model-router';
import type { ChatMessage } from '@/lib/ai/types';

const MIN_PROMPT_LENGTH = 8;
const SYSTEM_PROMPT = '你是一个专业的提示词优化工程师。严格按照指定框架优化用户提示词，输出优化后的完整提示词。不要输出解释，不要输出框架分析，只输出优化后的内容。保持用户原始意图、语言和风格。';

type ScoredFramework = PromptFramework & { _score: number };

export class PromptOptimizer {
  private frameworks: PromptFramework[];

  constructor(frameworks?: PromptFramework[]) {
    this.frameworks = frameworks ?? ALL_FRAMEWORKS;
  }

  async optimize(request: OptimizationRequest): Promise<OptimizationResult> {
    if (request.originalPrompt.length < MIN_PROMPT_LENGTH) {
      return this.noOpResult(request.originalPrompt, '输入过短，不需要优化');
    }

    let framework: PromptFramework | null;
    let confidence: number;
    let reasoning: string;

    if (request.frameworkId) {
      framework = this.getFramework(request.frameworkId);
      confidence = 1.0;
      reasoning = '用户指定框架';
    } else {
      const selected = await this.selectFramework(request.originalPrompt, request.hints, request.memoryBiases);
      framework = selected.framework;
      confidence = selected.confidence;
      reasoning = selected.reasoning;
    }

    if (!framework) {
      return this.noOpResult(request.originalPrompt, reasoning || '无法匹配合适的框架');
    }

    if (confidence < 0.3) {
      return this.noOpResult(request.originalPrompt, `最佳框架 ${framework.name} 匹配置信度过低(${(confidence * 100).toFixed(0)}%)`);
    }

    try {
      const optPrompt = framework.template.replace('{prompt}', request.originalPrompt);
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: optPrompt },
      ];

      const optimized = await defaultModelRouter.chat(messages, {
        temperature: 0.4,
        maxTokens: 2000,
        taskType: 'optimization' as never,
      });

      const result = optimized.trim();
      if (!result || result === request.originalPrompt) {
        return this.noOpResult(request.originalPrompt, '优化未产生有效变化');
      }

      return {
        original: request.originalPrompt,
        optimized: result,
        frameworkUsed: { id: framework.id, name: framework.name, confidence },
        reasoning,
        tokensUsed: result.length,
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      console.warn('[PromptOptimizer] LLM 调用失败，降级使用原始 prompt:', (e as Error).message);
      return this.noOpResult(request.originalPrompt, `优化出错: ${(e as Error).message}`);
    }
  }

  async selectFramework(
    prompt: string,
    hints?: OptimizationRequest['hints'],
    memoryBiases?: Map<string, number>,
  ): Promise<{ framework: PromptFramework | null; confidence: number; reasoning: string }> {
    let candidates = [...this.frameworks];

    // Phase 1: 行业过滤
    if (hints?.industry && FRAMEWORKS_BY_INDUSTRY[hints.industry]) {
      candidates = FRAMEWORKS_BY_INDUSTRY[hints.industry];
    }

    // Phase 2: 任务类型过滤
    if (hints?.taskType && FRAMEWORKS_BY_TASK[hints.taskType]) {
      const taskFws = FRAMEWORKS_BY_TASK[hints.taskType];
      const taskIds = new Set(taskFws.map((f) => f.id));
      candidates = candidates.filter((f) => taskIds.has(f.id));
      if (candidates.length === 0) candidates = taskFws;
    }

    // Phase 3: 关键词评分 + 记忆偏置
    const scored: ScoredFramework[] = candidates.map((fw) => {
      let score = this.scoreByKeywords(prompt, fw);
      // 应用记忆偏置（战术 + 战略）
      if (memoryBiases) {
        const bias = memoryBiases.get(fw.id);
        if (bias !== undefined) score += bias;
      }
      return { ...fw, _score: score };
    });
    scored.sort((a, b) => b._score - a._score);

    const top = scored[0];
    if (!top) {
      return { framework: null, confidence: 0, reasoning: '没有可用的框架' };
    }

    // 单个高分候选 → 直接返回
    const SECOND_BEST_GAP = 0.15;
    if (scored.length === 1 || top._score - scored[1]._score > SECOND_BEST_GAP) {
      return {
        framework: top,
        confidence: Math.min(top._score, 1.0),
        reasoning: `关键词匹配选择「${top.name}」框架，得分 ${top._score.toFixed(2)}`,
      };
    }

    // Phase 4: 多候选时用 LLM 精选（top-3）
    return this.llmSelectFramework(prompt, scored.slice(0, 3));
  }

  private scoreByKeywords(prompt: string, fw: PromptFramework): number {
    let score = 0.5;

    // 名称包含
    if (prompt.includes(fw.name)) score += 0.3;
    // 行业关键词
    const industryKw: Record<string, string[]> = {
      '美妆': ['化妆品', '护肤', '美妆', '防晒', '口红', '粉底', '面膜', '精华', '眼影', '彩妆', '卸妆', '美白', '保湿'],
      '科技': ['软件', 'AI', '代码', '编程', '算法', '数据', '服务器', 'API', '系统', '应用', '平台', '技术'],
      '教育': ['课程', '学习', '教育', '培训', '考试', '学生', '教学', '知识', '技能', '教程'],
      '食品': ['美食', '餐厅', '食材', '烹饪', '食谱', '甜品', '饮品', '小吃', '火锅'],
      '服饰': ['穿搭', '衣服', '时尚', '鞋子', '配饰', '包包', '潮流'],
      '金融': ['理财', '投资', '保险', '股票', '基金', '贷款', '信用卡', '收益率'],
      '健康': ['减肥', '健身', '养生', '睡眠', '运动', '饮食', '体检'],
      '家居': ['装修', '家具', '收纳', '家电', '软装', '空间'],
      '设计': ['UI', 'UX', '视觉', '配色', '排版', '品牌', 'Logo'],
    };

    for (const industry of fw.industries) {
      const kws = industryKw[industry];
      if (kws) {
        for (const kw of kws) {
          if (prompt.includes(kw)) { score += 0.05; break; }
        }
      }
    }

    // 任务关键词
    const taskKw: Record<string, string[]> = {
      'copywriting': ['文案', '写', '推广', '营销', '宣传', '种草', '推荐', '测评'],
      'video_script': ['视频', '脚本', '拍摄', '短视频', '抖音', '小红书', '口播'],
      'analysis': ['分析', '对比', '评估', '解读', '研究', '报告', '数据'],
      'planning': ['规划', '计划', '方案', '策略', '目标', '执行', '步骤'],
      'image_generation': ['图片', '图像', '生成图', '海报', '封面', '配图', '设计图'],
      'brainstorming': ['创意', '想法', '灵感', '点子', '突破', '创新', '头脑风暴'],
      'education': ['学习', '教程', '讲解', '解释', '入门', '掌握', '理解'],
    };

    for (const task of fw.applicableTasks) {
      const kws = taskKw[task];
      if (kws) {
        for (const kw of kws) {
          if (prompt.includes(kw)) { score += 0.08; break; }
        }
      }
    }

    // 权重偏置（来自 V4 动态权重）
    score *= (0.5 + fw.weight);

    return score;
  }

  private async llmSelectFramework(
    prompt: string,
    candidates: ScoredFramework[],
  ): Promise<{ framework: PromptFramework | null; confidence: number; reasoning: string }> {
    try {
      const frameworkList = candidates
        .map((f) => `- ${f.id}: ${f.name} — ${f.description}（行业：${f.industries.filter((i) => i !== '全行业').join('、')}）`)
        .join('\n');

      const selectionPrompt = `分析以下用户输入，从候选框架中选择最合适的。

用户输入：${prompt.substring(0, 500)}

候选框架：
${frameworkList}

返回 JSON（不要其他内容）：
{"selectedId": "框架id", "confidence": 0.85, "reasoning": "选择理由（一句话）"}`;

      const messages: ChatMessage[] = [
        { role: 'system', content: '你是一个提示词工程专家。只返回 JSON。' },
        { role: 'user', content: selectionPrompt },
      ];

      const response = await defaultModelRouter.chat(messages, {
        temperature: 0.1,
        maxTokens: 300,
        taskType: 'optimization' as never,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('无法解析 LLM 框架选择结果');

      const parsed = JSON.parse(jsonMatch[0]);
      const framework = candidates.find((f) => f.id === parsed.selectedId) || candidates[0];

      return {
        framework,
        confidence: parsed.confidence ?? 0.6,
        reasoning: parsed.reasoning ?? `LLM 精选选择「${framework.name}」框架`,
      };
    } catch {
      return {
        framework: candidates[0],
        confidence: candidates[0]._score,
        reasoning: `降级使用最高分候选「${candidates[0].name}」`,
      };
    }
  }

  private getFramework(id: string): PromptFramework | null {
    return this.frameworks.find((f) => f.id === id) ?? null;
  }

  private noOpResult(original: string, reasoning: string): OptimizationResult {
    return {
      original,
      optimized: original,
      frameworkUsed: { id: 'none', name: '无', confidence: 0 },
      reasoning,
      tokensUsed: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

export const defaultPromptOptimizer = new PromptOptimizer();
