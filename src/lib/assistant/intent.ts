// 意图检测 — 从用户输入中识别创作意图类型
// 迁移自 src/app/api/ai/chat/route.ts

export type IntentType =
  | 'writing' | 'knowledge' | 'life' | 'schedule' | 'office'
  | 'image' | 'video' | 'coding' | 'creative' | 'legal' | 'weather';

export type GenType = 'text2img' | 'img2img' | 'text2vid' | 'img2vid' | 'vid2vid';

export interface DetectedIntent {
  type: IntentType;
  label: string;
  needsChat: boolean;
  hasImage: boolean;
  hasVideo: boolean;
  description: string;
  wantsGeneration: boolean;
  genType?: GenType;
}

function make(
  type: IntentType, label: string, desc: string,
  hasImages: boolean, hasVideos: boolean,
  wantsGen = false, genType?: GenType
): DetectedIntent {
  return { type, label, needsChat: true, hasImage: hasImages, hasVideo: hasVideos, description: desc, wantsGeneration: wantsGen, genType };
}

export function detectIntent(
  content: string,
  hasImages: boolean,
  hasVideos: boolean,
  historyMessages: Array<{ role: string; content: string }> = []
): DetectedIntent {
  const c = content;

  // 自我介绍 / 身份询问（最高优先级）
  const matchSelfIntro = /你是谁|你叫什么|你的名字|自我介绍|介绍一下你|你是什么|你是干嘛|你能做什么|你有什么功能|你是哪位/.test(c);
  if (matchSelfIntro) return make('knowledge', '自我介绍', '介绍灵集AI的身份和能力', hasImages, hasVideos);

  const matchKnowledge = /什么是|为啥|为什么|怎么会|怎么[做样办]|如何|解释|含义|是什么意思|学习|知识点|教我|帮我理解|讲解一下|说明一下|介绍一下|是怎么|是什么|有啥区别|有何不同|怎么理解|什么意思|定义|概念/.test(c);

  // Coding
  const matchCoding = /代码|编程|debug|调试|bug|报错|异常|崩溃|实现.*功能|写.*(?:函数|脚本|程序|插件|组件|模块|接口|API)|怎么写.*(?:代码|程序)|技术.*(?:问题|方案|架构)|重构|优化.*(?:性能|代码|查询)|SQL|sql|数据库.*(?:查询|设计)|前端|后端|全栈|React|Vue|Next|Node|Python|Java|Go|Rust|TypeScript|JavaScript|CSS|HTML|API.*(?:调用|设计)|命令行|终端|git|Git|Docker|容器|部署|服务器.*配置|nginx|环境.*(?:配置|搭建)|正则|算法.*(?:实现|题)|数据.*(?:结构|加密)|并发|异步|多线程|解释.*(?:代码|这段|程序)|这段.*(?:代码|程序)|帮我.*(?:写.*代码|改.*代码|看.*代码|查.*bug|debug|调.*bug)|技术.*(?:问答|请教|求助)/.test(c);

  // Office
  const matchOffice = /表格|报告|数据|PPT|Excel|分析数据|周报|月报|报表|图表|演示文稿|文档撰写|工作总结|数据分析|做.*表|画.*表|数据.*分析|邮件.*写|写.*邮件|PPT.*大纲|办公|工作.*汇报|做.*(?:PPT|Excel|表格|报表|图表)|画.*(?:图表|表格)/.test(c);

  // Legal
  const matchLegal = /合同|协议|法律|法规|条款|合规|诉讼|仲裁|律师|法院|判决|裁定|通知书|律师函|法律.*(?:意见|风险|咨询)|起草.*(?:合同|协议|文书|文件)|审查.*(?:合同|协议|条款)|解释.*(?:条款|法律|法规|条文)|劳动.*(?:合同|仲裁|纠纷)|知识产权|版权.*(?:侵权|保护)|隐私.*(?:政策|条款)|保密.*(?:协议|条款)|租赁.*(?:合同|协议)|买卖.*(?:合同)|章程|股东.*(?:协议)|竞业.*(?:限制|协议)|NDA|保密.*(?:合同|函)|法务|格式.*(?:合同|协议|文书)|模版.*(?:合同|协议)|范本.*(?:合同|协议)/.test(c);

  // Weather
  const matchWeather = /(?:查|看|告诉我|今天|明天|后天|这周|周末|本周|今日|明日).{0,6}(?:天气|气温|温度|下不下雨|有没有雨|空气质量|紫外线|会不会下雨|要不要带伞|穿什么衣服)|天气.{0,3}(?:怎么样|如何|好吗|好不好)|会不会下雨|多少度|几度|降温|升温|刮台风|下雪了|台风.*(?:来|登陆)|空气.*质量.*(?:怎么|如何|好不好)/.test(c);

  // Life
  const matchLife = /攻略|计划|行程|安排|规划|策划|旅游|出行|推荐|游玩|怎么[去逛玩]|旅行|路线|去哪|怎么安排|好物|选.*哪个|买.*什么|值得.*买|种草|拔草|探店|打卡|周末|假期|出行计划|方案/.test(c);

  // Schedule
  const matchSchedule = /添加.*日程|创建.*日程|新建.*日程|记.*日程|设.*提醒|设置.*提醒|帮我.*提醒|记.*提醒|添加.*提醒|创建.*提醒|设.*日程/.test(c);

  // Video
  const matchVideo = /视频.*分析|视频.*脚本|视频.*复刻|生成.*视频|视频.*生成|做.*视频|制作.*视频|分析.*视频|视频.*结构|视频.*节奏|同款.*视频|复刻.*视频|视频.*创作|文生视频|图生视频|vid2vid|剪.*视频|合成.*视频|视频.*内容/.test(c);
  const wantsVidGen = /生成.*视频|视频.*生成|做.*视频|制作.*视频|文生视频|图生视频|复刻.*视频|视频.*复刻|剪.*视频|合成.*视频/.test(c);

  // Image
  const matchImage = /图片.*分析|描述.*图片|生成.*图|画图|文生图|图生图|画.*[个只张幅]|生成.*照片|做.*(?:图|图片|头像|海报|封面|壁纸|logo|banner|表情)|设计.*(?:图|海报|封面)|P图|修图|改.*风格|换.*风格|图片.*生成|图像.*生成|描绘|画出|照片.*生成|生成.*照片|美图|修.*图|帮我画|画一[下个]|请画|来.*画|^画/.test(c);
  const wantsImgGen = /生成.*图|画图|文生图|图生图|生成.*照片|画.*[个只张幅]|做.*(?:图|图片|头像|海报|封面|壁纸|logo|banner)|设计.*(?:图|海报|封面)|P图|修图|改.*风格|换.*风格|绘制|帮我画|画一[下个]|请画|^画/.test(c);

  // Writing
  const matchWriting = /写|生成.*文案|润色|改写|翻译|摘要|扩写|缩写|改.*文案|文案.*生成|创作.*文|写.*(?:文章|内容|文案|段|篇|首|句|标题|简介|一段|一篇|一个|东西)|润.*文|修改.*文案|优化.*文案|翻译.*为|总结.*内容|概括|提炼|改.*(?:文字|文案|内容|句子|段落)/.test(c);

  // Creative
  const matchCreative = /头脑风暴|brainstorm|创意.*(?:点子|方案|想法|构思)|品牌.*(?:定位|IP|形象|故事|slogan|口号|标语|升级|焕新|重塑)|营销.*(?:方案|策略|计划|文案|活动)|slogan|Slogan|口号.*(?:创作|设计|想)|IP.*(?:设计|打造|策划|角色)|产品.*(?:文案|卖点|定位|包装)|内容.*(?:策划|规划|日历|方向)|灵感.*(?:发散|激发)|构思.*(?:方案|创意)|策划.*(?:方案|活动|创意|营销|品牌|内容)|广告.*(?:文案|创意|语)|推广.*(?:文案|方案)|活动.*(?:策划|创意|点子|方案)|视觉.*(?:风格|方向|参考)|Mood.?[Bb]oard|情绪板/.test(c);

  // Priority 1: keyword matching (specific → broad)
  if (matchKnowledge) return make('knowledge', '知识解答&学习辅助', '知识点讲解与答疑解惑', hasImages, hasVideos);
  if (matchCoding) return make('coding', '编程开发&技术助手', '代码编写、调试与技术问答', hasImages, hasVideos);
  if (matchOffice) return make('office', '办公&数据', '办公文档与数据分析', hasImages, hasVideos);
  if (matchLegal) return make('legal', '法律文书&合规草拟', '合同协议起草与法律条款解读', hasImages, hasVideos);
  if (matchWeather) return make('weather', '天气查询', '实时天气查询与出行建议', hasImages, hasVideos);
  if (matchWriting) return make('writing', '文字创作&处理', '文案创作与文字处理', hasImages, hasVideos);
  if (matchCreative) return make('creative', '创意设计&营销策划', '品牌创意与营销方案设计', hasImages, hasVideos);
  if (matchLife) return make('life', '生活&规划', '出行攻略与方案策划', hasImages, hasVideos);
  if (matchSchedule) return make('schedule', '日程管理', '时间安排与日程提醒', hasImages, hasVideos);

  if (matchVideo) {
    let gType: GenType | undefined;
    if (wantsVidGen) {
      if (hasVideos) gType = 'vid2vid';
      else if (hasImages) gType = 'img2vid';
      else gType = 'text2vid';
    }
    return make('video', '视频分析&复刻', gType ? '视频生成与复刻' : '视频内容分析', hasImages, hasVideos, !!gType, gType);
  }

  if (matchImage) {
    let gType: GenType | undefined;
    if (wantsImgGen) {
      if (hasImages) gType = 'img2img';
      else gType = 'text2img';
    }
    return make('image', '图像处理&生成', gType ? '图片生成与创作' : '图像分析与描述', hasImages, hasVideos, !!gType, gType);
  }

  // Priority 2: has image attachment → image analysis
  if (hasImages) return make('image', '图像处理&生成', '图像分析与描述', hasImages, hasVideos);

  // Priority 3: has video attachment → video analysis
  if (hasVideos) return make('video', '视频分析&复刻', '视频内容分析', hasImages, hasVideos);

  // Priority 4: 利用对话历史上下文增强意图判断
  if (historyMessages.length > 0) {
    const recentHistory = historyMessages.slice(-4); // 最近 4 条
    const historyText = recentHistory.map(m => m.content).join(' ');

    // 历史中提到过视频相关 → 当前消息倾向视频
    const historyVideo = /生成.*视频|视频.*生成|做.*视频|数字人|口播|换脸|合成|剪辑/.test(historyText);
    if (historyVideo && matchWriting) return make('video', '视频内容创作', '基于对话上下文判断为视频创作意图', hasImages, hasVideos, true, hasImages ? 'img2vid' : 'text2vid');

    // 历史中提到过图片 → 当前消息倾向图片
    const historyImage = /生成.*图|画图|做.*图|图片|海报|封面/.test(historyText);
    if (historyImage && matchWriting) return make('image', '图像创作', '基于对话上下文判断为图像创作意图', hasImages, hasVideos, true, hasImages ? 'img2img' : 'text2img');

    // 历史中提到过写作/文案 → 保持写作意图
    const historyWriting = /写|文案|文章|润色/.test(historyText);
    if (historyWriting && !matchWriting && !matchImage && !matchVideo && !matchKnowledge) {
      return make('writing', '文字创作&处理', '基于对话上下文判断为文字创作意图', hasImages, hasVideos);
    }
  }

  // Priority 5: fallback → writing
  return make('writing', '文字创作&处理', '文案创作与文字处理', hasImages, hasVideos);
}
