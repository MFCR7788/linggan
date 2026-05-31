export interface PresetKeyword {
  keyword: string;
  desc?: string;
  platforms?: string[];
}

export interface PresetCategory {
  id: string;
  name: string;
  keywords: PresetKeyword[];
}

const ALL_PLATFORMS = ['weibo', 'zhihu', 'baidu', 'douyin', 'toutiao', 'bilibili', 'bing'];
const SOCIAL_PLATFORMS = ['weibo', 'zhihu', 'douyin', 'toutiao'];
const NEWS_PLATFORMS = ['baidu', 'toutiao', 'bing'];
const VIDEO_PLATFORMS = ['bilibili', 'douyin'];

export const PRESET_CATEGORIES: PresetCategory[] = [
  {
    id: 'ai-tech',
    name: '🤖 AI / 科技',
    keywords: [
      { keyword: 'AI大模型', desc: '大语言模型最新进展', platforms: ALL_PLATFORMS },
      { keyword: 'ChatGPT', desc: 'OpenAI产品动态', platforms: ALL_PLATFORMS },
      { keyword: 'Claude', platforms: ALL_PLATFORMS },
      { keyword: 'DeepSeek', desc: '国产大模型代表', platforms: ALL_PLATFORMS },
      { keyword: 'AI Agent', desc: '智能体应用', platforms: ALL_PLATFORMS },
      { keyword: '人工智能', desc: 'AI行业综合', platforms: ALL_PLATFORMS },
      { keyword: 'AI绘画', desc: 'AIGC图像生成', platforms: SOCIAL_PLATFORMS },
      { keyword: 'AI视频生成', desc: 'Sora/可灵等', platforms: SOCIAL_PLATFORMS },
      { keyword: 'AI编程', desc: 'Copilot/Cursor等', platforms: ALL_PLATFORMS },
      { keyword: '具身智能', desc: '机器人+AI', platforms: NEWS_PLATFORMS },
      { keyword: '自动驾驶', desc: 'FSD/华为智驾', platforms: NEWS_PLATFORMS },
      { keyword: '芯片', desc: 'GPU/AI芯片', platforms: NEWS_PLATFORMS },
      { keyword: '英伟达', platforms: ALL_PLATFORMS },
      { keyword: '苹果', desc: 'Apple新品/动态', platforms: ALL_PLATFORMS },
      { keyword: '华为', desc: '华为新品/技术', platforms: ALL_PLATFORMS },
    ],
  },
  {
    id: 'internet',
    name: '💻 互联网 / 创业',
    keywords: [
      { keyword: '创业', platforms: ALL_PLATFORMS },
      { keyword: '商业模式', platforms: NEWS_PLATFORMS },
      { keyword: '融资', desc: '创投融资动态', platforms: NEWS_PLATFORMS },
      { keyword: 'IPO', desc: '公司上市', platforms: NEWS_PLATFORMS },
      { keyword: '字节跳动', platforms: ALL_PLATFORMS },
      { keyword: '腾讯', platforms: ALL_PLATFORMS },
      { keyword: '阿里巴巴', platforms: ALL_PLATFORMS },
      { keyword: '小米', platforms: ALL_PLATFORMS },
      { keyword: '拼多多', platforms: NEWS_PLATFORMS },
      { keyword: '出海', desc: '中国企业出海', platforms: ALL_PLATFORMS },
      { keyword: '产品经理', platforms: SOCIAL_PLATFORMS },
      { keyword: '独立开发者', platforms: SOCIAL_PLATFORMS },
      { keyword: '开源', platforms: ALL_PLATFORMS },
      { keyword: 'GitHub', platforms: ALL_PLATFORMS },
    ],
  },
  {
    id: 'content',
    name: '📝 自媒体 / 内容创作',
    keywords: [
      { keyword: '自媒体', platforms: ALL_PLATFORMS },
      { keyword: '短视频', platforms: VIDEO_PLATFORMS },
      { keyword: '内容创作', platforms: SOCIAL_PLATFORMS },
      { keyword: '小红书运营', platforms: SOCIAL_PLATFORMS },
      { keyword: '抖音运营', platforms: ['douyin'] },
      { keyword: 'B站UP主', platforms: ['bilibili'] },
      { keyword: '公众号', platforms: ['weibo', 'zhihu'] },
      { keyword: '个人IP', desc: '个人品牌打造', platforms: SOCIAL_PLATFORMS },
      { keyword: '涨粉', platforms: SOCIAL_PLATFORMS },
      { keyword: '变现', desc: '内容变现模式', platforms: ALL_PLATFORMS },
      { keyword: '直播带货', platforms: ['douyin', 'weibo'] },
      { keyword: '私域流量', platforms: SOCIAL_PLATFORMS },
    ],
  },
  {
    id: 'design',
    name: '🎨 设计 / 创意',
    keywords: [
      { keyword: 'UI设计', platforms: SOCIAL_PLATFORMS },
      { keyword: '平面设计', platforms: SOCIAL_PLATFORMS },
      { keyword: '设计趋势', platforms: ALL_PLATFORMS },
      { keyword: 'Figma', platforms: ALL_PLATFORMS },
      { keyword: '品牌设计', platforms: SOCIAL_PLATFORMS },
      { keyword: 'AIGC设计', desc: 'AI辅助设计', platforms: ALL_PLATFORMS },
      { keyword: '用户体验', platforms: SOCIAL_PLATFORMS },
      { keyword: '交互设计', platforms: SOCIAL_PLATFORMS },
      { keyword: '插画', platforms: SOCIAL_PLATFORMS },
    ],
  },
  {
    id: 'marketing',
    name: '📊 营销 / 运营',
    keywords: [
      { keyword: '营销', platforms: ALL_PLATFORMS },
      { keyword: '品牌营销', platforms: SOCIAL_PLATFORMS },
      { keyword: '增长黑客', platforms: SOCIAL_PLATFORMS },
      { keyword: '用户增长', platforms: SOCIAL_PLATFORMS },
      { keyword: 'SEO', platforms: ['bing', 'baidu'] },
      { keyword: '社交媒体营销', platforms: SOCIAL_PLATFORMS },
      { keyword: '内容营销', platforms: SOCIAL_PLATFORMS },
      { keyword: '转化率优化', platforms: NEWS_PLATFORMS },
      { keyword: '数据分析', platforms: ALL_PLATFORMS },
      { keyword: '跨境电商', platforms: ALL_PLATFORMS },
    ],
  },
  {
    id: 'gaming',
    name: '🎮 游戏 / 电竞',
    keywords: [
      { keyword: '电竞', platforms: ALL_PLATFORMS },
      { keyword: 'LOL', desc: '英雄联盟', platforms: ['bilibili', 'douyin', 'weibo'] },
      { keyword: '王者荣耀', platforms: ['bilibili', 'douyin', 'weibo'] },
      { keyword: '原神', platforms: ['bilibili', 'weibo'] },
      { keyword: '黑神话悟空', platforms: ALL_PLATFORMS },
      { keyword: '游戏产业', platforms: NEWS_PLATFORMS },
      { keyword: 'Steam', platforms: ['bilibili', 'zhihu'] },
      { keyword: '独立游戏', platforms: ['bilibili', 'zhihu'] },
      { keyword: '游戏版号', platforms: NEWS_PLATFORMS },
      { keyword: '米哈游', platforms: ALL_PLATFORMS },
      { keyword: '腾讯游戏', platforms: ALL_PLATFORMS },
    ],
  },
  {
    id: 'entertainment',
    name: '🎬 影视 / 娱乐',
    keywords: [
      { keyword: '电影票房', platforms: ['weibo', 'douyin', 'zhihu'] },
      { keyword: '春节档', platforms: SOCIAL_PLATFORMS },
      { keyword: '国产剧', platforms: ['weibo', 'douyin'] },
      { keyword: '综艺', platforms: ['weibo', 'douyin'] },
      { keyword: '动漫', platforms: ['bilibili', 'weibo'] },
      { keyword: '短剧', desc: '竖屏短剧/微短剧', platforms: ['douyin', 'weibo'] },
      { keyword: '演唱会', platforms: ['weibo', 'douyin'] },
      { keyword: '明星', platforms: ['weibo', 'douyin'] },
      { keyword: '奥斯卡', platforms: ALL_PLATFORMS },
      { keyword: 'Netflix', platforms: ALL_PLATFORMS },
    ],
  },
  {
    id: 'finance',
    name: '💰 金融 / 财经',
    keywords: [
      { keyword: '股市', platforms: NEWS_PLATFORMS },
      { keyword: 'A股', platforms: NEWS_PLATFORMS },
      { keyword: '美股', platforms: ALL_PLATFORMS },
      { keyword: '比特币', platforms: ALL_PLATFORMS },
      { keyword: '加密货币', platforms: ALL_PLATFORMS },
      { keyword: '美联储', platforms: NEWS_PLATFORMS },
      { keyword: '央行', platforms: NEWS_PLATFORMS },
      { keyword: '黄金', platforms: NEWS_PLATFORMS },
      { keyword: '基金', platforms: NEWS_PLATFORMS },
      { keyword: '理财产品', platforms: NEWS_PLATFORMS },
      { keyword: '保险', platforms: NEWS_PLATFORMS },
      { keyword: '房价', platforms: ALL_PLATFORMS },
    ],
  },
  {
    id: 'education',
    name: '📚 教育 / 知识',
    keywords: [
      { keyword: '高考', platforms: ALL_PLATFORMS },
      { keyword: '考研', platforms: ['zhihu', 'weibo'] },
      { keyword: '考公', desc: '公务员考试', platforms: ['zhihu', 'weibo'] },
      { keyword: '留学', platforms: ['zhihu', 'weibo'] },
      { keyword: '职业教育', platforms: NEWS_PLATFORMS },
      { keyword: '知识付费', platforms: SOCIAL_PLATFORMS },
      { keyword: '在线教育', platforms: NEWS_PLATFORMS },
      { keyword: '编程入门', platforms: ['bilibili', 'zhihu'] },
      { keyword: '读书', platforms: ['zhihu', 'douyin'] },
      { keyword: '英语学习', platforms: ['bilibili', 'zhihu'] },
    ],
  },
  {
    id: 'ecommerce',
    name: '🛒 消费 / 电商',
    keywords: [
      { keyword: '电商', platforms: ALL_PLATFORMS },
      { keyword: '双十一', platforms: SOCIAL_PLATFORMS },
      { keyword: '618', platforms: SOCIAL_PLATFORMS },
      { keyword: '直播带货', platforms: ['douyin', 'weibo'] },
      { keyword: '国货', desc: '国产品牌崛起', platforms: SOCIAL_PLATFORMS },
      { keyword: '新消费', platforms: SOCIAL_PLATFORMS },
      { keyword: '消费降级', platforms: ALL_PLATFORMS },
      { keyword: '外卖', platforms: ['weibo', 'douyin'] },
      { keyword: '奶茶', desc: '新茶饮品牌', platforms: ['weibo', 'douyin', 'zhihu'] },
      { keyword: '咖啡', desc: '瑞幸/库迪等', platforms: ['weibo', 'douyin'] },
    ],
  },
  {
    id: 'auto',
    name: '🚗 汽车 / 出行',
    keywords: [
      { keyword: '新能源汽车', platforms: ALL_PLATFORMS },
      { keyword: '比亚迪', platforms: ALL_PLATFORMS },
      { keyword: '特斯拉', platforms: ALL_PLATFORMS },
      { keyword: '小米汽车', platforms: ALL_PLATFORMS },
      { keyword: '华为智驾', platforms: ALL_PLATFORMS },
      { keyword: '理想汽车', platforms: ALL_PLATFORMS },
      { keyword: '自动驾驶', platforms: NEWS_PLATFORMS },
      { keyword: '固态电池', platforms: NEWS_PLATFORMS },
      { keyword: '飞行汽车', platforms: ALL_PLATFORMS },
      { keyword: '网约车', platforms: ['weibo', 'douyin'] },
    ],
  },
  {
    id: 'realestate',
    name: '🏠 房产 / 家居',
    keywords: [
      { keyword: '房地产', platforms: ALL_PLATFORMS },
      { keyword: '房价', platforms: ALL_PLATFORMS },
      { keyword: '房贷利率', platforms: NEWS_PLATFORMS },
      { keyword: '保障房', platforms: NEWS_PLATFORMS },
      { keyword: '智能家居', platforms: ALL_PLATFORMS },
      { keyword: '装修', platforms: ['douyin', 'zhihu'] },
      { keyword: '租房', platforms: ['weibo', 'zhihu'] },
      { keyword: '公积金', platforms: ['baidu', 'toutiao'] },
    ],
  },
  {
    id: 'health',
    name: '🏥 医疗 / 健康',
    keywords: [
      { keyword: '医保', platforms: NEWS_PLATFORMS },
      { keyword: '创新药', platforms: NEWS_PLATFORMS },
      { keyword: '减肥', platforms: ['douyin', 'weibo', 'zhihu'] },
      { keyword: '健身', platforms: ['douyin', 'bilibili'] },
      { keyword: '心理健康', platforms: SOCIAL_PLATFORMS },
      { keyword: '医美', platforms: ['douyin', 'weibo'] },
      { keyword: '养生', platforms: ['douyin', 'weibo'] },
      { keyword: '睡眠', platforms: ['zhihu', 'douyin'] },
      { keyword: 'AI医疗', desc: 'AI辅助诊断', platforms: NEWS_PLATFORMS },
      { keyword: '基因编辑', platforms: NEWS_PLATFORMS },
    ],
  },
];

/** 获取所有预设关键词文本列表（用于快速索引） */
export function getAllPresetKeywords(): string[] {
  const keywords = new Set<string>();
  for (const cat of PRESET_CATEGORIES) {
    for (const kw of cat.keywords) {
      keywords.add(kw.keyword);
    }
  }
  return [...keywords];
}

/** 根据关键词文本查找所属分类 */
export function getCategoryByKeyword(keyword: string): string | undefined {
  for (const cat of PRESET_CATEGORIES) {
    if (cat.keywords.some(k => k.keyword === keyword)) {
      return cat.id;
    }
  }
  return undefined;
}
