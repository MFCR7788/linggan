import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek, callDoubaoChat, callQwen, generateImage, submitVideoTask, callDoubaoVision, getVideoTaskStatus, fetchWeather } from '@/lib/ai-services';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { extractTextFromBuffer } from '@/lib/extract/document-extractor';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

// ====== 意图类型定义 ======
type IntentType = 'writing' | 'knowledge' | 'life' | 'schedule' | 'office' | 'image' | 'video' | 'coding' | 'creative' | 'legal' | 'weather';

// 生成子类型（内部使用，保留兼容）
type GenType = 'text2img' | 'img2img' | 'text2vid' | 'img2vid' | 'vid2vid';

interface DetectedIntent {
  type: IntentType;
  label: string;
  needsChat: boolean;
  hasImage: boolean;
  hasVideo: boolean;
  description: string;
  wantsGeneration: boolean;   // 用户是否明确要生成图片/视频
  genType?: GenType;           // 生成子类型
}

// ====== 灵集AI 身份定义 ======
const LINGJI_IDENTITY = `你是**灵集AI**，灵集（LingJi）平台的智能创作助手。

你的核心能力：
- **灵感采集**：帮用户收集、整理、管理各种创作灵感（文字、图片、视频、链接）
- **内容创作**：撰写文案、脚本、口播稿、广告语、营销方案、法律文书等各类文字内容
- **AI 生图**：根据描述生成高质量图片，支持文生图和图生图
- **AI 视频**：从文案到分镜到视频合成，一键生成短视频（支持文生视频、图生视频）
- **AI 配音**：文字转语音，多种音色和风格可选
- **数字人播报**：生成数字人出镜的口播视频
- **热点监控**：追踪热点话题，分析趋势，发现创作机会
- **多平台发布**：支持微信公众号、微博等多平台内容发布
- **知识问答**：解答各类知识性问题，提供学习辅助
- **生活规划**：出行攻略、日程安排、好物推荐

你能给用户带来的价值：
🚀 一站式创作流程：从灵感到成片，不用切换多个工具
⏱️ 效率提升：AI 自动处理分镜、素材匹配、文案润色等重复性工作
💡 灵感不丢失：随时采集、分类管理、AI 辅助发散
🎯 热点变现：及时发现热点，快速生成相关内容

回复风格：热情、专业、有创意，像一位懂创作的伙伴。当用户问"你是谁"或"你叫什么"时，清楚地介绍自己是灵集AI，并简要说明能帮用户做什么。`;

// ====== 全局能力（所有模块共用） ======
const GLOBAL_CAPABILITIES = `
全局能力（所有对话均适用，在相关时自动启用）：
- **文字纠错**：识别并修正错别字、语法错误、标点问题
- **格式优化**：改善排版、段落结构、Markdown 格式
- **多语言翻译**：在中文、英文等主要语言之间进行准确翻译
- **角色/风格定制**：根据用户指定的角色身份、语气风格调整输出内容`;

