// 灵集账号类型 + 智能推荐组合
// 媒体运营官进灵集后,根据账号类型自动推荐 3-4 套视频组合 + 4 步流水线 SOP
// 复用 src/lib/preset-templates.ts 的 COPYWRITING_TYPES / STYLE_PRESETS / COPYWRITING_INDUSTRIES

import { COPYWRITING_TYPES, COPYWRITING_INDUSTRIES, COPYWRITING_STYLES } from './preset-templates';

// ─── 类型定义 ──────────────────────────────────────────────

export type AccountTypeId =
  | 'startup'      // 初创公司
  | 'knowledge'    // 知识IP
  | 'ecommerce'    // 电商品牌
  | 'b2b'          // B2B企业
  | 'personal'     // 个人创作者
  | 'training'     // 教培
  | 'restaurant'   // 餐饮
  | 'medical'      // 医美
  | 'real_estate'  // 房产
  | 'travel'       // 旅游
  | 'parenting'    // 母婴亲子
  | 'fitness'      // 健身运动
  | 'pet'          // 宠物
  | 'home_decor';  // 家居装修

// 灵集核心入口路径
export type LingjiEntry =
  | '/inspiration'        // 灵感库
  | '/ai/copywriting'     // AI 文案
  | '/ai/image'           // AI 图片
  | '/ai/image-editor'    // AI 图片编辑
  | '/ai/digital-human'   // AI 数字人
  | '/ai/video'           // AI 视频合成
  | '/ai/ads'             // 朋友圈 9 宫格
  | '/publish'            // 多平台分发
  | '/ai/tts'             // AI 配音
  | '/hotspot';           // 热点监控

// 单个推荐组合(4 步流水线)
export interface RecommendationCombo {
  id: string;
  title: string;
  emoji: string;
  desc: string;            // 一句话说明(显示在卡片上)
  steps: { label: string; entry: LingjiEntry; paramKey?: string; role?: string }[];
  // 预填参数(用于"开始这套"按钮的 handoff URL)
  prefills?: Partial<Record<
    'topic' | 'industry' | 'style' | 'preset' | 'language' | 'palette' | 'ratio' | 'script',
    string
  >>;
}

// ─── 节点默认角色（按入口类型） ────────────────────────────
export const DEFAULT_STEP_ROLES: Record<LingjiEntry, string> = {
  '/ai/copywriting': '你是一个专业的内容创作者，擅长根据素材和话题生成高质量文案，能够适配不同平台和风格的创作需求。',
  '/ai/image': '你是一个专业的AI视觉设计师，擅长将文字描述转化为高质量的视觉画面，注重构图、光影和色彩搭配。',
  '/ai/video': '你是一个专业的短视频导演，擅长将文案脚本转化为视觉分镜方案，注重节奏感和画面冲击力。',
  '/ai/digital-human': '你是一个专业的数字人口播主播，擅长用自然生动的表达传递信息，让观众有面对面交流的亲切感。',
  '/ai/tts': '你是一个专业的配音师，擅长根据文案内容选择最合适的语音语调，让声音表达富有感染力。',
  '/ai/ads': '你是一个社交媒体视觉内容设计师，擅长制作吸引眼球、高互动率的多图内容和9宫格排版。',
  '/ai/image-editor': '你是一个专业的图片后期专家，擅长图片优化、调色和视觉增强。',
  '/inspiration': '',
  '/hotspot': '',
  '/publish': '',
};

/** 获取节点的角色描述（先取步骤自定义，再取入口默认，没有则返回空字符串） */
export function getStepRole(entry: string, stepRole?: string): string {
  if (stepRole) return stepRole;
  return (DEFAULT_STEP_ROLES as Record<string, string>)[entry] || '';
}

