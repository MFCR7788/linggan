// 提示词优化框架库 — 57 个框架按行业/复杂度组织

import type { PromptFramework } from './types';

type FrameworkFactory = Omit<PromptFramework, 'weight'>;

const MARKETING: FrameworkFactory[] = [
  {
    id: 'aida', name: 'AIDA', category: 'marketing',
    industries: ['美妆', '服饰', '数码', '食品', '家居', '教育', '金融', '全行业'],
    description: 'Attention-Interest-Desire-Action 经典营销漏斗',
    template: `用 AIDA 框架优化以下提示词：
1. Attention：开篇强钩子（痛点/数字/对比/悬念）
2. Interest：展开核心卖点，场景化描述产生共鸣
3. Desire：强化利益点，social proof 或限时稀缺性
4. Action：明确 CTA，告诉用户下一步做什么

原始提示词：{prompt}
输出优化后的完整提示词，保持用户原始意图和语言风格。`,
    applicableTasks: ['copywriting', 'ad_copy', 'product_description', 'video_script'],
  },
  {
    id: 'pas', name: 'PAS', category: 'marketing',
    industries: ['美妆', '健康', '教育', '金融', '科技', '全行业'],
    description: 'Problem-Agitate-Solve 痛点驱动框架',
    template: `用 PAS 框架优化以下提示词：
1. Problem：精准描述用户痛点
2. Agitate：放大不解决该问题的后果
3. Solve：给出解决方案，展示效果

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['copywriting', 'ad_copy', 'video_script'],
  },
  {
    id: 'scqa', name: 'SCQA', category: 'marketing',
    industries: ['科技', '金融', '咨询', '教育', '全行业'],
    description: 'Situation-Complication-Question-Answer 结构化叙事',
    template: `用 SCQA 框架优化以下提示词：
1. Situation：描述当前背景和现状
2. Complication：指出问题或冲突
3. Question：提出核心问题
4. Answer：给出解决方案

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['copywriting', 'analysis', 'presentation', 'article'],
  },
  {
    id: 'bab', name: 'BAB', category: 'marketing',
    industries: ['美妆', '健康', '教育', '金融', '全行业'],
    description: 'Before-After-Bridge 前后对比框架',
    template: `用 BAB 框架优化以下提示词：
1. Before：描述用户当前的状态/困境
2. After：描绘使用产品后的理想状态
3. Bridge：说明如何从 Before 到 After

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['copywriting', 'ad_copy'],
  },
  {
    id: 'spear', name: 'SPEAR', category: 'marketing',
    industries: ['美妆', '服饰', '数码', '食品', '全行业'],
    description: 'Scenario-Pain-Expectation-Action-Result 场景化营销',
    template: `用 SPEAR 框架优化以下提示词：
1. Scenario：设定使用场景
2. Pain：指出场景中的痛点
3. Expectation：用户期望的解决方案
4. Action：产品如何解决
5. Result：使用后的效果

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['copywriting', 'product_description', 'video_script'],
  },
  {
    id: 'rice', name: 'RICE', category: 'marketing',
    industries: ['科技', '金融', '咨询', '全行业'],
    description: 'Reach-Impact-Confidence-Effort 优先级排序框架',
    template: `用 RICE 框架优化以下提示词：
1. Reach：覆盖范围和受众规模
2. Impact：预期影响和效果
3. Confidence：信心水平和数据支撑
4. Effort：所需资源和时间投入

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['analysis', 'planning'],
  },
];

const CREATIVE: FrameworkFactory[] = [
  {
    id: 'scamper', name: 'SCAMPER', category: 'creative',
    industries: ['科技', '教育', '设计', '全行业'],
    description: 'Substitute-Combine-Adapt-Modify-Put-Eliminate-Reverse 创新思维',
    template: `用 SCAMPER 框架优化以下提示词：
1. Substitute（替代）：哪些元素可以替换
2. Combine（组合）：可以合并哪些想法
3. Adapt（调适）：可以从别处借鉴什么
4. Modify（修改）：可以改变什么
5. Put to another use（他用）：还能用于什么场景
6. Eliminate（消除）：可以去掉什么
7. Reverse（逆向）：反过来会怎样

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['brainstorming', 'creative_ideas', 'product_design'],
  },
  {
    id: 'crispe', name: 'CRISPE', category: 'creative',
    industries: ['科技', '设计', '教育', '全行业'],
    description: 'Context-Role-Intent-Structure-Parameters-Examples 全要素框架',
    template: `用 CRISPE 框架优化以下提示词：
1. Context：背景和上下文信息
2. Role：你希望 AI 扮演的角色
3. Intent：明确的目标和意图
4. Structure：输出结构和格式要求
5. Parameters：约束条件和边界
6. Examples：参考示例

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['complex_tasks', 'analysis', 'writing'],
  },
  {
    id: 'risen', name: 'RISEN', category: 'creative',
    industries: ['科技', '金融', '教育', '全行业'],
    description: 'Role-Instruction-Steps-Endgoal-Narrow 任务分解框架',
    template: `用 RISEN 框架优化以下提示词：
1. Role：定义 AI 的角色和身份
2. Instruction：明确具体的任务指令
3. Steps：分解为可执行的步骤
4. Endgoal：明确最终目标和期望
5. Narrowing：设定约束条件

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['complex_tasks', 'planning', 'analysis'],
  },
  {
    id: 'chain_of_thought', name: 'Chain of Thought', category: 'creative',
    industries: ['科技', '金融', '教育', '全行业'],
    description: '逐步推理链，适合复杂分析任务',
    template: `用 Chain of Thought 框架优化以下提示词：
请通过以下步骤逐步推理：
1. 理解问题：准确理解用户的核心问题
2. 分解要素：列出问题的关键要素
3. 逐步分析：按逻辑顺序逐步分析每个要素
4. 得出结论：基于分析给出结论
5. 验证检查：检查结论的合理性

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['analysis', 'programming', 'complex_tasks'],
  },
  {
    id: 'hmw', name: 'HMW (How Might We)', category: 'creative',
    industries: ['科技', '设计', '教育', '全行业'],
    description: 'How Might We 设计思维框架',
    template: `用 HMW 框架优化以下提示词：
将用户的问题转换为多个 "我们如何..." 的创意提问：
1. 放大正面：我们如何增强...
2. 消除负面：我们如何避免...
3. 探索对立：如果反过来会怎样
4. 改变视角：从不同角度出发
5. 打破假设：挑战现有假设

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['brainstorming', 'creative_ideas', 'product_design'],
  },
  {
    id: 'six_hats', name: 'Six Thinking Hats', category: 'creative',
    industries: ['科技', '金融', '咨询', '教育', '全行业'],
    description: '六顶思考帽多维分析框架',
    template: `用六顶思考帽框架优化以下提示词：
1. 白帽（事实）：客观事实和数据是什么
2. 红帽（情感）：直觉和情感反应
3. 黑帽（风险）：潜在风险和问题
4. 黄帽（乐观）：积极面和机会
5. 绿帽（创新）：创意和新想法
6. 蓝帽（流程）：整体思考流程和总结

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['analysis', 'decision_making', 'brainstorming'],
  },
];

const TECHNICAL: FrameworkFactory[] = [
  {
    id: 'race', name: 'RACE', category: 'technical',
    industries: ['科技', '金融', '教育', '全行业'],
    description: 'Role-Action-Context-Expectation 技术任务框架',
    template: `用 RACE 框架优化以下提示词：
1. Role：明确技术角色和专长领域
2. Action：具体的操作步骤
3. Context：技术背景和约束条件
4. Expectation：期望的产出和标准

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['programming', 'technical_writing', 'data_analysis'],
  },
  {
    id: 'ape', name: 'APE', category: 'technical',
    industries: ['科技', '全行业'],
    description: 'Action-Purpose-Expectation 简洁指令框架',
    template: `用 APE 框架优化以下提示词：
1. Action：定义需要执行的具体操作
2. Purpose：说明操作的目的和意义
3. Expectation：明确期望的结果

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['simple_tasks', 'quick_queries'],
  },
  {
    id: 'tag', name: 'TAG', category: 'technical',
    industries: ['科技', '全行业'],
    description: 'Task-Action-Goal 快速任务框架',
    template: `用 TAG 框架优化以下提示词：
1. Task：明确任务描述
2. Action：需要执行的动作
3. Goal：最终目标

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['simple_tasks', 'quick_queries'],
  },
  {
    id: 'smarty', name: 'SMART', category: 'technical',
    industries: ['科技', '金融', '咨询', '全行业'],
    description: 'Specific-Measurable-Achievable-Relevant-Time-bound 目标设定',
    template: `用 SMART 框架优化以下提示词：
1. Specific：具体的目标是什么
2. Measurable：如何衡量成功
3. Achievable：在现有条件下是否可实现
4. Relevant：是否与大局相关
5. Time-bound：时间节点和截止日期

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['planning', 'goal_setting', 'project_management'],
  },
];

const ANALYSIS: FrameworkFactory[] = [
  {
    id: 'swot', name: 'SWOT', category: 'analysis',
    industries: ['科技', '金融', '教育', '咨询', '全行业'],
    description: 'Strengths-Weaknesses-Opportunities-Threats 战略分析',
    template: `用 SWOT 框架优化以下提示词：
1. Strengths（优势）：内部优势是什么
2. Weaknesses（劣势）：内部劣势是什么
3. Opportunities（机会）：外部机会是什么
4. Threats（威胁）：外部威胁是什么

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['analysis', 'strategy', 'decision_making'],
  },
  {
    id: 'pros_cons', name: 'Pros and Cons', category: 'analysis',
    industries: ['科技', '金融', '咨询', '全行业'],
    description: '优缺点对比决策框架',
    template: `用优缺点对比框架优化以下提示词：
1. 列出所有选项
2. 对每个选项分析优点
3. 对每个选项分析缺点
4. 权衡利弊给出建议

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['analysis', 'decision_making'],
  },
  {
    id: 'rose', name: 'ROSE', category: 'analysis',
    industries: ['科技', '金融', '教育', '全行业'],
    description: 'Reality-Options-Solutions-Evaluation 问题解决框架',
    template: `用 ROSE 框架优化以下提示词：
1. Reality：当前现实情况是什么
2. Options：有哪些可选方案
3. Solutions：推荐哪个方案及原因
4. Evaluation：如何评估方案效果

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['analysis', 'problem_solving', 'decision_making'],
  },
];

