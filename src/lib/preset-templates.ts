// AI 创作中心统一的预设/行业/文风/平台定义
// 让文案/生图/视频页面共享同一份数据源

// ─── AI 文案：内容类型（平台） ──────────────────────────────

export interface ContentType {
  id: string;
  label: string;
  emoji: string;
  scenario: string;     // 适用场景
  lengthHint: string;   // 推荐长度
}

export const COPYWRITING_TYPES: ContentType[] = [
  { id: 'xiaohongshu', label: '小红书笔记', emoji: '📱', scenario: '种草分享、生活记录', lengthHint: '300-800 字' },
  { id: 'douyin', label: '抖音文案', emoji: '🎬', scenario: '短视频标题/口播', lengthHint: '50-150 字' },
  { id: 'kuaishou', label: '快手文案', emoji: '⚡', scenario: '接地气、老铁文化', lengthHint: '50-150 字' },
  { id: 'wechat_article', label: '公众号文章', emoji: '📰', scenario: '深度长文、观点输出', lengthHint: '1500-3000 字' },
  { id: 'weibo', label: '微博', emoji: '💬', scenario: '热点话题、情绪表达', lengthHint: '100-300 字' },
  { id: 'bilibili', label: 'B站动态', emoji: '📺', scenario: 'UP主动态、互动话题', lengthHint: '200-500 字' },
  { id: 'zhihu', label: '知乎回答', emoji: '🤔', scenario: '专业解答、深度分析', lengthHint: '500-1500 字' },
  { id: 'script', label: '短视频脚本', emoji: '🎞️', scenario: '分镜+口播+字幕', lengthHint: '300-600 字' },
];

// ─── AI 文案：文风（按分类） ───────────────────────────────

export interface StyleOption {
  id: string;
  label: string;
  category: '情感' | '专业' | '营销' | '搞笑';
  hint: string;
}

export const COPYWRITING_STYLES: StyleOption[] = [
  // 情感
  { id: 'healing', label: '治愈系', category: '情感', hint: '温暖、舒心、像朋友拥抱' },
  { id: 'passionate', label: '热血燃', category: '情感', hint: '激昂、有力量感、唤醒斗志' },
  { id: 'sentimental', label: '伤感走心', category: '情感', hint: '细腻、走心、有故事感' },
  { id: 'resonant', label: '共鸣感', category: '情感', hint: '说中大多数人没说的心里话' },
  // 专业
  { id: 'science', label: '科普干货', category: '专业', hint: '有数据、有结构、有结论' },
  { id: 'analysis', label: '深度评论', category: '专业', hint: '有观点、有论据、有态度' },
  { id: 'tutorial', label: '教程步骤', category: '专业', hint: '一二三四、可执行性强' },
  // 营销
  { id: 'planting', label: '种草安利', category: '营销', hint: '真实体验、自来水、让人想下单' },
  { id: 'selling', label: '带货促销', category: '营销', hint: '限时优惠、紧迫感、转化率优先' },
  { id: 'story', label: '故事叙述', category: '营销', hint: '开头钩子、情节推进、情感落点' },
  { id: 'twist', label: '反转钩子', category: '营销', hint: '先抑后扬、意料之外、情理之中' },
  // 搞笑
  { id: 'joke', label: '段子手', category: '搞笑', hint: '节奏快、包袱密、玩梗' },
  { id: 'meme', label: '梗文化', category: '搞笑', hint: '网感强、自带传播属性' },
  { id: 'roast', label: '吐槽犀利', category: '搞笑', hint: '敢说实话、解气、读者爽到' },
];

// ─── AI 文案：行业模板 ────────────────────────────────────

export interface IndustryTemplate {
  id: string;
  name: string;
  emoji: string;
  audience: string;       // 受众特征
  mustInclude: string;    // 必含元素
  avoidList: string;      // 避坑项
  opener: string;         // 开头钩子建议
  cta: string;            // CTA 句式
  recLength: string;      // 推荐长度
  recStyle: string[];     // 推荐文风 id
}