export interface AccountTypePreset {
  id: AccountTypeId;
  label: string;
  emoji: string;
  desc: string;            // 一句话简介
  audience: string;        // 适用人群
  recommendedStyles: string[];      // 从 STYLE_PRESETS 挑
  recommendedIndustries: string[];  // 从 COPYWRITING_INDUSTRIES 挑
  recommendedPlatforms: string[];   // 从 COPYWRITING_TYPES 挑
  combos: RecommendationCombo[];    // 3-4 个推荐组合
}

// ─── 8 个账号类型预设 ──────────────────────────────────────

export const ACCOUNT_TYPE_PRESETS: AccountTypePreset[] = [
  // ─── 1. 初创 ────────────────────────────────────────────
  {
    id: 'startup',
    label: '初创公司',
    emoji: '🚀',
    desc: '资源少要快速出片,产品种草 + 创始人 IP 双轮驱动',
    audience: 'A 轮前 / 早期创业团队 / 个人创业 + 1-2 助手',
    recommendedStyles: ['planting', 'story', 'passionate'],
    recommendedIndustries: ['general', 'digital'],
    recommendedPlatforms: ['xiaohongshu', 'douyin', 'script'],
    combos: [
      {
        id: 'startup-product',
        title: '产品种草一条龙',
        emoji: '🎁',
        desc: '产品图 + 卖点 → 9 宫格 + 短视频,直接发小红书/抖音',
        steps: [
          { label: '选产品图', entry: '/inspiration' },
          { label: 'AI 文案', entry: '/ai/copywriting', paramKey: 'topic' },
          { label: '朋友圈 9 宫格', entry: '/ai/ads' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { topic: '新品种草', style: 'planting', industry: 'general' },
      },
      {
        id: 'startup-founder',
        title: '创始人 IP 速成',
        emoji: '👤',
        desc: '头像 → AI 数字人口播 → 多平台分发,1 分钟日更',
        steps: [
          { label: '一键生数字人', entry: '/ai/digital-human' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { topic: '创业故事', language: 'zh' },
      },
      {
        id: 'startup-story',
        title: '品牌故事短片',
        emoji: '🎬',
        desc: '主题 → 故事脚本 → AI 视频分镜 → AI 视频合成 + 字幕',
        steps: [
          { label: 'AI 写故事', entry: '/ai/copywriting' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { topic: '我的创业故事', style: 'story', industry: 'general' },
      },
    ],
  },

  // ─── 2. 知识 IP ─────────────────────────────────────────
  {
    id: 'knowledge',
    label: '知识 IP',
    emoji: '📚',
    desc: '深耕专业领域,口播知识 + 长文转视频双输出',
    audience: '律师/医生/财税/职场顾问/咨询师等专业 IP',
    recommendedStyles: ['science', 'analysis', 'tutorial'],
    recommendedIndustries: ['education', 'legal', 'finance', 'career', 'medical'],
    recommendedPlatforms: ['xiaohongshu', 'wechat_article', 'zhihu', 'script'],
    combos: [
      {
        id: 'knowledge-oral',
        title: '口播知识日更',
        emoji: '🎙️',
        desc: '主题 → 科普文案 → AI 数字人口播 → 多平台分发',
        steps: [
          { label: 'AI 写科普', entry: '/ai/copywriting' },
          { label: 'AI 数字人', entry: '/ai/digital-human' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { topic: '专业知识科普', style: 'science', industry: 'education' },
      },
      {
        id: 'knowledge-article2video',
        title: '长文转视频',
        emoji: '📰',
        desc: '公众号长文 → 摘要 → 分镜 → AI 视频 → 字幕',
        steps: [
          { label: '贴文章 URL', entry: '/inspiration' },
          { label: 'AI 文案提炼', entry: '/ai/copywriting' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'analysis', industry: 'education' },
      },
      {
        id: 'knowledge-insight',
        title: '行业洞察短评',
        emoji: '🔍',
        desc: '热点话题 → 深度评论 → AI 数字人 → 视频号/抖音',
        steps: [
          { label: '选热点', entry: '/hotspot' },
          { label: '写深度评论', entry: '/ai/copywriting' },
          { label: 'AI 数字人', entry: '/ai/digital-human' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'analysis', industry: 'general' },
      },
    ],
  },

  // ─── 3. 电商品牌 ────────────────────────────────────────
  {
    id: 'ecommerce',
    label: '电商品牌',
    emoji: '🛒',
    desc: '卖货导向,产品 360° + 9 宫格 + 直播切片三件套',
    audience: '美妆/穿搭/美食/3C 等 DTC 品牌、淘宝店、跨境电商',
    recommendedStyles: ['planting', 'selling', 'story'],
    recommendedIndustries: ['beauty', 'fashion', 'food', 'digital'],
    recommendedPlatforms: ['xiaohongshu', 'douyin', 'kuaishou'],
    combos: [
      {
        id: 'ecom-9grid',
        title: '小红书 9 宫格种草',
        emoji: '🎯',
        desc: '产品 + 3-5 卖点 → 9 张 1:1 封面 + 标题 ZIP',
        steps: [
          { label: '上传产品图', entry: '/inspiration' },
          { label: 'AI 文案 9 卖点', entry: '/ai/copywriting' },
          { label: '朋友圈 9 宫格', entry: '/ai/ads' },
        ],
        prefills: { style: 'planting', industry: 'beauty' },
      },
      {
        id: 'ecom-360',
        title: '产品 360° 展示',
        emoji: '🔄',
        desc: '产品图 → AI 多角度生图 → AI 图生视频 → 合并',
        steps: [
          { label: 'AI 多角度生图', entry: '/ai/image' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { preset: 'product_main', style: 'planting' },
      },
      {
        id: 'ecom-xhs',
        title: '小红书爆款笔记',
        emoji: '📱',
        desc: '主题 → 种草文案 → AI 封面图 → 多平台分发',
        steps: [
          { label: 'AI 写种草', entry: '/ai/copywriting' },
          { label: 'AI 封面图', entry: '/ai/image' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'planting', industry: 'beauty' },
      },
    ],
  },

  // ─── 4. B2B 企业 ────────────────────────────────────────
  {
    id: 'b2b',
    label: 'B2B 企业',
    emoji: '🏢',
    desc: '企业客户决策,行业洞察 + 客户案例 + 产品演示',
    audience: 'SaaS / 工业品 / 企业服务 / 咨询公司',
    recommendedStyles: ['analysis', 'science', 'tutorial'],
    recommendedIndustries: ['general', 'digital', 'legal', 'finance'],
    recommendedPlatforms: ['wechat_article', 'zhihu', 'bilibili', 'script'],
    combos: [
      {
        id: 'b2b-insight',
        title: '行业洞察短评',
        emoji: '📊',
        desc: '行业话题 → 深度评论 → AI 数字人 → 视频号',
        steps: [
          { label: '写深度评论', entry: '/ai/copywriting' },
          { label: 'AI 数字人', entry: '/ai/digital-human' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'analysis', industry: 'general' },
      },
      {
        id: 'b2b-case',
        title: '客户案例片',
        emoji: '📋',
        desc: '客户案例 → 文案 → AI 配图 → 视频合成',
        steps: [
          { label: 'AI 提炼', entry: '/ai/copywriting' },
          { label: 'AI 配图', entry: '/ai/image' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'tutorial', industry: 'digital' },
      },
      {
        id: 'b2b-demo',
        title: '产品演示教程',
        emoji: '🎓',
        desc: '产品功能 → 教程文案 → 分镜 → AI 视频',
        steps: [
          { label: 'AI 教程文案', entry: '/ai/copywriting', role: '你需要为产品功能介绍视频撰写口播脚本。要求：1. 开头3秒用痛点或悬念吸引注意力 2. 按模块逐个介绍功能，每个功能附带画面建议[画面：xxx] 3. 语言口语化、有节奏感，像真人讲解 4. 总时长控制在60-90秒的口播量（约200-300字）' },
          { label: 'AI 视频合成', entry: '/ai/video', role: '你是一个产品演示视频导演。根据脚本中的[画面：xxx]提示生成对应的演示画面，运镜平稳，字幕清晰，整体风格专业现代。' },
        ],
        prefills: { topic: '产品功能介绍与使用教程', style: 'script', industry: 'digital' },
      },
    ],
  },

  // ─── 5. 个人创作者 ──────────────────────────────────────
  {
    id: 'personal',
    label: '个人创作者',
    emoji: '🌟',
    desc: '个人风格化,情感故事 + 个人 IP + Vlog',
    audience: '自由职业 / 博主 / 自媒体 / 内容创作者',
    recommendedStyles: ['resonant', 'story', 'joke'],
    recommendedIndustries: ['general'],
    recommendedPlatforms: ['xiaohongshu', 'douyin', 'weibo', 'bilibili'],
    combos: [
      {
        id: 'personal-resonant',
        title: '情感共鸣短文',
        emoji: '💭',
        desc: '心情主题 → 共鸣文案 → AI 配图 → 多平台',
        steps: [
          { label: 'AI 共鸣文案', entry: '/ai/copywriting' },
          { label: 'AI 配图', entry: '/ai/image' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'resonant', industry: 'general' },
      },
      {
        id: 'personal-ip',
        title: '个人 IP 数字分身',
        emoji: '👤',
        desc: '头像 → AI 数字人口播 → 1 套形象日更',
        steps: [
          { label: '一键生数字人', entry: '/ai/digital-human' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { topic: '我的日常', style: 'resonant' },
      },
      {
        id: 'personal-vlog',
        title: '故事 Vlog',
        emoji: '📖',
        desc: '主题 → 故事脚本 → 分镜 → AI 视频合成',
        steps: [
          { label: 'AI 写故事', entry: '/ai/copywriting' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'story', industry: 'general' },
      },
    ],
  },

  // ─── 6. 教培 ────────────────────────────────────────────
  {
    id: 'training',
    label: '教培',
    emoji: '🎓',
    desc: '知识培训机构,课程片段 + 知识科普 + 学员见证',
    audience: 'K12 / 职业培训 / 兴趣教育 / 语言培训',
    recommendedStyles: ['science', 'tutorial', 'passionate'],
    recommendedIndustries: ['education', 'training', 'study_abroad'],
    recommendedPlatforms: ['wechat_article', 'xiaohongshu', 'bilibili', 'script'],
    combos: [
      {
        id: 'training-course',
        title: '课程片段日更',
        emoji: '📚',
        desc: '课程要点 → 教程文案 → AI 数字人口播 → 矩阵分发',
        steps: [
          { label: 'AI 写教程', entry: '/ai/copywriting' },
          { label: 'AI 数字人', entry: '/ai/digital-human' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'tutorial', industry: 'education' },
      },
      {
        id: 'training-science',
        title: '知识科普爆款',
        emoji: '🔬',
        desc: '科普主题 → 干货文案 → AI 视频分镜 → B站/抖音',
        steps: [
          { label: 'AI 写科普', entry: '/ai/copywriting' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'science', industry: 'education' },
      },
      {
        id: 'training-testimonial',
        title: '学员见证短片',
        emoji: '🏆',
        desc: '学员故事 → 文案 → 分镜 → AI 视频合成',
        steps: [
          { label: 'AI 提炼', entry: '/ai/copywriting' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'story', industry: 'education' },
      },
    ],
  },

  // ─── 7. 餐饮 ────────────────────────────────────────────
  {
    id: 'restaurant',
    label: '餐饮',
    emoji: '🍜',
    desc: '餐饮探店,菜品展示 + 9 宫格 + 品牌故事',
    audience: '餐厅 / 探店博主 / 食品品牌 / 茶饮咖啡',
    recommendedStyles: ['planting', 'story', 'joke'],
    recommendedIndustries: ['food', 'restaurant'],
    recommendedPlatforms: ['xiaohongshu', 'douyin', 'kuaishou'],
    combos: [
      {
        id: 'restaurant-9grid',
        title: '探店 9 宫格',
        emoji: '📸',
        desc: '菜品 + 3-5 卖点 → 9 张 1:1 封面 + 标题',
        steps: [
          { label: '上传菜品图', entry: '/inspiration' },
          { label: 'AI 文案 9 卖点', entry: '/ai/copywriting' },
          { label: '朋友圈 9 宫格', entry: '/ai/ads' },
        ],
        prefills: { style: 'planting', industry: 'food' },
      },
      {
        id: 'restaurant-dish',
        title: '菜品 360° 展示',
        emoji: '🍱',
        desc: '菜品图 → AI 多角度 → AI 图生视频 → 合并',
        steps: [
          { label: 'AI 多角度生图', entry: '/ai/image' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { preset: 'product_main', style: 'planting', industry: 'food' },
      },
      {
        id: 'restaurant-story',
        title: '品牌故事短片',
        emoji: '👨‍🍳',
        desc: '餐厅故事 → 故事脚本 → 分镜 → AI 视频',
        steps: [
          { label: 'AI 写故事', entry: '/ai/copywriting' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'story', industry: 'food' },
      },
    ],
  },

  // ─── 8. 医美 ────────────────────────────────────────────
  {
    id: 'medical',
    label: '医美',
    emoji: '💉',
    desc: '医美机构,知识科普 + 案例对比 + 咨询师 IP',
    audience: '医美机构 / 美容皮肤科 / 抗衰中心 / 牙科',
    recommendedStyles: ['science', 'analysis', 'resonant'],
    recommendedIndustries: ['beauty_medical', 'medical'],
    recommendedPlatforms: ['xiaohongshu', 'douyin', 'wechat_article'],
    combos: [
      {
        id: 'medical-science',
        title: '医美知识科普',
        emoji: '🔬',
        desc: '医美主题 → 科普文案 → AI 数字人口播 → 分发',
        steps: [
          { label: 'AI 写科普', entry: '/ai/copywriting' },
          { label: 'AI 数字人', entry: '/ai/digital-human' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'science', industry: 'beauty_medical' },
      },
      {
        id: 'medical-case',
        title: '案例对比片',
        emoji: '📊',
        desc: '案例对比 → 文案 → AI 配图 → AI 视频',
        steps: [
          { label: 'AI 提炼对比', entry: '/ai/copywriting' },
          { label: 'AI 配图', entry: '/ai/image' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'analysis', industry: 'beauty_medical' },
      },
      {
        id: 'medical-consultant',
        title: '咨询师 IP',
        emoji: '👩‍⚕️',
        desc: '咨询师头像 → AI 数字人 → 知识口播 → 矩阵分发',
        steps: [
          { label: '一键生数字人', entry: '/ai/digital-human' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { topic: '医美知识', style: 'science', industry: 'beauty_medical' },
      },
    ],
  },

  // ─── 9. 房产 ────────────────────────────────────────────
  {
    id: 'real_estate',
    label: '房产',
    emoji: '🏠',
    desc: '房源展示 + 小区讲解 + 看房视频，新房二手都适用',
    audience: '房产中介 / 新房销售 / 租赁代理 / 个人房东',
    recommendedStyles: ['tutorial', 'analysis', 'planting'],
    recommendedIndustries: ['real_estate', 'general'],
    recommendedPlatforms: ['xiaohongshu', 'douyin', 'wechat_article', 'script'],
    combos: [
      {
        id: 'realestate-listing',
        title: '房源短视频',
        emoji: '🏡',
        desc: '户型图 + 卖点 → AI 文案 → AI 视频 → 多平台分发',
        steps: [
          { label: '选素材图', entry: '/inspiration' },
          { label: 'AI 写房源文案', entry: '/ai/copywriting', paramKey: 'topic' },
          { label: 'AI 视频合成', entry: '/ai/video' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { topic: '精品房源推荐', style: 'planting', industry: 'real_estate' },
      },
      {
        id: 'realestate-tour',
        title: '小区讲解片',
        emoji: '🏘️',
        desc: '小区配套 → 深度文案 → AI 数字人口播 → 分发',
        steps: [
          { label: 'AI 写讲解稿', entry: '/ai/copywriting' },
          { label: 'AI 数字人', entry: '/ai/digital-human' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'analysis', industry: 'real_estate' },
      },
      {
        id: 'realestate-renovation',
        title: '装修前后对比',
        emoji: '🔨',
        desc: '改造前图 → AI 效果图 → 前后对比 → 短片合成',
        steps: [
          { label: 'AI 设计效果图', entry: '/ai/image' },
          { label: 'AI 视频合成', entry: '/ai/video' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { preset: 'product_main', style: 'tutorial', industry: 'home' },
      },
    ],
  },

  // ─── 10. 旅游 ────────────────────────────────────────────
  {
    id: 'travel',
    label: '旅游',
    emoji: '✈️',
    desc: '攻略/游记/酒店种草，旅行博主 + OTA 运营必备',
    audience: '旅行社 / 酒店民宿 / 景区 / 旅行博主 / OTA 运营',
    recommendedStyles: ['story', 'planting', 'healing'],
    recommendedIndustries: ['travel', 'food', 'general'],
    recommendedPlatforms: ['xiaohongshu', 'douyin', 'wechat_article', 'bilibili'],
    combos: [
      {
        id: 'travel-guide',
        title: '旅行攻略 Vlog',
        emoji: '🗺️',
        desc: '目的地 → 攻略文案 → 景点图片 → AI 视频 + BGM',
        steps: [
          { label: 'AI 写攻略文', entry: '/ai/copywriting' },
          { label: 'AI 配景点图', entry: '/ai/image' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'story', industry: 'travel' },
      },
      {
        id: 'travel-hotel',
        title: '酒店/民宿种草',
        emoji: '🏨',
        desc: '房型图 + 亮点 → 种草文案 → 9 宫格 → 分发',
        steps: [
          { label: '上传房型图', entry: '/inspiration' },
          { label: 'AI 写种草文', entry: '/ai/copywriting' },
          { label: '朋友圈 9 宫格', entry: '/ai/ads' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'planting', industry: 'travel' },
      },
      {
        id: 'travel-scene',
        title: '景点大片拍摄',
        emoji: '📸',
        desc: '景点 → 出片攻略 → AI 封面图 → AI 短片',
        steps: [
          { label: 'AI 写出片指南', entry: '/ai/copywriting' },
          { label: 'AI 封面配图', entry: '/ai/image' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'healing', industry: 'travel' },
      },
    ],
  },

  // ─── 11. 母婴亲子 ────────────────────────────────────────
  {
    id: 'parenting',
    label: '母婴亲子',
    emoji: '🍼',
    desc: '育儿知识 + 用品种草 + 成长记录，宝妈博主核心场景',
    audience: '母婴博主 / 亲子机构 / 早教中心 / 母婴品牌',
    recommendedStyles: ['healing', 'science', 'planting'],
    recommendedIndustries: ['baby', 'education', 'general'],
    recommendedPlatforms: ['xiaohongshu', 'douyin', 'wechat_article'],
    combos: [
      {
        id: 'parenting-knowledge',
        title: '育儿知识科普',
        emoji: '📖',
        desc: '育儿主题 → 科普文案 → AI 数字人口播 → 分发',
        steps: [
          { label: 'AI 写科普', entry: '/ai/copywriting' },
          { label: 'AI 数字人', entry: '/ai/digital-human' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'science', industry: 'baby' },
      },
      {
        id: 'parenting-product',
        title: '母婴好物种草',
        emoji: '🎁',
        desc: '产品图 → 种草文案 → 9 宫格 → 分发',
        steps: [
          { label: '上传产品图', entry: '/inspiration' },
          { label: 'AI 写种草文', entry: '/ai/copywriting' },
          { label: '朋友圈 9 宫格', entry: '/ai/ads' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'planting', industry: 'baby' },
      },
      {
        id: 'parenting-story',
        title: '成长记录短片',
        emoji: '🎬',
        desc: '成长点滴 → 故事脚本 → AI 视频分镜 → 成片',
        steps: [
          { label: 'AI 写脚本', entry: '/ai/copywriting' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'story', industry: 'baby' },
      },
    ],
  },

  // ─── 12. 健身运动 ────────────────────────────────────────
  {
    id: 'fitness',
    label: '健身运动',
    emoji: '💪',
    desc: '教学跟练 + 饮食搭配 + 打卡激励，健身博主三件套',
    audience: '健身教练 / 健身房 / 运动品牌 / 健身博主',
    recommendedStyles: ['tutorial', 'passionate', 'science'],
    recommendedIndustries: ['fitness', 'general'],
    recommendedPlatforms: ['douyin', 'xiaohongshu', 'bilibili', 'script'],
    combos: [
      {
        id: 'fitness-tutorial',
        title: '动作教学短片',
        emoji: '🏋️',
        desc: '动作 → 教学文案 → AI 视频分镜 → 字幕 + BGM',
        steps: [
          { label: 'AI 写教学稿', entry: '/ai/copywriting' },
          { label: 'AI 视频合成', entry: '/ai/video' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'tutorial', industry: 'fitness' },
      },
      {
        id: 'fitness-meal',
        title: '健身饮食搭配',
        emoji: '🥗',
        desc: '食材 → 饮食文案 → AI 美食图 → 分发',
        steps: [
          { label: 'AI 写食谱文', entry: '/ai/copywriting' },
          { label: 'AI 配美食图', entry: '/ai/image' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'science', industry: 'fitness' },
      },
      {
        id: 'fitness-challenge',
        title: '打卡挑战激励',
        emoji: '🔥',
        desc: '挑战主题 → 励志文案 → AI 视频 → 分发',
        steps: [
          { label: 'AI 写励志文', entry: '/ai/copywriting' },
          { label: 'AI 视频合成', entry: '/ai/video' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'passionate', industry: 'fitness' },
      },
    ],
  },

  // ─── 13. 宠物 ────────────────────────────────────────────
  {
    id: 'pet',
    label: '宠物',
    emoji: '🐶',
    desc: '萌宠日常 + 用品推荐 + 养护知识，铲屎官内容矩阵',
    audience: '宠物博主 / 宠物店 / 宠物医院 / 宠物食品品牌',
    recommendedStyles: ['healing', 'story', 'planting'],
    recommendedIndustries: ['pet', 'general'],
    recommendedPlatforms: ['xiaohongshu', 'douyin', 'kuaishou'],
    combos: [
      {
        id: 'pet-daily',
        title: '萌宠日常 Vlog',
        emoji: '🐕',
        desc: '萌宠瞬间 → 文案 → AI 视频 → 多平台分发',
        steps: [
          { label: 'AI 写文案', entry: '/ai/copywriting' },
          { label: 'AI 视频合成', entry: '/ai/video' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'healing', industry: 'pet' },
      },
      {
        id: 'pet-product',
        title: '宠物用品种草',
        emoji: '🦴',
        desc: '产品图 → 种草文案 → 9 宫格封面 → 分发',
        steps: [
          { label: '上传产品图', entry: '/inspiration' },
          { label: 'AI 写种草文', entry: '/ai/copywriting' },
          { label: '朋友圈 9 宫格', entry: '/ai/ads' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'planting', industry: 'pet' },
      },
      {
        id: 'pet-guide',
        title: '宠物养护指南',
        emoji: '🏥',
        desc: '养护主题 → 科普文案 → AI 数字人 → 分发',
        steps: [
          { label: 'AI 写科普', entry: '/ai/copywriting' },
          { label: 'AI 数字人', entry: '/ai/digital-human' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'science', industry: 'pet' },
      },
    ],
  },

  // ─── 14. 家居装修 ────────────────────────────────────────
  {
    id: 'home_decor',
    label: '家居装修',
    emoji: '🛋️',
    desc: '设计案例 + 改造展示 + 好物推荐，装修博主全链路',
    audience: '室内设计师 / 装修公司 / 家居品牌 / 家居博主',
    recommendedStyles: ['tutorial', 'planting', 'healing'],
    recommendedIndustries: ['home', 'general'],
    recommendedPlatforms: ['xiaohongshu', 'douyin', 'bilibili'],
    combos: [
      {
        id: 'home-case',
        title: '设计案例展示',
        emoji: '📐',
        desc: '设计理念 → 文案 → AI 效果图 → 视频展示',
        steps: [
          { label: 'AI 写案文', entry: '/ai/copywriting' },
          { label: 'AI 效果图', entry: '/ai/image' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'tutorial', industry: 'home' },
      },
      {
        id: 'home-renovation',
        title: '改造前后对比',
        emoji: '🔨',
        desc: '改造前图 → AI 文案 → AI 效果图 → 前后对比视频',
        steps: [
          { label: '上传改造前图', entry: '/inspiration' },
          { label: 'AI 写改造故事', entry: '/ai/copywriting' },
          { label: 'AI 效果图', entry: '/ai/image' },
          { label: 'AI 视频合成', entry: '/ai/video' },
        ],
        prefills: { style: 'planting', industry: 'home' },
      },
      {
        id: 'home-items',
        title: '家居好物种草',
        emoji: '🪴',
        desc: '好物 → 种草文案 → AI 图片 → 分发',
        steps: [
          { label: 'AI 写种草文', entry: '/ai/copywriting' },
          { label: 'AI 配图', entry: '/ai/image' },
          { label: '多平台分发（开发中）', entry: '/publish' },
        ],
        prefills: { style: 'planting', industry: 'home' },
      },
    ],
  },
];

// ─── 工具函数 ──────────────────────────────────────────────

/** 查账号类型预设(找不到返回 null) */
export function getAccountTypePreset(id: string | null | undefined): AccountTypePreset | null {
  if (!id) return null;
  return ACCOUNT_TYPE_PRESETS.find((p) => p.id === id) ?? null;
}

/** 取账号类型的推荐组合(默认 3 个核心组合) */
export function getRecommendations(id: string | null | undefined): RecommendationCombo[] {
  const preset = getAccountTypePreset(id);
  return preset?.combos ?? [];
}

/** 取所有账号类型(给 settings / onboarding 用) */
export function getAllAccountTypes(): AccountTypePreset[] {
  return ACCOUNT_TYPE_PRESETS;
}

/** 把推荐行业 id 解析为 IndustryTemplate(给 AI 文案 step 4 行业选择器用) */
export function getRecommendedIndustries(id: string | null | undefined) {
  const preset = getAccountTypePreset(id);
  if (!preset) return [];
  return COPYWRITING_INDUSTRIES.filter((i) => preset.recommendedIndustries.includes(i.id));
}

/** 把推荐文风 id 解析为 StyleOption 列表(给 AI 文案 step 3 文风选择器用) */
export function getRecommendedStyles(id: string | null | undefined) {
  const preset = getAccountTypePreset(id);
  if (!preset) return COPYWRITING_STYLES;
  return COPYWRITING_STYLES.filter((s: { id: string }) => preset.recommendedStyles.includes(s.id));
}

/** 推荐的发布平台列表(给"多平台分发"步骤用) */
export function getRecommendedPlatforms(id: string | null | undefined) {
  const preset = getAccountTypePreset(id);
  if (!preset) return COPYWRITING_TYPES;
  return COPYWRITING_TYPES.filter((p) => preset.recommendedPlatforms.includes(p.id));
}