const PLANNING: FrameworkFactory[] = [
  {
    id: 'focus', name: 'FOCUS', category: 'planning',
    industries: ['科技', '金融', '咨询', '教育', '全行业'],
    description: 'Focus-Outline-Compose-Understand-Summarize 内容创作框架',
    template: `用 FOCUS 框架优化以下提示词：
1. Focus：确定内容的焦点和主题
2. Outline：列出内容大纲和结构
3. Compose：编写具体内容
4. Understand：确保目标受众能理解
5. Summarize：提供要点总结

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['article', 'report', 'presentation'],
  },
  {
    id: 'orid', name: 'ORID', category: 'planning',
    industries: ['教育', '咨询', '科技', '全行业'],
    description: 'Objective-Reflective-Interpretive-Decisional 引导式对话',
    template: `用 ORID 框架优化以下提示词：
1. Objective（客观）：客观事实和数据
2. Reflective（感受）：主观感受和反应
3. Interpretive（诠释）：意义和影响分析
4. Decisional（决定）：下一步行动和决策

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['interview', 'analysis', 'meeting_notes'],
  },
  {
    id: 'gopa', name: 'GOPA', category: 'planning',
    industries: ['科技', '金融', '咨询', '全行业'],
    description: 'Goal-Obstacles-Plan-Action 目标执行框架',
    template: `用 GOPA 框架优化以下提示词：
1. Goal：明确最终目标
2. Obstacles：识别可能的障碍
3. Plan：制定克服障碍的计划
4. Action：具体的行动步骤

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['planning', 'project_management', 'goal_setting'],
  },
];

const EDUCATION: FrameworkFactory[] = [
  {
    id: 'eli5', name: 'ELI5', category: 'education',
    industries: ['教育', '科技', '全行业'],
    description: 'Explain Like I am Five 通俗解释框架',
    template: `用 ELI5 框架优化以下提示词：
请用最简单通俗的语言解释，就像在给一个 5 岁小朋友讲解：
1. 用生活中的类比和比喻
2. 避免专业术语
3. 从最基础的概念开始
4. 逐步递进到复杂概念

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['explanation', 'tutorial', 'education'],
  },
  {
    id: 'socratic', name: 'Socratic Method', category: 'education',
    industries: ['教育', '科技', '全行业'],
    description: '苏格拉底式提问引导法',
    template: `用苏格拉底式提问法优化以下提示词：
通过一系列递进式提问引导用户思考：
1. 澄清问题：你能具体说说...
2. 挑战假设：你有没有考虑过...
3. 寻找证据：有什么数据支持...
4. 考虑替代：如果换一个角度...
5. 探讨后果：这样做的结果会...
6. 回归原题：所以你认为...

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['education', 'tutoring', 'analysis'],
  },
  {
    id: 'blooms', name: "Bloom's Taxonomy", category: 'education',
    industries: ['教育', '科技', '全行业'],
    description: '布鲁姆认知层次教学框架',
    template: `用布鲁姆认知层次优化以下提示词：
按认知层次递进设计内容：
1. 记忆：基础概念和事实
2. 理解：用自己的话解释
3. 应用：在实际场景中使用
4. 分析：拆解并理解各部分关系
5. 评价：基于标准做出判断
6. 创造：生成新的想法或产品

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['education', 'tutorial', 'course_design'],
  },
];