export const COPYWRITING_INDUSTRIES: IndustryTemplate[] = [
  {
    id: 'general',
    name: '通用',
    emoji: '🌐',
    audience: '广泛受众、不限行业',
    mustInclude: '清晰的核心信息、明确的价值点',
    avoidList: '过于垂直的术语、生硬的推销',
    opener: '从一个反常识的现象/数据/问题切入',
    cta: '评论/收藏/关注互动',
    recLength: '300-800 字',
    recStyle: ['resonant', 'story', 'tutorial'],
  },
  {
    id: 'beauty',
    name: '美妆',
    emoji: '💄',
    audience: '18-35 岁女性，注重颜值和成分，护肤有阶段需求',
    mustInclude: '肤质匹配、成分解析、上脸感受、持久度',
    avoidList: '夸大功效、医美话术、绝对化用语（最/第一/唯一）',
    opener: '从"踩过的坑"或"成分党视角"切入',
    cta: '"你的肤质适合吗？评论区发肤质帮你看"',
    recLength: '300-600 字',
    recStyle: ['planting', 'science', 'healing'],
  },
  {
    id: 'fashion',
    name: '穿搭',
    emoji: '👗',
    audience: '18-40 岁女性（及部分男性），追求显瘦显高、性价比、风格化',
    mustInclude: '身材适配、场景搭配、平替/价位、风格标签',
    avoidList: '身材焦虑贩卖、贵价劝退、模糊品牌',
    opener: '从"一个真实穿搭场景/痛点"切入（如通勤、约会、出游）',
    cta: '"你是哪种身材？评论区告诉我帮你挑"',
    recLength: '300-500 字',
    recStyle: ['planting', 'tutorial', 'resonant'],
  },
  {
    id: 'food',
    name: '美食',
    emoji: '🍜',
    audience: '吃货+探店+家庭主妇/主夫，注重新鲜感、出片、复刻可行性',
    mustInclude: '口感描述、价格、地址/外卖渠道、出片角度',
    avoidList: '滤镜过度、生硬探店感、无法复刻的步骤',
    opener: '从"一口入魂的瞬间"或"踩雷经历"切入',
    cta: '"你最馋哪一口？评论区馋馋我"',
    recLength: '200-500 字',
    recStyle: ['planting', 'story', 'sentimental'],
  },
  {
    id: 'baby',
    name: '母婴',
    emoji: '🍼',
    audience: '新手妈妈/爸爸，关注安全、成分、医生背书、其他家长口碑',
    mustInclude: '安全认证、年龄阶段、真实使用体验、医生/专家建议',
    avoidList: '绝对化安全承诺、医疗建议越界、贩卖焦虑',
    opener: '从"宝宝第一次使用/踩坑经历"切入',
    cta: '"你家宝宝多大？评论区帮你选"',
    recLength: '400-800 字',
    recStyle: ['healing', 'science', 'resonant'],
  },
  {
    id: 'digital',
    name: '数码',
    emoji: '📱',
    audience: '参数党+实用党，关心性能/价格/对比/耐用度',
    mustInclude: '具体参数、对比横评、真实使用场景、优缺点',
    avoidList: '水文堆参数、品牌情绪化、模糊测评',
    opener: '从"一个具体使用场景"或"对比争议"切入',
    cta: '"你的预算是？评论区帮你选"',
    recLength: '500-1200 字',
    recStyle: ['science', 'analysis', 'tutorial'],
  },
  {
    id: 'home',
    name: '家居',
    emoji: '🏠',
    audience: '装修党+租房改造，关心颜值、空间利用、平价好物',
    mustInclude: '空间尺寸、价格、风格标签、改造成本',
    avoidList: '过度奢华、忽略租房党、动辄"全屋定制"',
    opener: '从"改造前后对比"或"小空间痛点"切入',
    cta: '"你家多少平？评论区帮你规划"',
    recLength: '400-800 字',
    recStyle: ['planting', 'tutorial', 'healing'],
  },
  {
    id: 'education',
    name: '教育',
    emoji: '📚',
    audience: '家长+学习者，关注效果、方法、性价比、师资',
    mustInclude: '课程体系、学习效果验证、适合人群、价位',
    avoidList: '包过承诺、贩卖焦虑、夸大效果',
    opener: '从"一个学习痛点"或"真实提分案例"切入',
    cta: '"你家孩子几年级？评论区帮你规划"',
    recLength: '500-1000 字',
    recStyle: ['science', 'tutorial', 'analysis'],
  },
  {
    id: 'workplace',
    name: '职场',
    emoji: '💼',
    audience: '打工人+管理者，关心技能、晋升、副业、行业趋势',
    mustInclude: '可执行步骤、真实案例、避坑指南',
    avoidList: '成功学毒鸡汤、模糊建议、不可复制的"特例"',
    opener: '从"一个具体工作场景/危机"切入',
    cta: '"你做哪一行？评论区聊聊"',
    recLength: '500-1000 字',
    recStyle: ['analysis', 'tutorial', 'resonant'],
  },
  // ─── V2.0.1: 16 个新行业(从 9 扩到 25)──────────────────────
  {
    id: 'legal',
    name: '法律',
    emoji: '⚖️',
    audience: '有法律疑问的当事人，关心胜诉关键、律师选择、费用透明',
    mustInclude: '法条引用、当事人视角、胜诉关键证据、律师选择建议',
    avoidList: '承诺具体胜诉、给具体法律意见、贬低同行、虚假承诺',
    opener: '从"一个真实案例"或"当事人最常见的误区"切入',
    cta: '"你的案件类型？评论区发案情，帮你看思路"',
    recLength: '500-1000 字',
    recStyle: ['analysis', 'tutorial', 'science'],
  },
  {
    id: 'finance_tax',
    name: '财税',
    emoji: '💰',
    audience: '中小企业主+财务人员，关心政策、节税、合规、申报',
    mustInclude: '政策依据、节税点、申报时间节点、案例数据',
    avoidList: '教偷税漏税、给具体避税方案、虚假返税承诺',
    opener: '从"一个新政策"或"老板最常踩的坑"切入',
    cta: '"你是小规模还是一般纳税人？评论区帮你看"',
    recLength: '400-800 字',
    recStyle: ['science', 'tutorial', 'analysis'],
  },
  {
    id: 'training',
    name: '教培',
    emoji: '📚',
    audience: '家长+学习者，关心效果、师资、性价比、是否适合自己',
    mustInclude: '课程体系、师资背景、提分案例、适合人群',
    avoidList: '包过承诺、夸大效果、贩卖焦虑、贬低同行',
    opener: '从"一个学习痛点"或"真实提分案例"切入',
    cta: '"你孩子几年级/学什么？评论区帮你规划"',
    recLength: '500-1000 字',
    recStyle: ['science', 'tutorial', 'resonant'],
  },
  {
    id: 'medical',
    name: '医疗咨询',
    emoji: '🏥',
    audience: '有健康疑问的患者+家属，关心症状、医院选择、医保',
    mustInclude: '症状描述、医院级别、医保报销范围、就医流程',
    avoidList: '确诊、开药、自我诊断、推荐具体医院医生',
    opener: '从"一个常见症状"或"科室选择困惑"切入',
    cta: '"建议先挂 XX 科，评论区说症状帮你看"',
    recLength: '400-800 字',
    recStyle: ['science', 'tutorial', 'healing'],
  },
  {
    id: 'study_abroad',
    name: '留学',
    emoji: '✈️',
    audience: '准留学生+家长，关心国家选择、院校排名、申请节点',
    mustInclude: '国家对比、院校排名、申请时间线、费用预算',
    avoidList: '包录取、夸大名校、贬低国内教育、虚假录取案例',
    opener: '从"一个国家对比"或"申请时间节点"切入',
    cta: '"你想申哪国/什么专业？评论区帮你规划"',
    recLength: '500-1200 字',
    recStyle: ['analysis', 'tutorial', 'science'],
  },
  {
    id: 'restaurant',
    name: '餐饮',
    emoji: '🍜',
    audience: '吃货+探店+家庭主妇主夫，注重新鲜感、出片、复刻可行性',
    mustInclude: '招牌菜、价格、地址/外卖渠道、出片角度、复刻步骤',
    avoidList: '滤镜过度、生硬探店感、无法复刻的步骤、虚假排队',
    opener: '从"一口入魂的瞬间"或"踩雷经历"切入',
    cta: '"你最馋哪一口？评论区馋馋我"',
    recLength: '200-500 字',
    recStyle: ['planting', 'story', 'sentimental'],
  },
  {
    id: 'pet',
    name: '宠物',
    emoji: '🐶',
    audience: '铲屎官，关心品种适配、健康问题、用品测评、训练',
    mustInclude: '品种年龄适配、健康问题、用品测评、训练技巧',
    avoidList: '医疗建议越界、贩卖焦虑、品种歧视',
    opener: '从"我家毛孩子的真实瞬间"或"新手指南"切入',
    cta: '"你家毛孩子多大了？评论区帮你选"',
    recLength: '300-600 字',
    recStyle: ['healing', 'story', 'resonant'],
  },
  {
    id: 'fitness',
    name: '健身',
    emoji: '💪',
    audience: '健身新手+进阶者，关心部位训练、动作、组数、饮食',
    mustInclude: '训练部位、动作要点、组数次数、饮食建议',
    avoidList: '减肥承诺、卖药、夸大效果、推荐违禁补剂',
    opener: '从"一个具体动作"或"训练计划"切入',
    cta: '"你健身多久了？评论区帮你规划"',
    recLength: '400-800 字',
    recStyle: ['tutorial', 'science', 'resonant'],
  },
  {
    id: 'beauty_medical',
    name: '美容医美',
    emoji: '💉',
    audience: '有医美需求的爱美人士，关心项目、医院、术后、价格',
    mustInclude: '项目介绍、医院资质、价格区间、术后注意事项',
    avoidList: '夸大效果、医美话术、推荐无资质机构、贬低同行',
    opener: '从"一个项目科普"或"术前必看"切入',
    cta: '"你想改善哪个部位？评论区帮你看"',
    recLength: '400-800 字',
    recStyle: ['science', 'tutorial', 'planting'],
  },
  {
    id: 'auto',
    name: '汽车',
    emoji: '🚗',
    audience: '购车者+车主，关心车型、配置、试驾感受、油耗',
    mustInclude: '车型配置、试驾感受、油耗/电耗、保养成本',
    avoidList: '品牌情绪化、贬低竞品、虚假促销、夸大优惠',
    opener: '从"一个具体场景"或"车型对比"切入',
    cta: '"你预算多少？评论区帮你选"',
    recLength: '500-1200 字',
    recStyle: ['analysis', 'tutorial', 'science'],
  },
  {
    id: 'real_estate',
    name: '房产',
    emoji: '🏠',
    audience: '购房租房者，关心户型、地段、价位、配套',
    mustInclude: '户型分析、地段优劣、价位对比、配套介绍',
    avoidList: '承诺升值、模糊信息、虚假房源、贬低区域',
    opener: '从"一个户型"或"地段对比"切入',
    cta: '"你在哪个城市？评论区帮你看"',
    recLength: '500-1000 字',
    recStyle: ['analysis', 'tutorial', 'planting'],
  },
  {
    id: 'gaming',
    name: '游戏',
    emoji: '🎮',
    audience: '游戏玩家，关心玩法、版本、攻略、装备',
    mustInclude: '玩法介绍、版本差异、攻略步骤、装备推荐',
    avoidList: '引战、剧透、刷屏充值、未成年人引导',
    opener: '从"一个新版本"或"通关攻略"切入',
    cta: '"你玩哪个服？评论区聊聊"',
    recLength: '300-800 字',
    recStyle: ['tutorial', 'meme', 'resonant'],
  },
  {
    id: 'sports',
    name: '体育',
    emoji: '⚽',
    audience: '体育迷，关心赛事、球队、球员、转会',
    mustInclude: '赛事分析、球队动态、球员表现、数据支撑',
    avoidList: '引战、地域黑、贬低球员、虚假爆料',
    opener: '从"一场比赛"或"转会动态"切入',
    cta: '"你支持谁？评论区聊聊"',
    recLength: '300-800 字',
    recStyle: ['analysis', 'resonant', 'meme'],
  },
  {
    id: 'anime',
    name: '二次元',
    emoji: '🌸',
    audience: '二次元爱好者，关心 IP、CP、画风、同人',
    mustInclude: 'IP 介绍、CP 关系、画风分析、同人作品',
    avoidList: '引战、举报红线、贬低作品、过度消费',
    opener: '从"一个新番"或"CP 名场面"切入',
    cta: '"你推哪个 CP？评论区磕磕"',
    recLength: '200-600 字',
    recStyle: ['resonant', 'meme', 'story'],
  },
  {
    id: 'elderly',
    name: '银发',
    emoji: '👴',
    audience: '中老年群体+子女代购，关心健康、实惠、家庭',
    mustInclude: '大字通俗、价格实惠、家庭场景、安全实用',
    avoidList: '卖保健品、医疗承诺、夸大功效、虚假专家',
    opener: '从"一个生活场景"或"家庭关怀"切入',
    cta: '"你爸妈多大？评论区帮你选"',
    recLength: '300-600 字',
    recStyle: ['healing', 'story', 'resonant'],
  },
  {
    id: 'mens',
    name: '男士向',
    emoji: '🧔',
    audience: '男性用户，关心数码、车、户外、效率工具、健身',
    mustInclude: '硬核参数、实测数据、性价比、效率提升',
    avoidList: '太软、堆术语、夸大效果、不切实际',
    opener: '从"一个入手理由"或"实测对比"切入',
    cta: '"你最近想入什么？评论区聊聊"',
    recLength: '400-800 字',
    recStyle: ['analysis', 'tutorial', 'science'],
  },
  {
    id: 'travel',
    name: '旅游',
    emoji: '✈️',
    audience: '旅行爱好者+自由行游客，关心路线、花费、体验感、出片',
    mustInclude: '目的地、交通路线、住宿推荐、预算参考、打卡机位',
    avoidList: '模糊行程、虚假种草、过度滤镜、忽略安全提示',
    opener: '从"一个绝美机位"或"踩坑经历"切入',
    cta: '"你去过最难忘的地方是？评论区分享"',
    recLength: '400-1000 字',
    recStyle: ['story', 'planting', 'healing'],
  },
];