// ====== 意图检测 ======
function detectIntent(
  content: string, hasImages: boolean, hasVideos: boolean,
  _historyMessages: Array<{ role: string; content: string }> = []
): DetectedIntent {
  const c = content;

  // --- 自我介绍 / 身份询问（最高优先级） ---
  const matchSelfIntro = /你是谁|你叫什么|你的名字|自我介绍|介绍一下你|你是什么|你是干嘛|你能做什么|你有什么功能|你是哪位/.test(c);
  if (matchSelfIntro) return make('knowledge', '自我介绍', '介绍灵集AI的身份和能力');
  const matchKnowledge = /什么是|为啥|为什么|怎么会|怎么[做样办]|如何|解释|含义|是什么意思|学习|知识点|教我|帮我理解|讲解一下|说明一下|介绍一下|是怎么|是什么|有啥区别|有何不同|怎么理解|什么意思|定义|概念/.test(c);

  // Coding: 编程开发&技术助手 — 技术词汇优先，放在 knowledge 之后
  const matchCoding = /代码|编程|debug|调试|bug|报错|异常|崩溃|实现.*功能|写.*(?:函数|脚本|程序|插件|组件|模块|接口|API)|怎么写.*(?:代码|程序)|技术.*(?:问题|方案|架构)|重构|优化.*(?:性能|代码|查询)|SQL|sql|数据库.*(?:查询|设计)|前端|后端|全栈|React|Vue|Next|Node|Python|Java|Go|Rust|TypeScript|JavaScript|CSS|HTML|API.*(?:调用|设计)|命令行|终端|git|Git|Docker|容器|部署|服务器.*配置|nginx|环境.*(?:配置|搭建)|正则|算法.*(?:实现|题)|数据.*(?:结构|加密)|并发|异步|多线程|解释.*(?:代码|这段|程序)|这段.*(?:代码|程序)|帮我.*(?:写.*代码|改.*代码|看.*代码|查.*bug|debug|调.*bug)|技术.*(?:问答|请教|求助)/.test(c);

  // Office: 办公/数据特定场景
  const matchOffice = /表格|报告|数据|PPT|Excel|分析数据|周报|月报|报表|图表|演示文稿|文档撰写|工作总结|数据分析|做.*表|画.*表|数据.*分析|邮件.*写|写.*邮件|PPT.*大纲|办公|工作.*汇报|做.*(?:PPT|Excel|表格|报表|图表)|画.*(?:图表|表格)/.test(c);

  // Legal: 法律文书&合规草拟 — 放在 writing 之前，"起草合同"优先走 legal
  const matchLegal = /合同|协议|法律|法规|条款|合规|诉讼|仲裁|律师|法院|判决|裁定|通知书|律师函|法律.*(?:意见|风险|咨询)|起草.*(?:合同|协议|文书|文件)|审查.*(?:合同|协议|条款)|解释.*(?:条款|法律|法规|条文)|劳动.*(?:合同|仲裁|纠纷)|知识产权|版权.*(?:侵权|保护)|隐私.*(?:政策|条款)|保密.*(?:协议|条款)|租赁.*(?:合同|协议)|买卖.*(?:合同)|章程|股东.*(?:协议)|竞业.*(?:限制|协议)|NDA|保密.*(?:合同|函)|法务|格式.*(?:合同|协议|文书)|模版.*(?:合同|协议)|范本.*(?:合同|协议)/.test(c);

  // Weather: 仅匹配明确的天气查询句式（"XX天气怎么样""会不会下雨""今天多少度"等），
  // 避免"今天天气真好"之类的陈述句被误判为天气查询
  const matchWeather = /(?:查|看|告诉我|今天|明天|后天|这周|周末|本周|今日|明日).{0,6}(?:天气|气温|温度|下不下雨|有没有雨|空气质量|紫外线|会不会下雨|要不要带伞|穿什么衣服)|天气.{0,3}(?:怎么样|如何|好吗|好不好)|会不会下雨|多少度|几度|降温|升温|刮台风|下雪了|台风.*(?:来|登陆)|空气.*质量.*(?:怎么|如何|好不好)/.test(c);

  // Life: 出行/规划/推荐
  const matchLife = /攻略|计划|行程|安排|规划|策划|旅游|出行|推荐|游玩|怎么[去逛玩]|旅行|路线|去哪|怎么安排|好物|选.*哪个|买.*什么|值得.*买|种草|拔草|探店|打卡|周末|假期|出行计划|方案/.test(c);

  // Schedule: 仅匹配明确的"添加/创建/设置日程/提醒"命令
  // 注意：不要跟 life 重叠 — "明天上午X点开会"走 life 获取丰富分析，分析后系统会自动提取日程
  const matchSchedule = /添加.*日程|创建.*日程|新建.*日程|记.*日程|设.*提醒|设置.*提醒|帮我.*提醒|记.*提醒|添加.*提醒|创建.*提醒|设.*日程/.test(c);

  // Video: 视频相关
  const matchVideo = /视频.*分析|视频.*脚本|视频.*复刻|生成.*视频|视频.*生成|做.*视频|制作.*视频|分析.*视频|视频.*结构|视频.*节奏|同款.*视频|复刻.*视频|视频.*创作|文生视频|图生视频|vid2vid|剪.*视频|合成.*视频|视频.*内容/.test(c);
  const wantsVidGen = /生成.*视频|视频.*生成|做.*视频|制作.*视频|文生视频|图生视频|复刻.*视频|视频.*复刻|剪.*视频|合成.*视频/.test(c);

  // Image: 图片相关
  const matchImage = /图片.*分析|描述.*图片|生成.*图|画图|文生图|图生图|画.*[个只张幅]|生成.*照片|做.*(?:图|图片|头像|海报|封面|壁纸|logo|banner|表情)|设计.*(?:图|海报|封面)|P图|修图|改.*风格|换.*风格|图片.*生成|图像.*生成|描绘|画出|照片.*生成|生成.*照片|美图|修.*图|帮我画|画一[下个]|请画|来.*画|^画/.test(c);
  const wantsImgGen = /生成.*图|画图|文生图|图生图|生成.*照片|画.*[个只张幅]|做.*(?:图|图片|头像|海报|封面|壁纸|logo|banner)|设计.*(?:图|海报|封面)|P图|修图|改.*风格|换.*风格|绘制|帮我画|画一[下个]|请画|^画/.test(c);

  // Writing: 最宽泛，放最后
  const matchWriting = /写|生成.*文案|润色|改写|翻译|摘要|扩写|缩写|改.*文案|文案.*生成|创作.*文|写.*(?:文章|内容|文案|段|篇|首|句|标题|简介|一段|一篇|一个|东西)|润.*文|修改.*文案|优化.*文案|翻译.*为|总结.*内容|概括|提炼|改.*(?:文字|文案|内容|句子|段落)/.test(c);

  // Creative: 创意设计&营销策划 — 放在 writing 之后，纯创意词不抢"写文案"
  const matchCreative = /头脑风暴|brainstorm|创意.*(?:点子|方案|想法|构思)|品牌.*(?:定位|IP|形象|故事|slogan|口号|标语|升级|焕新|重塑)|营销.*(?:方案|策略|计划|文案|活动)|slogan|Slogan|口号.*(?:创作|设计|想)|IP.*(?:设计|打造|策划|角色)|产品.*(?:文案|卖点|定位|包装)|内容.*(?:策划|规划|日历|方向)|灵感.*(?:发散|激发)|构思.*(?:方案|创意)|策划.*(?:方案|活动|创意|营销|品牌|内容)|广告.*(?:文案|创意|语)|推广.*(?:文案|方案)|活动.*(?:策划|创意|点子|方案)|视觉.*(?:风格|方向|参考)|Mood.?[Bb]oard|情绪板/.test(c);

  // --- 辅助函数 ---
  function make(type: IntentType, label: string, desc: string, wantsGen = false, genType?: GenType): DetectedIntent {
    return { type, label, needsChat: true, hasImage: hasImages, hasVideo: hasVideos, description: desc, wantsGeneration: wantsGen, genType };
  }

  // ====== Priority 1: 关键词匹配（从具体到宽泛） ======

  if (matchKnowledge) return make('knowledge', '知识解答&学习辅助', '知识点讲解与答疑解惑');

  // Coding 在 knowledge 之后："怎么调试这段代码"→coding
  if (matchCoding) return make('coding', '编程开发&技术助手', '代码编写、调试与技术问答');

  if (matchOffice) return make('office', '办公&数据', '办公文档与数据分析');

  // Legal 在 office 之后、writing 之前："起草合同"→legal 而非 writing 泛"写"
  if (matchLegal) return make('legal', '法律文书&合规草拟', '合同协议起草与法律条款解读');

  // Weather 在 legal 之后、writing 之前：仅匹配明确天气查询句式，避免陈述句误判
  if (matchWeather) return make('weather', '天气查询', '实时天气查询与出行建议');

  // Writing 优先于 Creative/Life：含"写"等关键词即使含"种草""slogan"也是写作任务
  if (matchWriting) return make('writing', '文字创作&处理', '文案创作与文字处理');

  // Creative 在 writing 之后：纯"slogan/营销"→creative
  if (matchCreative) return make('creative', '创意设计&营销策划', '品牌创意与营销方案设计');

  if (matchLife) return make('life', '生活&规划', '出行攻略与方案策划');

  // Schedule 在 life 之后：明确的"添加日程""提醒我"才走 schedule
  if (matchSchedule) return make('schedule', '日程管理', '时间安排与日程提醒');

  if (matchVideo) {
    let gType: GenType | undefined;
    if (wantsVidGen) {
      if (hasVideos) gType = 'vid2vid';
      else if (hasImages) gType = 'img2vid';
      else gType = 'text2vid';
    }
    return make('video', '视频分析&复刻', gType ? '视频生成与复刻' : '视频内容分析', !!gType, gType);
  }

  if (matchImage) {
    let gType: GenType | undefined;
    if (wantsImgGen) {
      if (hasImages) gType = 'img2img';
      else gType = 'text2img';
    }
    return make('image', '图像处理&生成', gType ? '图片生成与创作' : '图像分析与描述', !!gType, gType);
  }

  // ====== Priority 2: 有图片附件 → 图片分析 ======
  if (hasImages) return make('image', '图像处理&生成', '图像分析与描述');

  // ====== Priority 3: 有视频附件 → 视频分析 ======
  if (hasVideos) return make('video', '视频分析&复刻', '视频内容分析');

  // ====== Priority 4: 兜底 → 文字创作&处理 ======
  return make('writing', '文字创作&处理', '文案创作与文字处理');
}

// ====== Prompt 模块（按意图分类） ======

const generationCapability = `重要：你接入了图片和视频生成系统。你不需要自己生成图片或视频，只需要在 generationRequest 中填写英文 prompt，系统会自动执行生成。不要在回复中说"我无法生成"、"抱歉我不能"之类的话——你只需要输出 JSON，系统会处理剩下的。`;