const GENERAL: FrameworkFactory[] = [
  {
    id: 'spark', name: 'SPARK', category: 'general',
    industries: ['全行业'],
    description: 'Situation-Problem-Aspiration-Result-Knowledge 通用框架',
    template: `用 SPARK 框架优化以下提示词：
1. Situation：当前背景和处境
2. Problem：面临的核心问题
3. Aspiration：期望达成的目标
4. Result：预期的结果
5. Knowledge：需要运用哪些知识

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['general', 'copywriting', 'analysis'],
  },
  {
    id: 'trace', name: 'TRACE', category: 'general',
    industries: ['全行业'],
    description: 'Task-Requirements-Audience-Constraint-Example 通用指令框架',
    template: `用 TRACE 框架优化以下提示词：
1. Task：明确的写作/创作任务
2. Requirements：具体要求和标准
3. Audience：目标受众特征
4. Constraint：约束条件和限制
5. Example：参考风格或示例

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['writing', 'copywriting', 'general'],
  },
  {
    id: 'era', name: 'ERA', category: 'general',
    industries: ['全行业'],
    description: 'Expectation-Role-Action 极简三要素',
    template: `用 ERA 框架优化以下提示词：
1. Expectation：期望的结果是什么
2. Role：AI 应扮演什么角色
3. Action：需要执行什么操作

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['simple_tasks', 'quick_queries'],
  },
  {
    id: 'rtf', name: 'RTF', category: 'general',
    industries: ['全行业'],
    description: 'Role-Task-Format 简洁角色任务框架',
    template: `用 RTF 框架优化以下提示词：
1. Role：你是一位...
2. Task：请完成以下任务...
3. Format：输出格式为...

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['simple_tasks', 'copywriting'],
  },
  {
    id: 'care', name: 'CARE', category: 'general',
    industries: ['全行业'],
    description: 'Context-Action-Result-Example 上下文行动框架',
    template: `用 CARE 框架优化以下提示词：
1. Context：提供必要的背景和上下文
2. Action：需要执行的具体行动
3. Result：期望的结果
4. Example：参考示例

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['general', 'writing'],
  },
  {
    id: 'atomic', name: 'Atomic Prompting', category: 'general',
    industries: ['设计', '科技', '全行业'],
    description: '原子提示法，适合图像生成类任务',
    template: `用原子提示法优化以下提示词：
将需求拆解为最小的可描述单元：
1. 主体：核心对象是什么
2. 风格：视觉风格和艺术流派
3. 构图：画面组成和布局
4. 色彩：色彩方案和色调
5. 光影：光线方向和强度
6. 细节：材质、纹理、细节
7. 情感：传递的情绪和氛围

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['image_generation', 'design'],
  },
  {
    id: 'blog', name: 'BLOG', category: 'general',
    industries: ['美妆', '科技', '教育', '全行业'],
    description: 'Brief-Lead-Outline-Grow 博文写作框架',
    template: `用 BLOG 框架优化以下提示词：
1. Brief：写作简报和目标
2. Lead：开篇引导和钩子
3. Outline：内容大纲和结构
4. Grow：展开每个要点

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['article', 'blog', 'long_form'],
  },
  {
    id: '4s', name: '4S Method', category: 'general',
    industries: ['全行业'],
    description: 'Short-Simple-Strong-Sincere 文案四原则',
    template: `用 4S 框架优化以下提示词：
1. Short（简短）：用最精炼的语言表达
2. Simple（简单）：避免复杂句式和专业术语
3. Strong（有力）：用强动词和具体描述
4. Sincere（真诚）：保持真实和亲近感

原始提示词：{prompt}
输出优化后的完整提示词。`,
    applicableTasks: ['copywriting', 'social_media', 'ad_copy'],
  },
];

const ALL_FRAMEWORKS_DATA: FrameworkFactory[] = [
  ...MARKETING, ...CREATIVE, ...TECHNICAL,
  ...ANALYSIS, ...PLANNING, ...EDUCATION, ...GENERAL,
];

export const ALL_FRAMEWORKS: PromptFramework[] = ALL_FRAMEWORKS_DATA.map((f) => ({
  ...f,
  weight: 0.5,
}));

// 按行业索引
function buildIndustryIndex(): Record<string, PromptFramework[]> {
  const index: Record<string, PromptFramework[]> = {};
  for (const fw of ALL_FRAMEWORKS) {
    for (const industry of fw.industries) {
      if (!index[industry]) index[industry] = [];
      index[industry].push(fw);
    }
  }
  return index;
}

export const FRAMEWORKS_BY_INDUSTRY = buildIndustryIndex();

// 按任务类型索引
function buildTaskIndex(): Record<string, PromptFramework[]> {
  const index: Record<string, PromptFramework[]> = {};
  for (const fw of ALL_FRAMEWORKS) {
    for (const task of fw.applicableTasks) {
      if (!index[task]) index[task] = [];
      index[task].push(fw);
    }
  }
  return index;
}

export const FRAMEWORKS_BY_TASK = buildTaskIndex();
