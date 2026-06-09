// 灵集 AI 功能扣点配置 (V2.0.3)
// 集中管理所有 AI 路由的 credits 消耗,改价走 git review,不放 DB 防误改
//
// 设计原则:
// 1. 成本透明:每个值都对应上游 API 实际费用 + 30%~50% 毛利
// 2. 整数化:对外暴露的 credit 数量都是整数,避免 1.234 credits 这种奇怪数字
// 3. 一致性:同类功能用同一计算公式(如视频统一 duration × tier)
//
// 套餐对比(单 credit 实际 API 成本):
//   - 体验包(¥29/120 credits):¥0.242/credit → 适合低频用户
//   - 标准包(¥119/650 credits):¥0.183/credit → 主流选择
//   - 大包(¥399/2800 credits):¥0.142/credit → 量大划算
//   - 订阅个人版(¥29/150 credits):约 ¥0.193/credit
//   - 订阅创作者版(¥99/500 credits):约 ¥0.198/credit
//   → 综合看 ¥0.05~0.20/credit 的 API 成本,1 credit 约对应 ¥0.001~0.005 实际成本

export const CREDIT_COSTS = {
  // ─── 文案 ──────────────────────────────────────────────
  // DeepSeek 极便宜(¥0.001/次),2 credits 是"门槛"而非真实成本
  ai_copywriting: {
    perVariant: 2,  // 每个变体 2 credits(批量 N 个变体 × N 倍扣)
  },

  // ─── 图片 ──────────────────────────────────────────────
  // Doubao 约 ¥0.2~0.3/张,3 credits(¥0.9 零售)毛利率 67%
  ai_image: {
    perImage: 3,  // 每张图 3 credits,批量 4 张 = 12 credits
  },

  // ─── 数字人(wan2.2-s2v) ────────────────────────────────
  // 480P 约 ¥0.5/条,720P 约 ¥1/条
  // 10 credits(¥3 零售)毛利率 67-83%
  ai_digital_human: {
    '480P': 10,
    '720P': 20,
  },

  // ─── 视频(按秒计,×档位系数) ──────────────────────────
  // fast(Seedance 1.0-pro-fast flex 5 折):¥0.08/秒 → 1.5 credits = ¥0.45 毛利率 82%
  // standard(Wan 2.6):¥0.5/秒 → 5 credits = ¥1.5 毛利率 67%
  // premium(Seedance 2.0/1080p):¥2/秒 → 15 credits = ¥4.5 毛利率 56%
  // 计算公式:cost = ceil(duration × tier)
  ai_video: {
    fast: 1.5,
    standard: 5,
    premium: 15,
  },

  // ─── 配音(TTS) ────────────────────────────────────────
  // 火山 TTS 约 ¥0.0001/字,1 credit/100 字几乎纯走量
  ai_tts: {
    per100Chars: 1,
    minCost: 1,  // 最低 1 credit,避免 < 100 字收 0
  },

  // ─── 9 宫格(朋友圈配图) ──────────────────────────────
  // 9 张图,每张 2 credits(用 image 的同价,但允许失败单张退)
  ai_ads: {
    perGrid: 2,  // 失败单张退
  },

  // ─── 提取类(URL/图片/视频) ──────────────────────────
  // 图/文章便宜,视频 ASR 贵(Paraformer-v2 ¥0.0001/秒)
  ai_extract: {
    image: 1,
    article: 1,
    video: 3,  // 视频 ASR 60-90s,稍贵
  },

  // ─── 通用文本 AI(DeepSeek 等低价 LLM,~¥0.001/次) ──
  ai_text: {
    perCall: 1,  // 单次 LLM 调用:分析/改写/提炼/加标点/字幕优化等
  },

  // ─── HyperFrames 动态图形 ─────────────────────────────
  // HTML+GSAP → Chrome 渲染 → 视频, 15 credits 覆盖 LLM+渲染+上传
  ai_hyperframes: {
    perVideo: 15,
  },

  // ─── 视频后期 ────────────────────────────────────────
  ai_video_post: {
    merge: 5,       // FFmpeg 视频拼接 + BGM + 字幕
    storyboard: 3,   // AI 分镜生成
  },

  // ─── 数字人 Animate ──────────────────────────────────
  ai_animate: {
    '480P': 10,
    '720P': 20,
  },

  // ─── 数字分身视频生成(HeyGen) ────────────────────────
  // HeyGen Instant Avatar ~$0.05/s ≈ ¥0.36/s
  // 按脚本字数估算时长(~5 字/s 口播),3 credits/s ≈ ¥0.54 → 33% margin
  ai_avatar_video: {
    perSecond: 3,
    minCost: 10,
  },

  // ─── 训练类(一次性) ──────────────────────────────────
  // HeyGen Digital Twin 训练约 ¥50 → 300 credits ≈ ¥42-72(视套餐) → 盈亏平衡+
  // 火山 TTS 复刻 ¥99 一次性 → 700 credits ≈ ¥99-169 → 大包持平/标准以上盈利
  voice_clone: {
    oneTime: 700,
  },
  digital_twin: {
    oneTime: 300,
  },
} as const;

// ─── 辅助计算函数 ──────────────────────────────────────────

/**
 * AI 视频扣点:duration × 档位系数,向上取整
 * @param duration 视频时长(秒)
 * @param tier 画质档位:fast / standard / premium
 */
export function calcAiVideoCost(duration: number, tier: 'fast' | 'standard' | 'premium'): number {
  const coef = CREDIT_COSTS.ai_video[tier];
  return Math.max(1, Math.ceil(duration * coef));
}

/**
 * AI 配音扣点:每 100 字 1 credit,最低 1
 * @param chars 字符数(中英文都按字算)
 */
export function calcAiTtsCost(chars: number): number {
  return Math.max(CREDIT_COSTS.ai_tts.minCost, Math.ceil(chars / 100));
}

/**
 * 数字人扣点:按分辨率
 * @param resolution '480P' | '720P'
 */
export function calcDigitalHumanCost(resolution: '480P' | '720P' = '720P'): number {
  return CREDIT_COSTS.ai_digital_human[resolution] || CREDIT_COSTS.ai_digital_human['720P'];
}

/**
 * 9 宫格扣点:格子数 × 单价
 * @param gridCount 实际生成的格子数(失败的不算)
 */
export function calcAdsCost(gridCount: number): number {
  return gridCount * CREDIT_COSTS.ai_ads.perGrid;
}

/**
 * 数字分身视频扣点:按脚本字数估算时长,× 每秒单价
 * 中文口播 ~5 字/秒,HeyGen ~$0.05/s ≈ ¥0.36/s
 * @param chars 口播脚本文本长度
 */
export function calcAvatarVideoCost(chars: number): number {
  const estimatedSeconds = Math.ceil(chars / 5);
  return Math.max(
    CREDIT_COSTS.ai_avatar_video.minCost,
    estimatedSeconds * CREDIT_COSTS.ai_avatar_video.perSecond
  );
}