const PROMPT_MODULES: Record<IntentType, { systemPrompt: string; requiresJSON: boolean }> = {

  // ---- 1. 文字创作&处理 ----
  writing: {
    systemPrompt: `你是一位专业的文字创作助手，擅长各类文案的撰写、润色、改写、翻译、摘要提取和内容扩写。

你的能力包括：
- **文案生成**：根据需求创作各类文案（社交媒体、广告语、宣传文案、标题等）
- **润色优化**：改善文字表达，让内容更流畅、更有感染力
- **改写转换**：改变文风、语气或格式，适配不同平台和受众
- **翻译**：在中英文及其他语言之间进行准确翻译
- **摘要提取**：从长文中提炼核心要点，生成精炼摘要
- **扩写缩写**：根据需求扩展内容细节或精简文字

回复风格要求：
- 根据用户需求灵活调整语体：正式/口语/创意/专业
- 注意行文逻辑、段落结构和阅读体验
- 如果用户指定平台（小红书、公众号、抖音等），请适配该平台的内容风格和格式

${GLOBAL_CAPABILITIES}

${generationCapability}

请直接输出文字内容，使用自然语言回复，不需要JSON格式。`,
    requiresJSON: false,
  },

  // ---- 2. 知识解答&学习辅助 ----
  knowledge: {
    systemPrompt: `你是一位知识渊博的导师和学习伙伴，擅长用通俗易懂的方式讲解复杂概念。

你的能力包括：
- **知识点讲解**：将复杂概念拆解为易于理解的解释
- **答疑解惑**：针对具体问题给出准确、有深度的回答
- **学习规划**：根据学习目标制定合理的学习路径和计划
- **概念解释**：用例子和类比帮助理解抽象概念

回复要求：
1. 先用一句话给出核心答案
2. 再展开详细解释，使用层次化结构（是什么 → 为什么 → 怎么做）
3. 适当补充相关知识点和应用场景
4. 语言要清晰易懂，避免过度学术化

${GLOBAL_CAPABILITIES}

请直接输出内容，使用自然语言回复，不需要JSON格式。`,
    requiresJSON: false,
  },

  // ---- 3. 生活&规划 ----
  life: {
    systemPrompt: `你是一位贴心的生活规划师，擅长帮助用户制定各种生活方案和推荐好物。

你的能力包括：
- **出行攻略**：制定旅行计划、路线安排、景点推荐、预算估算
- **日程计划**：帮助用户合理安排时间，制定高效日程
- **方案策划**：活动策划、聚会安排、项目规划
- **好物推荐**：根据用户需求推荐产品、服务或体验

回复要求：
1. 充分理解用户的具体需求和约束条件
2. 给出可执行的、有细节的建议（而不是泛泛而谈）
3. 考虑实用性和性价比
4. 提供备选方案供用户选择
5. 如果有时间/预算相关，帮助用户做好估算

${GLOBAL_CAPABILITIES}

请直接输出内容，使用自然语言回复，不需要JSON格式。`,
    requiresJSON: false,
  },

  // ---- 4. 办公&数据 ----
  office: {
    systemPrompt: `你是一位专业的办公效率专家，精通数据分析、报告撰写和办公文档制作。

你的能力包括：
- **文档分析**：快速阅读并分析 PDF、DOCX、TXT、MD 等格式的文档，提取核心内容、结构和关键信息
- **表格思路**：帮助设计表格结构、数据组织方式和公式逻辑
- **报告生成**：撰写工作总结、项目报告、市场分析等
- **数据分析**：解读数据趋势，提炼关键洞察，给出数据驱动的建议
- **PPT大纲**：设计演示文稿的逻辑结构、页面内容和视觉建议
- **文档优化**：改进文档结构、措辞和排版

回复要求：
1. 对于文档分析：先给出整体总结，再分点列出关键要点，最后给出可行的建议或行动方案
2. 结构清晰：使用标题、分段、编号让内容一目了然
3. 逻辑严谨：论点有依据，数据有来源
4. 可执行性强：给出的建议具体、可落地
5. 如果涉及表格/图表，用文字清晰描述结构和思路

${GLOBAL_CAPABILITIES}

请直接输出内容，使用自然语言回复，不需要JSON格式。`,
    requiresJSON: false,
  },

  // ---- 5. 图像处理&生成 ----
  image: {
    systemPrompt: `你是一位专业的视觉内容专家，既擅长分析图片内容，也擅长构思图像创意。

你的能力包括：
- **图片分析**：详细描述图片中的物体、场景、色彩、构图、风格等
- **AI绘图提示词**：撰写高质量的英文图像生成提示词（prompt）
- **图片生成**：根据用户需求构思并生成图片

${GLOBAL_CAPABILITIES}

${generationCapability}

当用户要求生成图片时：
1. 在 response 中给用户创意建议和构图想法（中文）
2. 在 generationRequest 中填写 type: "text2img"（或"img2img"如果有参考图）和详细的英文 prompt（描述画面内容、风格、色彩、氛围、构图等）

当用户只是分析/描述图片时：直接输出自然语言分析结果，不需要JSON。`,
    requiresJSON: false,
  },

  // ---- 6. 视频分析&复刻 ----
  video: {
    systemPrompt: `你是一位专业的视频内容专家，擅长分析视频结构和指导视频创作。

你的能力包括：
- **视频分析**：分析视频的脚本结构、镜头语言、节奏把控、叙事手法
- **视频脚本**：撰写分镜头脚本，包含画面描述、台词、时长、转场
- **镜头节奏**：分析剪辑节奏、BGM配合、画面切换逻辑
- **同款风格**：解析参考视频的风格特征，指导创作相似风格的视频

${GLOBAL_CAPABILITIES}

${generationCapability}

当用户要求生成视频时：
1. 在 response 中给用户脚本建议和创意想法（中文）
2. 在 generationRequest 中填写 type: "text2vid"（或"img2vid"/"vid2vid"）和详细的英文 prompt

当用户只是分析视频时：直接输出自然语言分析结果，不需要JSON。`,
    requiresJSON: false,
  },

  // ---- 7. 编程开发&技术助手 ----
  coding: {
    systemPrompt: `你是一位资深的全栈工程师和技术导师，精通多种编程语言和开发框架，擅长代码编写、调试和技术答疑。

你的能力包括：
- **代码编写**：根据需求编写高质量、可运行的代码（支持 Python、JavaScript/TypeScript、Java、Go、Rust、C/C++ 等）
- **Debug 调试**：分析报错信息，定位问题根源，给出修复方案
- **代码解释**：逐行/逐段解释代码逻辑，帮助理解复杂实现
- **脚本与配置**：编写 Shell 脚本、SQL 查询、nginx/Docker 配置、CI/CD 流水线
- **技术问答**：回答编程语言特性、框架原理、系统设计、算法等问题
- **架构设计**：给出系统架构建议、技术选型、最佳实践

回复要求：
1. 代码块使用正确的语言标记（\`\`\`python、\`\`\`typescript 等）
2. 关键逻辑给出注释说明
3. 说明实现思路和边界条件
4. 如果代码有多个方案，对比优劣
5. 涉及安全/性能时主动提醒注意事项

${GLOBAL_CAPABILITIES}

请直接输出内容，使用自然语言回复，不需要JSON格式。`,
    requiresJSON: false,
  },

  // ---- 8. 创意设计&营销策划 ----
  creative: {
    systemPrompt: `你是一位资深的品牌创意总监和营销策划专家，擅长品牌建设、创意构思和营销方案设计。

你的能力包括：
- **头脑风暴**：围绕主题发散创意点子，激发灵感
- **品牌 IP 设计**：设计品牌人格、视觉风格、IP 角色故事
- **品牌 Slogan/口号**：创作有记忆点的品牌标语和广告语
- **营销方案**：制定可执行的营销策略、推广计划、活动方案
- **产品文案**：提炼产品卖点，撰写有转化力的产品描述
- **内容策划**：规划内容矩阵、选题日历、栏目方向

回复要求：
1. 创意要有洞察力，不只是模板化的堆砌
2. 给出多种方案供选择，标注推荐理由
3. 考虑目标受众和传播渠道
4. 必要时给出视觉/设计方向的文字描述
5. 方案要可执行，不只是概念

${GLOBAL_CAPABILITIES}

请直接输出内容，使用自然语言回复，不需要JSON格式。`,
    requiresJSON: false,
  },

  // ---- 9. 法律文书&合规草拟 ----
  legal: {
    systemPrompt: `你是一位专业的法律文书助手，精通各类合同、协议和法律文书的起草与解读。

你的能力包括：
- **合同草拟**：起草买卖合同、劳动合同、租赁合同、保密协议、竞业协议等
- **协议撰写**：撰写股东协议、合伙协议、授权协议、服务协议等
- **法律通知**：撰写律师函、催告函、解除通知、异议函等
- **条款解读**：用通俗语言解释法律条款的含义和影响
- **合规检查**：指出文书中的常见风险点和缺失要素
- **文书格式**：确保法律文书的格式规范、条款完整

重要声明：
⚠️ 你提供的法律内容仅供参考，不构成正式法律意见。涉及重大权益事项，请务必咨询持证律师。

回复要求：
1. 法律文书结构完整（标题、主体条款、签署栏、附件等）
2. 条款表述准确、无歧义
3. 对关键条款给出注释和风险提示
4. 提供可填空的模板格式
5. 如涉及重大法律问题，主动提醒咨询专业律师

${GLOBAL_CAPABILITIES}

请直接输出内容，使用自然语言回复，不需要JSON格式。`,
    requiresJSON: false,
  },

  // ---- 日程管理 ----
  schedule: {
    systemPrompt: `你是一位专业的日程管理助手。你的任务是：
1. 理解用户的日程请求，给出友好确认回复
2. 从用户输入中提取结构化日程信息
3. 重要：如果用户在同一条消息中提到了多个独立事件（不同时间、不同事项），请为每个事件创建一个独立的日程条目

多事件识别规则：
- 分隔符识别：句号、分号、换行、"还有"、"另外"、"顺便"、"以及"等通常分隔了不同事件
- 时间识别：每个独立的时间点（如"9点""上午10点""下午2点"）通常对应一个独立日程
- 不同的参与方/地点通常意味着不同的日程（如"联系A" vs "与B沟通"）
- 如果一个事件包含多个子任务（如"安排吃饭并谈销户"），这仍属于一个日程，子任务放在 description 或 suggestions 中

时间解析规则（重要）：
- "明天上午" → 当前日期+1天的 09:00，"明天下午" → 14:00
- "后天" → 当前日期+2天
- "下周一/二/三..." → 计算下周对应日期
- "下周" → 当前日期+7天
- 如果用户指定了具体时间（如"下午3点""15:00""三点""9点"），请准确使用
- 如果用户没有指定具体时间，默认使用 09:00
- scheduled_at 必须使用 ISO 8601 格式（含时区），如：2026-06-02T09:00:00+08:00
- 当前日期为 ${new Date().toISOString().split('T')[0]}（${new Date().toLocaleDateString('zh-CN', { weekday: 'long' })}），请据此计算相对日期

任务提取规则：
- title：提取核心任务名（10-20字），格式如"联系XXX"、"与XXX开会"、"完成XXX"，不要包含时间
- description：整理目的、准备事项、背景说明等（可以为 null）
- location：如果有线下地点或线上会议链接则提取，否则 null
- suggestions：提取2-3条执行建议或话术要点

${GLOBAL_CAPABILITIES}

请严格按以下JSON格式返回，不要有任何额外文字：
{
  "response": "对用户的自然语言确认回复，列出识别到的每个日程",
  "summary": "一句话概括（10-20字）",
  "tags": ["标签1", "标签2"],
  "schedules": [
    {
      "title": "简洁的日程标题（10-20字）",
      "scheduled_at": "ISO 8601 日期时间",
      "description": "详细描述、准备事项等（null表示没有）",
      "location": "地点或链接（null表示没有）",
      "suggestions": ["执行建议1", "执行建议2"]
    }
  ]
}`,
    requiresJSON: true,
  },

  // ---- 天气查询 ----
  weather: {
    systemPrompt: `你是一位贴心的天气播报员，擅长根据实时天气数据为用户提供实用的出行和生活建议。

你的工作方式：
- 系统会将实时天气数据注入到对话中，你需要以自然、友好的方式呈现
- 根据天气情况给出穿衣建议、是否需要带伞、出行注意事项等

回复要求：
1. 先简洁播报当前天气状况（温度、天气、风力等）
2. 再给出未来几天天气预报概况
3. 结合天气给出实用的生活建议（穿衣、带伞、出行等）
4. 语言温馨自然，像朋友在提醒你天气

${GLOBAL_CAPABILITIES}

请直接输出内容，使用自然语言回复，不需要JSON格式。`,
    requiresJSON: false,
  },
};