// ─── AI 生图：8 个快捷预设 ─────────────────────────────────

export interface ImagePreset {
  id: string;
  label: string;
  emoji: string;
  ratio: string;
  style: string;
  promptHint: string;     // 拼接进 prompt 的模板片段
  palette: 'coral' | 'neon' | 'forest' | 'dark';
  recommendedWords: string;  // 推荐关键词（用 | 分隔）
}

export const IMAGE_PRESETS: ImagePreset[] = [
  {
    id: 'xiaohongshu',
    label: '小红书封面',
    emoji: '📱',
    ratio: '1:1',
    style: '写实摄影',
    palette: 'coral',
    promptHint: '明亮、产品突出、留白构图、社交媒体封面感',
    recommendedWords: '氛围感|治愈|ins风|出片|少女心',
  },
  {
    id: 'wechat',
    label: '公众号头图',
    emoji: '📰',
    ratio: '16:9',
    style: '极简主义',
    palette: 'neon',
    promptHint: '简约、专业、大量留白、横向构图、便于叠加标题',
    recommendedWords: '商务|专业|理性|深度|观点',
  },
  {
    id: 'douyin',
    label: '抖音封面',
    emoji: '🎬',
    ratio: '9:16',
    style: '3D渲染',
    palette: 'dark',
    promptHint: '醒目、人物居中、视觉冲击强、暗色调突出人物',
    recommendedWords: '爆款|冲击|故事感|人物|情绪',
  },
  {
    id: 'product',
    label: '产品主图',
    emoji: '📦',
    ratio: '1:1',
    style: '写实摄影',
    palette: 'forest',
    promptHint: '白底/纯色底、产品居中、电商风格、突出细节',
    recommendedWords: '极简|电商|白底|质感|细节',
  },
  {
    id: 'wallpaper',
    label: '手机壁纸',
    emoji: '🌌',
    ratio: '9:16',
    style: '国潮风格',
    palette: 'dark',
    promptHint: '高清壁纸、意境深远、纵深感强、竖屏构图',
    recommendedWords: '意境|氛围|高级|质感|静谧',
  },
  {
    id: 'poster',
    label: '海报',
    emoji: '🪧',
    ratio: '3:4',
    style: '国潮风格',
    palette: 'neon',
    promptHint: '文字醒目、构图紧凑、视觉张力、品牌感',
    recommendedWords: '设计感|张力和|醒眼|高端|品牌',
  },
  {
    id: 'moments',
    label: '朋友圈配图',
    emoji: '☕',
    ratio: '1:1',
    style: '复古胶片',
    palette: 'coral',
    promptHint: '生活感、温暖、随性、抓拍感、胶片颗粒',
    recommendedWords: '生活|日常|温度|故事|治愈',
  },
  {
    id: 'avatar',
    label: '头像',
    emoji: '🙂',
    ratio: '1:1',
    style: '插画风格',
    palette: 'forest',
    promptHint: '人物居中、表情清晰、背景简洁、半身或大头像',
    recommendedWords: '形象|简洁|人物|表情|识别度',
  },
];

