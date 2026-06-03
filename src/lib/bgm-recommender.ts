// BGM 智能推荐器 — 根据 topic/industry/style 关键词,匹配最合适的 BGM 风格
// 不依赖外部 API,纯本地规则匹配(零成本,毫秒级)

export type BgmStyle = 'tech' | 'chill' | 'hype' | 'elegant' | 'energetic';

export interface BgmRecommendation {
  style: BgmStyle;
  label: string;
  reason: string;
  score: number; // 0-100 置信度
}

// 关键词 → 风格权重映射
const STYLE_KEYWORDS: Record<BgmStyle, string[]> = {
  tech: [
    '科技', 'AI', '人工智能', '数码', '产品', '评测', '开箱', '互联网', '软件', 'App', '工具',
    '代码', '程序', '开发', '架构', '云', '数据', '算法', '芯片', '手机', '电脑', '电子',
    'SaaS', 'B2B', '行业', '技术', '前沿', '未来', '智能', '机器人',
  ],
  chill: [
    '生活', '日常', 'vlog', '慢', '治愈', '温馨', '陪伴', '随拍', '记录', '情绪', '感悟',
    '旅行', '风景', '咖啡', '阅读', '读书', '独处', '夜晚', '周末', '放松', '解压',
    '穿搭', '生活', '好物', '种草', '文艺', '小众', '手账', '插花', '瑜伽',
  ],
  hype: [
    '促销', '直播', '秒杀', '福利', '爆款', '热卖', '限时', '优惠', '折扣', '红包',
    '电商', '带货', '抽奖', '免费送', '砍价', '拼团', '直播间', '下单', '活动', '节日',
    '双11', '618', '年货', '春节', '圣诞', '新年', '倒计时',
  ],
  elegant: [
    '美妆', '护肤', '化妆', '香水', '时尚', '穿搭', '高端', '轻奢', '珠宝', '腕表',
    '美食', '米其林', '法餐', '意餐', '甜品', '下午茶', '红酒', '品鉴', '艺术', '画廊',
    '展览', '音乐会', '歌剧', '古典', '高端', '奢华', '私人', '定制', '婚纱', '婚礼',
  ],
  energetic: [
    '运动', '健身', '跑步', '瑜伽', '塑形', '燃脂', '减肥', '减脂', '塑型', '增肌',
    '舞蹈', '街舞', '拉丁', '健身操', '搏击', '篮球', '足球', '网球', '游泳', '骑行',
    '挑战', '冒险', '极限', '激情', '热血', '燃', '爆', '嗨', '炸', '冲', '拼',
    '游戏', '电竞', 'FPS', 'MOBA', '主机', '开黑', '攻略',
  ],
};

const STYLE_LABELS: Record<BgmStyle, string> = {
  tech: '科技感',
  chill: '轻快/放松',
  hype: '促销/热闹',
  elegant: '优雅/高级',
  energetic: '活力/激情',
};

/**
 * 根据 topic/industry/style 推荐最合适的 BGM 风格
 * @param params 视频主题、行业、文风
 * @returns 推荐结果(按置信度降序)
 */
export function recommendBgm(params: {
  topic?: string;
  industry?: string;
  style?: string;
  topN?: number;
}): BgmRecommendation[] {
  const { topic = '', industry = '', style = '', topN = 1 } = params;
  const text = `${topic} ${industry} ${style}`.toLowerCase();

  const scores: Record<BgmStyle, { score: number; matched: string[] }> = {
    tech: { score: 0, matched: [] },
    chill: { score: 0, matched: [] },
    hype: { score: 0, matched: [] },
    elegant: { score: 0, matched: [] },
    energetic: { score: 0, matched: [] },
  };

  // 关键词匹配
  for (const [bgmStyle, keywords] of Object.entries(STYLE_KEYWORDS) as [BgmStyle, string[]][]) {
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        // 行业/文风字段命中权重更高
        const weight = industry.includes(kw) ? 5 : style.includes(kw) ? 3 : 2;
        scores[bgmStyle].score += weight;
        scores[bgmStyle].matched.push(kw);
      }
    }
  }

  // 文风(preset style)直推
  const styleDirectMap: Record<string, BgmStyle> = {
    professional: 'tech',
    知识: 'tech',
    种草: 'elegant',
    测评: 'tech',
    故事: 'chill',
    情感: 'chill',
    治愈: 'chill',
    搞笑: 'energetic',
    激情: 'energetic',
    促销: 'hype',
    带货: 'hype',
  };
  for (const [kw, bgmStyle] of Object.entries(styleDirectMap)) {
    if (text.includes(kw)) scores[bgmStyle].score += 4;
  }

  // 计算置信度(归一化到 0-100, 最高分 = 100)
  const max = Math.max(...Object.values(scores).map((s) => s.score), 1);

  const recommendations = (Object.keys(scores) as BgmStyle[])
    .map((bgmStyle) => ({
      style: bgmStyle,
      label: STYLE_LABELS[bgmStyle],
      reason: scores[bgmStyle].matched.length
        ? `匹配关键词: ${scores[bgmStyle].matched.slice(0, 3).join('、')}`
        : '无明确匹配',
      score: Math.round((scores[bgmStyle].score / max) * 100),
    }))
    .sort((a, b) => b.score - a.score);

  return recommendations.slice(0, topN);
}

/** 单推:返回最佳风格(用于 'auto' 模式) */
export function recommendBgmAuto(params: {
  topic?: string;
  industry?: string;
  style?: string;
}): BgmStyle {
  const recs = recommendBgm({ ...params, topN: 1 });
  return recs[0]?.style || 'chill'; // 兜底 chill
}