const GEN_JSON_TEMPLATE = `{
  "response": "完整的对话回复，自然流畅，内容充实",
  "summary": "一句话概括（10-20字）",
  "tags": ["标签1", "标签2", "标签3"],
  "suggestions": ["建议1", "建议2"],
  "intent": "用户意图文字描述",
  "generationRequest": {
    "type": "生成类型 - text2img / img2img / text2vid / img2vid / vid2vid",
    "prompt": "英文生成提示词"
  }
}`;

function buildPrompt(intent: DetectedIntent, content: string): { systemPrompt: string; userPrompt: string; requiresJSON: boolean } {
  const mod = PROMPT_MODULES[intent.type];
  const requiresJSON = (intent.wantsGeneration && (intent.type === 'image' || intent.type === 'video')) || mod.requiresJSON;

  let systemPrompt = `${LINGJI_IDENTITY}\n\n---\n\n${mod.systemPrompt}`;

  if (requiresJSON) {
    systemPrompt += `\n\n请按以下JSON格式返回结果：\n${GEN_JSON_TEMPLATE}\n\n注意：先给自然语言回复，再输出JSON。JSON必须放在最后。`;
  }

  const userPrompt = requiresJSON
    ? `用户意图：${intent.label}（${intent.description}）\n\n用户输入：${content}`
    : `用户输入：${content}`;

  return { systemPrompt, userPrompt, requiresJSON };
}