// ─── AI 生图：色调参考（保留并强化） ──────────────────────

export interface ImagePalette {
  id: 'coral' | 'neon' | 'forest' | 'dark';
  name: string;
  emoji: string;
  colors: string[];
  desc: string;
}

export const IMAGE_PALETTES: ImagePalette[] = [
  { id: 'coral', name: '珊瑚粉', emoji: '🌸', colors: ['#F43F5E', '#FB923C', '#FBBF24'], desc: '温暖、女性、活力' },
  { id: 'neon', name: '霓虹蓝', emoji: '💙', colors: ['#3B82F6', '#8B5CF6', '#0EA5E9'], desc: '科技、专业、未来' },
  { id: 'forest', name: '森系绿', emoji: '🌿', colors: ['#22C55E', '#10B981', '#84CC16'], desc: '自然、清新、治愈' },
  { id: 'dark', name: '暗夜黑', emoji: '🖤', colors: ['#1F2937', '#374151', '#4B5563'], desc: '高级、神秘、质感' },
];

// ─── 工具函数 ──────────────────────────────────────────────

/** 根据 id 找行业模板 */
export function findIndustry(id: string): IndustryTemplate | undefined {
  return COPYWRITING_INDUSTRIES.find(i => i.id === id);
}

/** 根据 id 找预设 */
export function findImagePreset(id: string): ImagePreset | undefined {
  return IMAGE_PRESETS.find(p => p.id === id);
}

/** 根据 id 找调色板 */
export function findImagePalette(id: string): ImagePalette | undefined {
  return IMAGE_PALETTES.find(p => p.id === id);
}

/** 把"行业模板"渲染成可注入 prompt 的指令文本 */
export function renderIndustryInstruction(industry: IndustryTemplate): string {
  return [
    `【行业：${industry.name}】`,
    `目标受众：${industry.audience}`,
    `必含元素：${industry.mustInclude}`,
    `避坑项：${industry.avoidList}`,
    `开头钩子：${industry.opener}`,
    `CTA 句式：${industry.cta}`,
    `推荐长度：${industry.recLength}`,
  ].join('\n');
}