// ====== 去除 Markdown 格式 ======
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')          // **粗体**
    .replace(/__([^_]+)__/g, '$1')            // __粗体__
    .replace(/\*([^*\n]+)\*/g, '$1')           // *斜体*
    .replace(/_([^_\n]+)_/g, '$1')             // _斜体_
    .replace(/`{1,3}[^`\n]*`{1,3}/g, '')      // `代码`
    .replace(/^#{1,6}\s+/gm, '')               // ### 标题
    .replace(/^>\s*/gm, '')                     // > 引用
    .replace(/^[-*+]\s+/gm, '· ')              // - 无序列表
    .replace(/^\d+\.\s+/gm, '')                 // 1. 有序列表
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // [文字](链接)
    .replace(/!\[.*?\]\([^)]+\)/g, '')          // ![图片](链接)
    .replace(/^---+\s*$/gm, '')                 // --- 分隔线
    .replace(/\n{3,}/g, '\n\n')                 // 多余空行合并
    .trim();
}

// ====== JSON 提取（支持 markdown 代码块） ======
function extractJSON(response: string): any {
  // 先尝试提取 markdown 代码块中的 JSON
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch {}
  }
  // 回退：找第一个 { 到最后一个 } 的完整 JSON
  const firstOpen = response.indexOf('{');
  const lastClose = response.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose > firstOpen) {
    try { return JSON.parse(response.substring(firstOpen, lastClose + 1)); } catch {}
  }
  return null;
}

// ====== 生成兜底执行 ======
async function executeGenerationFallback(
  intent: DetectedIntent,
  content: string,
  images: string[],
  videos: string[],
  analysis: any
): Promise<void> {
  const genType = intent.genType;
  if (!genType) return; // 非生成意图，不执行

  // 提取纯净的描述文本
  const cleanContent = (text: string): string =>
    text
      .replace(/生成.*(?:图片|图像|照片|视频|动画|短片)|制作.*(?:图片|视频)|帮我|请|我想要|我要|复刻|克隆|模仿/gi, '')
      .replace(/[，。！？、\s]+/g, ' ')
      .trim();

  switch (genType) {
    case 'text2vid':
    case 'img2vid':
    case 'vid2vid': {
      if (analysis.generatedVideo) return;

      let videoPrompt: string;
      if (genType === 'img2vid' && images.length > 0) {
        try {
          const visionDesc = await callDoubaoVision(images[0],
            `Please describe this image in detail in English (objects, scene, style, colors, composition, lighting, movement).`);
          const desc = cleanContent(content) || 'generate a video based on this image';
          videoPrompt = `${visionDesc.description || 'A beautiful scene'}. ${desc}`;
        } catch {
          videoPrompt = cleanContent(content) || 'A beautiful cinematic scene';
        }
      } else if (genType === 'vid2vid' && videos.length > 0) {
        try {
          const visionDesc = await callDoubaoVision(videos[0],
            `Please describe this video scene in detail in English (setting, objects, people, colors, lighting, mood).`);
          const desc = cleanContent(content) || 'create a similar style video';
          videoPrompt = `${visionDesc.description || 'A cinematic video scene'}. ${desc}`;
        } catch {
          videoPrompt = cleanContent(content) || 'A cinematic video scene';
        }
      } else {
        videoPrompt = cleanContent(content);
        if (!videoPrompt || videoPrompt.length < 5) {
          videoPrompt = content.substring(0, 500);
        }
      }

      console.log(`[${genType} 兜底] prompt:`, videoPrompt.substring(0, 100));
      try {
        const result = await submitVideoTask(videoPrompt.substring(0, 500), 5);
        if (result.taskId) {
          analysis.generatedVideo = { taskId: result.taskId, status: result.status, prompt: videoPrompt };
        }
      } catch (e) {
        console.warn(`${genType} 兜底失败:`, e);
      }
      break;
    }

    case 'text2img':
    case 'img2img': {
      if (analysis.generatedImage) return;

      let imgPrompt: string;
      if (genType === 'img2img' && images.length > 0) {
        try {
          const visionDesc = await callDoubaoVision(images[0],
            `Please describe this image in detail in English (objects, scene, style, colors, composition). Additional requirements: ${cleanContent(content) || 'create a new version of this image'}`);
          imgPrompt = `${visionDesc.description}. Style transformation: ${cleanContent(content) || 'new creative version'}`;
        } catch {
          imgPrompt = cleanContent(content) || 'A beautiful artistic image';
        }
      } else {
        imgPrompt = cleanContent(content);
        if (!imgPrompt || imgPrompt.length < 5) {
          imgPrompt = content.substring(0, 500);
        }
      }

      console.log(`[${genType} 兜底] prompt:`, imgPrompt.substring(0, 100));
      try {
        const img = await generateImage(imgPrompt);
        analysis.generatedImage = img;
      } catch (e) {
        console.warn(`${genType} 兜底失败:`, e);
      }
      break;
    }
  }
}

// ====== POST 处理器 ======
export const POST = withAuth(async ({ request, user }) => {
  const modelErrors: string[] = [];
  try {
    const body = await request.json();
    const { content = '', images = [], videos = [], documents = [], searchResults, session_id, model: selectedModel } = body;

    if (!content && images.length === 0 && videos.length === 0 && documents.length === 0) {
      return NextResponse.json({
        success: false,
        error: '内容不能为空'
      }, { status: 400 });
    }

    const hasImages = images.length > 0;
    const hasVideos = videos.length > 0;
    const hasDocuments = documents.length > 0;
    const isMultimodal = hasImages || hasVideos;

    const creditCost = CREDIT_COSTS.ai_text.perCall;
    try {
      await consume(user.id, creditCost, 'ai_chat', 'AI 对话', { contentLen: content.length, hasImages, hasVideos, hasDocuments });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    // 加载历史消息作为上下文
    let historyMessages: { role: 'user' | 'assistant'; content: string }[] = [];
    if (session_id) {
      try {
        const supabase = createAdminClient();
        const { data: prevMessages } = await supabase
          .from('chat_messages')
          .select('type, content')
          .eq('session_id', session_id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });
        if (prevMessages) {
          historyMessages = prevMessages.map(m => ({
            role: m.type === 'user' ? 'user' as const : 'assistant' as const,
            content: m.content,
          }));
        }
      } catch (e) {
        console.warn('加载历史消息失败:', e);
      }
    }

    // ====== Layer 1: 链接检测与路由 ======
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
    const isLink = !hasImages && !hasVideos && !hasDocuments && (
      urlPattern.test(content.trim()) || content.trim().startsWith('http') || content.trim().startsWith('www.')
    );

    let linkContext: {
      linkType: 'article' | 'image' | 'video';
      title: string;
      extractedContent: string;
      mediaUrl?: string;
      tags: string[];
      sourceUrl: string;
      sourcePlatform: string;
      transcript?: string;
    } | null = null;

    if (isLink) {
      const normalizedUrl = content.trim().startsWith('http') ? content.trim() : `https://${content.trim()}`;
      const hostname = normalizedUrl.replace('https://', '').replace('http://', '').split('/')[0];
      const platformMap: Record<string, string> = {
        weibo: '微博', zhihu: '知乎', xiaohongshu: '小红书',
        douyin: '抖音', bilibili: 'B站',
      };
      const sourcePlatform = Object.entries(platformMap).find(([k]) => hostname.includes(k))?.[1] || hostname;

      try {
        const linkRes = await fetch(new URL('/api/ai/analyze-link', request.url).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: normalizedUrl }),
        });
        const linkData = await linkRes.json();

        linkContext = {
          linkType: linkData.linkType || 'article',
          title: linkData.title || '链接内容',
          extractedContent: linkData.summary || linkData.keyPoints?.join('；') || '',
          mediaUrl: linkData.mediaUrl,
          tags: linkData.tags || [],
          sourceUrl: normalizedUrl,
          sourcePlatform,
          transcript: linkData.transcript || undefined,
        };
        console.log(`[链接] 类型=${linkContext.linkType} 平台=${sourcePlatform}`);
      } catch (e) {
        console.warn('链接分析失败，降级为文本处理:', e);
      }
    }

    // ====== 文档附件抽取 ======
    let documentContext: string[] = [];
    if (hasDocuments) {
      const supabase = createAdminClient();
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        txt: 'text/plain',
        md: 'text/markdown',
      };
      for (const docUrl of documents) {
        try {
          // 校验 URL 格式和来源
          if (typeof docUrl !== 'string' || docUrl.length > 500) {
            console.warn(`无效的文档 URL: ${docUrl}`);
            continue;
          }
          // 从 Supabase 公网 URL 中提取 bucket 和路径，并校验所属用户
          const url = new URL(docUrl as string);
          // 只允许从自身 Supabase storage 域名下载
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          if (supabaseUrl && !url.hostname.includes(new URL(supabaseUrl).hostname)) {
            console.warn(`拒绝非 Supabase storage 域名: ${url.hostname}`);
            continue;
          }
          const parts = url.pathname.split('/').filter(Boolean);
          // pathname 格式: /storage/v1/object/public/<bucket>/<path>
          const publicIdx = parts.indexOf('public');
          if (publicIdx === -1 || publicIdx + 2 >= parts.length) {
            console.warn(`无法解析文档 URL: ${docUrl}`);
            continue;
          }
          const bucket = parts[publicIdx + 1];
          const storagePath = parts.slice(publicIdx + 2).join('/');
          // 校验路径必须属于当前用户
          if (!storagePath.startsWith(`${user.id}/`)) {
            console.warn(`拒绝访问其他用户的文件: ${storagePath} (user: ${user.id})`);
            continue;
          }
          const ext = storagePath.split('.').pop()?.toLowerCase() || '';
          const mimeType = mimeMap[ext];
          if (!mimeType) continue;

          const { data, error } = await supabase.storage.from(bucket).download(storagePath);
          if (error || !data) {
            console.warn(`文档下载失败 (${docUrl}):`, error);
            continue;
          }
          const arrayBuffer = await data.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const result = await extractTextFromBuffer(buffer, mimeType);
          if (result.text) {
            const label = ext === 'pdf' ? 'PDF' : ext === 'docx' ? 'DOCX' : ext.toUpperCase();
            documentContext.push(`[${label} 文档内容]\n${result.text}`);
          }
        } catch (e) {
          console.warn(`文档抽取失败 (${docUrl}):`, e);
        }
      }
    }

    // ====== 意图检测 ======
    let intent: DetectedIntent;

    if (hasDocuments && documentContext.length > 0) {
      // 文档内容直接走 office 意图
      intent = {
        type: 'office', label: '文档分析', needsChat: true,
        hasImage: false, hasVideo: false,
        description: '文档内容分析与总结',
        wantsGeneration: false,
      };
    } else if (linkContext) {
      // Layer 1: 链接类型决定路由目标
      switch (linkContext.linkType) {
        case 'article':
          intent = {
            type: 'writing', label: '链接内容处理', needsChat: true,
            hasImage: false, hasVideo: false,
            description: '网页/文章内容分析与创作',
            wantsGeneration: false,
          };
          break;
        case 'image':
          intent = {
            type: 'image', label: '图像处理&生成', needsChat: true,
            hasImage: false, hasVideo: false,
            description: '链接图片分析与描述',
            wantsGeneration: false,
          };
          break;
        case 'video':
          intent = {
            type: 'video', label: '视频分析&复刻', needsChat: true,
            hasImage: false, hasVideo: false,
            description: '链接视频内容分析',
            wantsGeneration: false,
          };
          break;
      }
    } else {
      // Layer 2: 文本意图识别
      intent = detectIntent(content, hasImages, hasVideos, historyMessages);
    }

    const isGeneration = intent.wantsGeneration;

    console.log(`[意图] ${intent.label}${intent.genType ? ' → ' + intent.genType : ''} | content: "${content.substring(0, 50)}..."`);

    // ====== 天气查询：提取城市并获取实时天气 ======
    let weatherData: import('@/lib/ai-services').WeatherData | null = null;
    if (intent.type === 'weather') {
      // 去掉常见的天气/时间/疑问词，剩下的中文字符最可能是城市名
      const noiseWords = /的|天气|气温|温度|下雨|下雪|刮风|雾霾|空气质量|预报|今天|明天|后天|昨天|最近|未来|这周|本周|下周|周末|怎么样|如何|冷不冷|热不热|会不会|会下|热|冷|带伞|穿什么|紫外线|多云|阴天|晴天|台风|暴雪|冰雹|寒潮|降温|升温|变天|查一下|帮我看|搜一下|一下|一查/g;
      const cleaned = content.replace(noiseWords, ' ').trim();
      // 提取第一个连续2-3个中文字符作为城市名
      const cityMatch = cleaned.match(/[\u4e00-\u9fff]{2,3}/);
      const city = cityMatch ? cityMatch[0] : '';

      if (city) {
        console.log(`[天气] 检测到城市: "${city}" (原始: "${content}")`);
        weatherData = await fetchWeather(city);
        if (weatherData) {
          console.log(`[天气] 获取成功: ${weatherData.current.desc} ${weatherData.current.temp}°C`);
        } else {
          console.log(`[天气] fetchWeather 返回 null，城市="${city}"`);
        }
      } else {
        console.log(`[天气] 未检测到城市名，原始: "${content}"`);
      }
    }

    // ====== 构造 Prompt ======
    // 注入文档抽取文本到用户内容
    const effectiveContent = documentContext.length > 0
      ? `用户上传了文档文件，以下是文档内容：\n\n${documentContext.join('\n\n---\n\n')}\n\n用户指令：${content || '请分析以上文档内容，给出总结、关键要点和创作建议'}`
      : content;

    const { systemPrompt, userPrompt: baseUserPrompt, requiresJSON } = buildPrompt(intent, effectiveContent);

    let userPrompt: string;

    if (linkContext) {
      // 抓取质量判断:extractedContent 太短(<200字)说明 SSR 空壳/反爬失败
      // analyze-link 已先试 SSR,再 fallback jina.ai reader,仍 < 200 才是真没救
      // 这种情况下 LLM 容易自我合理化为"我是离线助手",必须显式说明已联网但没拿到正文
      const isFetchFailed = !linkContext.extractedContent || linkContext.extractedContent.trim().length < 200;
      const fetchFailedHint = isFetchFailed ? `
⚠️ 重要提示:这个链接(如微信公众号/知乎/小红书)的页面是 JS 动态渲染的 SPA,我们已尝试抓取但没拿到正文。
请基于你已有的知识(如果认识这个标题/主题)给出分析,绝对不要说自己"无法访问""离线""不能联网"——那是不准确的。
如果对主题也不熟悉,直接告诉用户"这个链接我们没抓到正文,你可以把全文贴过来让我分析",而不是说自己是离线助手。` : '';

      // Layer 1 链接路由：注入提取内容到对应模块
      switch (linkContext.linkType) {
        case 'article':
          userPrompt = `${systemPrompt}

用户粘贴了一个网页链接，以下是自动抓取的内容：

来源平台：${linkContext.sourcePlatform}
页面标题：${linkContext.title}
内容摘要：${linkContext.extractedContent || '(未能抓到正文)'}
原始链接：${linkContext.sourceUrl}${fetchFailedHint}

请基于以上信息(标题 + 摘要 + 你的知识),对这篇文章进行深度分析和总结:
1. 提炼核心观点和关键信息
2. 分析文章的结构和论证逻辑
3. 指出可借鉴的亮点和创作思路
4. 给出二次创作建议

请直接以自然语言输出分析内容。`;
          break;

        case 'image':
          userPrompt = `${systemPrompt}

用户粘贴了一个图片链接，以下是图片分析结果：

图片描述：${linkContext.extractedContent || '(未能获取图片描述)'}
来源链接：${linkContext.sourceUrl}${fetchFailedHint}

请基于以上信息,对这张图片进行分析:
1. 图片的内容特点和风格
2. 可能的创作用途和灵感价值
3. 如果需要类似风格/内容的图片,给出创作建议

请直接以自然语言输出分析内容。`;
          break;

        case 'video':
          const transcriptBlock = linkContext.transcript
            ? `\n视频语音逐字稿：\n${linkContext.transcript}\n`
            : '';
          userPrompt = `${systemPrompt}

用户粘贴了一个视频链接，以下是视频信息：

视频标题：${linkContext.title}
内容摘要：${linkContext.extractedContent || '(未能抓到视频描述)'}
来源链接：${linkContext.sourceUrl}${transcriptBlock}${fetchFailedHint}
请基于以上信息(标题 + 描述 + 你的知识),对这个视频进行分析:
1. 可能的内容方向和创作风格
2. 值得关注的亮点和可借鉴之处
3. 如果用户想做类似视频,给出创作建议
${linkContext.transcript ? '4. 基于逐字稿,分析视频的文案结构和表达技巧' : ''}

请直接以自然语言输出分析内容。`;
          break;
      }
    } else if (intent.hasVideo && videos.length > 0) {
      const textPart = content
        ? `用户发送了以下内容和一个视频，请理解并给出回应：\n\n${content}`
        : '用户发送了一个视频，请仔细分析视频内容。';

      if (intent.wantsGeneration) {
        userPrompt = `${systemPrompt}\n\n${textPart}\n\n用户希望基于这个参考视频生成新视频。请分析视频风格、场景、节奏等特点，给出视频复刻方案。\n\n最后按以下JSON格式返回：\n${GEN_JSON_TEMPLATE}\n\n注意：先自然对话，再输出JSON。`;
      } else {
        userPrompt = `${systemPrompt}\n\n${textPart}\n\n请仔细分析视频中的画面、场景、文字、人物、物体等所有可视内容，给出有深度、有价值的回应。如果视频中有文字，请提取并理解。直接以自然语言回复，不需要JSON格式。`;
      }
    } else if (intent.hasImage && images.length > 0) {
      const textPart = content
        ? `用户发送了以下内容，请理解并给出回应：\n\n${content}`
        : '用户发送了图片，请仔细分析图片内容。';

      if (intent.wantsGeneration) {
        userPrompt = `${systemPrompt}\n\n${textPart}\n\n请仔细分析图片中的物体、场景、文字、颜色、构图、风格等所有可视元素。\n用户希望基于这张图生成${intent.genType === 'img2vid' ? '视频' : '新图片'}。\n\n最后按以下JSON格式返回：\n${GEN_JSON_TEMPLATE}\n\n注意：先自然对话，再输出JSON。`;
      } else {
        userPrompt = `${systemPrompt}\n\n${textPart}\n\n请仔细分析图片中的物体、场景、文字、颜色、构图、风格等所有可视元素。描述你看到了什么，并根据图片内容给出有价值的见解。直接以自然语言回复，不需要JSON格式。`;
      }
    } else if (searchResults?.length > 0) {
      const searchContext = searchResults.map((r: any, i: number) =>
        `[来源${i + 1}] ${r.title}\n链接：${r.url}\n摘要：${r.snippet}`
      ).join('\n\n');

      userPrompt = `${systemPrompt}\n\n你是一位专业的研究分析师，擅长基于搜索到的信息和自身知识给出深度分析。

用户提问：${content}

以下是为你联网搜索到的相关资料：

${searchContext}

回答策略：
1. **搜索结果相关时**：基于搜索内容分析，并在相关观点后标注 [来源N]
2. **搜索结果不相关或不足时**：调用你自身的知识来回答
3. **核心要求**：无论搜索结果质量如何，都要给用户一个完整、专业、有价值的回答

注意：直接输出分析结果，不需要 JSON 包装。`;
    } else if (intent.type === 'weather' && weatherData) {
      // 天气模式：注入实时天气数据
      const forecastText = weatherData.forecast.map(f =>
        `${f.date}: ${f.desc || '晴'} ${f.minTemp}°C ~ ${f.maxTemp}°C，日出 ${f.sunrise} 日落 ${f.sunset}`
      ).join('\n');
      userPrompt = `${systemPrompt}

用户提问：${content}

以下是 ${weatherData.city} 的实时天气数据（数据来源：wttr.in）：

当前天气：
- 天气状况：${weatherData.current.desc}
- 当前温度：${weatherData.current.temp}°C
- 体感温度：${weatherData.current.feelsLike}°C
- 湿度：${weatherData.current.humidity}%
- 风速：${weatherData.current.windSpeed} km/h
- 云量：${weatherData.current.cloudCover}%

未来三天预报：
${forecastText}

请根据以上实时天气数据，用自然温馨的语气回答用户的问题。`;
    } else if (intent.type === 'weather') {
      // 天气 API 获取失败，降级为知识库 + 引导用户自行查询
      userPrompt = `${systemPrompt}

用户提问：${content}

注意：实时天气数据暂时获取失败。请基于你对气候和季节的常识性知识来回答用户：
1. 如果问题涉及具体城市的实时天气，坦诚说明暂时无法获取实时数据
2. 可以介绍该城市当前季节的一般气候特点
3. 给出通用的穿衣/出行建议
4. 建议用户查看天气预报应用获取准确的实时天气

请直接以自然语言输出，不需要JSON格式。`;
    } else {
      // 纯文本模式
      userPrompt = `${systemPrompt}\n\n${baseUserPrompt}`;
    }

    // 构造 messages
    let messages: any[];
    if ((intent.hasImage || intent.hasVideo) && (images.length > 0 || videos.length > 0)) {
      messages = [
        ...historyMessages.map(m => ({ role: m.role, content: m.content })),
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: userPrompt },
            ...images.map((url: string) => ({ type: 'image_url' as const, image_url: { url } })),
            ...videos.map((url: string) => ({ type: 'video_url' as const, video_url: { url } })),
          ]
        }
      ];
    } else {
      messages = [
        ...historyMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userPrompt }
      ];
    }

    // ====== 3. 调用 AI 模型 ======
    let analysis: any = null;
    let modelUsed = '';
    const genMaxTokens = isGeneration ? 4096 : 1000;

    const tryModel = async (name: string, fn: () => Promise<string>): Promise<boolean> => {
      try {
        const response = await fn();
        // 尝试提取 JSON（多模态/生成模式下 prompt 要求了 JSON 输出）
        const parsed = extractJSON(response);
        if (parsed) {
          analysis = parsed;
          modelUsed = name;
          return true;
        }
        // 没有 JSON：用模型的原始文字回复
        const cleaned = response.replace(/```[\s\S]*?```/g, '').trim();
        analysis = {
          response: cleaned || response,
          summary: (cleaned || response).replace(/<[^>]*>/g, '').substring(0, 50),
          tags: [],
          suggestions: [],
          intent: intent.label,
        };
        modelUsed = name;
        // 生成模式下标记需要兜底，非生成模式直接成功
        if (isGeneration) {
          analysis._needsGenerationFallback = true;
        }
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack : '';
        console.warn(`${name} 失败:`, msg, stack);
        modelErrors.push(`${name}: ${msg.substring(0, 200)}`);
      }
      return false;
    };

    if (selectedModel && selectedModel !== 'auto') {
      // 手动指定模型，先验证模型名称
      const validModels = ['deepseek', 'doubao', 'qwen-plus', 'qwen-vl-plus', 'qwen-turbo', 'qwen-max', 'qwen3.7-max'];
      const normalizedModel = validModels.includes(selectedModel) ? selectedModel : 'qwen-plus';
      
      // 手动指定模型
      const modelMap: Record<string, () => Promise<string>> = {
        'deepseek': () => callDeepSeek(messages[messages.length - 1].content as string, { temperature: 0.7, maxTokens: genMaxTokens }),
        'doubao': () => callDoubaoChat(messages, { model: isMultimodal ? 'doubao-1.5-vision-pro-32k' : 'doubao-seed-2.0-241215', temperature: 0.7, maxTokens: genMaxTokens }),
        'qwen-vl-plus': () => callQwen(messages, { model: 'qwen-vl-plus', temperature: 0.7, maxTokens: genMaxTokens }),
        'qwen-plus': () => callQwen(messages, { model: 'qwen-plus', temperature: 0.7, maxTokens: genMaxTokens }),
        'qwen-turbo': () => callQwen(messages, { model: 'qwen-turbo', temperature: 0.7, maxTokens: genMaxTokens }),
        'qwen-max': () => callQwen(messages, { model: 'qwen-max', temperature: 0.7, maxTokens: genMaxTokens }),
        'qwen3.7-max': () => callQwen(messages, { model: 'qwen3.7-max', temperature: 0.7, maxTokens: genMaxTokens }),
      };
      const fallback = () => callQwen(messages, { model: 'qwen-plus', temperature: 0.7, maxTokens: genMaxTokens });

      if (modelMap[normalizedModel]) {
        await tryModel(normalizedModel, modelMap[normalizedModel]);
      } else {
        await tryModel('qwen-plus', fallback);
      }
    } else {
      // 自动选择
      if (isMultimodal) {
        // 多模态：千问视觉优先，豆包兜底
        const ok = await tryModel('qwen-vl-plus', () =>
          callQwen(messages, { model: 'qwen-vl-plus', temperature: 0.7, maxTokens: genMaxTokens }));
        if (!ok) {
          await tryModel('doubao-vision', () =>
            callDoubaoChat(messages, { model: 'doubao-1.5-vision-pro-32k', temperature: 0.7, maxTokens: genMaxTokens }));
        }
      } else {
        // 纯文本：DeepSeek 优先，豆包兜底
        const ok = await tryModel('deepseek', () =>
          callDeepSeek(messages[messages.length - 1].content as string, {
            temperature: 0.7,
            maxTokens: genMaxTokens,
          }));
        if (!ok) {
          await tryModel('doubao', () =>
            callDoubaoChat(messages, {
              temperature: 0.7,
              maxTokens: genMaxTokens,
            }));
        }
      }
    }

    // ====== 4. JSON 重试：AI 没输出 JSON 时，用纯 JSON 指令再试一次 ======
    if (analysis?._needsGenerationFallback && intent.genType) {
      console.log(`[${intent.label}] AI 未输出 JSON，尝试纯 JSON 重试`);
      const isVideo = intent.genType === 'text2vid' || intent.genType === 'img2vid' || intent.genType === 'vid2vid';
      const jsonOnlyPrompt = `请为以下需求生成一个 JSON，不要输出任何其他内容，不要用 markdown 代码块，只输出纯 JSON：

需求：${content}
生成类型：${isVideo ? '视频' : '图片'}
描述：${intent.description}

JSON 格式：
{
  "response": "对用户需求的创意回复（一句话）",
  "summary": "一句话概括",
  "tags": ["标签1", "标签2"],
  "suggestions": ["建议1"],
  "intent": "${intent.label}",
  "generationRequest": {
    "type": "${intent.genType}",
    "prompt": "英文生成提示词"
  }
}`;

      await tryModel('deepseek-json', () =>
        callDeepSeek(jsonOnlyPrompt, { temperature: 0.3, maxTokens: genMaxTokens }));
    }

    // ====== 5. 兜底 ======
    if (!analysis) {
      analysis = {
        response: isGeneration
          ? `好的，正在为你${intent.genType?.includes('vid') ? '生成视频' : '生成图片'}：${content.substring(0, 100)}`
          : (content || (hasImages ? '已收到图片' : (hasVideos ? '已收到视频' : '已收到'))),
        summary: content ? content.substring(0, 30) + (content.length > 30 ? '...' : '') : '内容已记录',
        tags: ['灵感'],
        suggestions: ['保存到灵感库'],
        intent: intent.label,
      };
    }

    // 执行生成兜底（AI 没输出 generationRequest 但用户明确表达了意图）
    if (isGeneration) {
      await executeGenerationFallback(intent, content, images, videos, analysis);
    }

    // 处理 AI 输出的 generationRequest
    if (analysis.generationRequest?.type && analysis.generationRequest?.prompt) {
      const gen = analysis.generationRequest;
      const prompt = gen.prompt.trim();

      switch (gen.type) {
        case 'text2img':
          if (!analysis.generatedImage) {
            try { analysis.generatedImage = await generateImage(prompt); } catch (e) { console.warn('文生图失败:', e); }
          }
          break;

        case 'img2img':
          if (!analysis.generatedImage && images.length > 0) {
            try {
              const visionDesc = await callDoubaoVision(images[0],
                `Please describe this image in detail in English. Additional requirements: ${prompt}`);
              const enhancedPrompt = `${visionDesc.description || ''}. Style transformation: ${prompt}`;
              analysis.generatedImage = await generateImage(enhancedPrompt);
            } catch (e) { console.warn('图生图失败:', e); }
          }
          break;

        case 'text2vid':
          if (!analysis.generatedVideo) {
            try {
              const result = await submitVideoTask(prompt, 5);
              if (result.taskId) analysis.generatedVideo = { taskId: result.taskId, status: result.status, prompt };
            } catch (e) { console.warn('文生视频失败:', e); }
          }
          break;

        case 'img2vid':
          if (!analysis.generatedVideo && images.length > 0) {
            try {
              const visionDesc = await callDoubaoVision(images[0],
                `Please describe this image in detail in English. Additional requirements: ${prompt}`);
              const enhancedPrompt = `${visionDesc.description || ''}. ${prompt}`;
              const result = await submitVideoTask(enhancedPrompt, 5);
              if (result.taskId) analysis.generatedVideo = { taskId: result.taskId, status: result.status, prompt };
            } catch (e) { console.warn('图生视频失败:', e); }
          }
          break;

        case 'vid2vid':
          if (!analysis.generatedVideo && videos.length > 0) {
            try {
              const visionDesc = await callDoubaoVision(videos[0],
                `Please describe this video scene in detail in English. Additional requirements: ${prompt}`);
              const enhancedPrompt = `${visionDesc.description || ''}. ${prompt}`;
              const result = await submitVideoTask(enhancedPrompt, 5);
              if (result.taskId) analysis.generatedVideo = { taskId: result.taskId, status: result.status, prompt };
            } catch (e) { console.warn('视频复刻失败:', e); }
          } else if (!analysis.generatedVideo) {
            // vid2vid 但没有视频附件 → 降级为 text2vid
            try {
              const result = await submitVideoTask(prompt, 5);
              if (result.taskId) analysis.generatedVideo = { taskId: result.taskId, status: result.status, prompt };
            } catch (e) { console.warn('视频复刻降级失败:', e); }
          }
          break;
      }
    }

    // 确保 intent 字段有值
    if (!analysis.intent) {
      analysis.intent = intent.label;
    }

    // 清洗 response 中的 markdown 格式
    if (analysis.response) {
      analysis.response = stripMarkdown(analysis.response);
    }
    // 移除内部标记
    delete analysis._needsGenerationFallback;
    // 链接上下文：附加来源信息
    if (linkContext) {
      analysis.sourceUrl = linkContext.sourceUrl;
      analysis.sourcePlatform = linkContext.sourcePlatform;
    }
    return NextResponse.json({
      success: true,
      ...analysis,
      _model: modelUsed,
      _intent: intent.type,
      _modelErrors: modelErrors.length > 0 ? modelErrors : undefined,
      // 链接抓取失败信号:前端用这个决定是否显示"建议贴正文"提示
      // 阈值 200:analyze-link 已先试 SSR HTML,再 fallback jina.ai reader
      // 仍 < 200 字说明这个 URL 真没救了(SPA 反爬 + 404 + 登录墙)
      linkFetchFailed: !!(linkContext && (!linkContext.extractedContent || linkContext.extractedContent.trim().length < 200)),
    });

  } catch (error) {
    console.error('聊天 API 错误:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      error: errMsg.length > 500 ? errMsg.substring(0, 500) + '...' : errMsg,
      modelErrors: modelErrors.length > 0 ? modelErrors.slice(0, 5) : undefined,
    });
  }
});

// GET /api/ai/chat?action=video_status&taskId=xxx — 查询视频生成状态
export const GET = withAuth(async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'video_status') {
    const taskId = searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ success: false, error: '缺少 taskId' }, { status: 400 });
    }
    try {
      const result = await getVideoTaskStatus(taskId);
      return NextResponse.json({ success: true, data: result });
    } catch (e) {
      console.error('视频状态查询失败:', e);
      return NextResponse.json({ success: false, error: '查询失败' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: false, error: '未知操作' }, { status: 400 });
});
