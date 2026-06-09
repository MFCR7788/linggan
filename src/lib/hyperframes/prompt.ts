// HyperFrames HTML+GSAP 代码生成提示词
// 按 style 生成不同风格的中文动态图形视频
//
// 关键约束（踩坑记录）：
// - HyperFrames 要求根元素有 data-composition-id / data-width / data-height / data-duration
// - 字体只能用 sans-serif，HyperFrames 会尝试解析 Noto Sans SC → 909 个 Google Fonts 变体
// - PingFang SC / Microsoft YaHei 在 HyperFrames 字体映射中不存在 → 回退到 sans-serif
// - GSAP selector 必须 scoped：[data-composition-id="main"] .className

export type HyperFramesStyle = 'product' | 'social' | 'slide';

interface BuildPromptParams {
  script: string;
  topic?: string;
  style?: HyperFramesStyle;
  duration?: number;
}

const TOTAL_DURATION = 15; // 默认总时长（秒）

// HyperFrames 要求的 HTML 模板结构
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>动态图形</title>
<script src="gsap.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1920px;
    overflow: hidden;
    font-family: sans-serif;
    background: #0a0a1a;
  }
  /* 所有动画元素的基础样式 */
  .clip { position: absolute; }
</style>
</head>
<body>
<div id="composition"
     data-composition-id="main"
     data-width="1080"
     data-height="1920"
     data-duration="${TOTAL_DURATION}">
  <!-- 在此按顺序放置动画元素 -->
</div>
<script>
// GSAP timeline — 必须 paused + 注册 + scoped selector
var tl = gsap.timeline({ paused: true });
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;

// 所有 selector 必须 scoped: [data-composition-id="main"] .className
// 每个元素: <div class="clip" data-start="N" data-duration="M" data-track-index="K">

// 末尾延长 timeline 到总时长
tl.set({}, {}, ${TOTAL_DURATION});
</script>
</body>
</html>`;

const BASE_RULES = [
  '你输出的内容只能是完整合法的 HTML，不能包含 markdown 代码块标记（如 ```html）。',
  '必须严格遵循下面的 HTML 模板结构（data-composition-id / data-width / data-height / data-duration 缺一不可）。',
  `HTML 模板：\n${HTML_TEMPLATE}`,
  '',
  'GSAP 引用：<script src="gsap.min.js"></script>（本地文件，绝对禁止 CDN）。',
  '字体：只能用 sans-serif。禁止指定任何具名字体（PingFang SC、Microsoft YaHei、Noto Sans 等都会导致渲染器下载大量 Google Fonts 或映射失败）。',
  '【严禁】Google Fonts、外部 CSS、外部 JS、外部图片、外部 HTTP(S) 资源。一切资源必须内联或本地。',
  'GSAP timeline 必须 scoped：所有 selector 加 [data-composition-id="main"] 前缀，如 [data-composition-id="main"] .title',
  '所有动画元素：class="clip" + data-start（秒）+ data-duration（秒）+ data-track-index（从0开始的整数）。',
  '禁止 <video>、<audio>、<img> 标签。用 CSS 渐变/形状代替图片。',
  'position:absolute 定位所有 .clip 元素，body overflow:hidden。',
  '配色：暗色背景（#0a0a1a 系）+ 亮色文字 + 品牌色（#3B82F6 / #8B5CF6 / #F59E0B）。',
  `结尾必须 tl.set({}, {}, ${TOTAL_DURATION}) 延长 timeline。`,
].join('\n');

const STYLE_GUIDES: Record<HyperFramesStyle, string> = {
  product: [
    '风格：产品展示。',
    '结构：品牌/产品名开场 → 3-5个卖点逐个弹入 → 结尾 CTA（如"立即体验"）。',
    '动画：标题从下方弹入（y:80→0, power3.out, start:0.5, duration:1），',
    '      卖点依次 staggered 入场（stagger: 0.3, start:2, duration:0.8 each），',
    '      卖点用缩放弹性效果（scale: 0→1, back.out），CTA 脉冲呼吸（scale: 1→1.05 yoyo repeat, start:总时长-3）。',
    '文字：大标题 64-72px bold，卖点 28-36px，CTA 40px。',
    '配色：深蓝黑渐变背景 + 金色/白色文字 + 蓝色点缀。',
  ].join('\n'),

  social: [
    '风格：社交媒体快节奏。',
    '结构：冲击力开场 → 核心观点大字报 → 3个支撑点快速闪过 → 结尾互动引导。',
    '动画：快节奏切换（duration 0.4-0.6s），文字缩放弹跳入场，',
    '      核心观点用打字机效果或字符逐个弹出，背景色块快速切换。',
    '文字：超大号标题 80-100px，辅助文字 24-32px，加粗 + 描边。',
    '配色：高对比度 — 亮色背景块（黄#F59E0B、粉#EC4899、绿#22C55E）配黑字，或暗底配霓虹色文字。',
    '总时长：10-15 秒，节奏快。',
  ].join('\n'),

  slide: [
    '风格：知识讲解幻灯片。',
    '结构：标题页 → 3-5页内容逐页显示 → 总结页。每页停留约 3-4 秒。',
    '动画：页面切换用淡入（opacity: 0→1, power2.out），',
    '      要点列表逐条 staggered 入场，重点词汇用背景色块高亮。',
    '文字：标题 48-56px，正文 28-32px，行距 1.6-1.8，每页不超过 40 字。',
    '配色：深色学术风 — 藏蓝背景 + 白色正文 + 金色/蓝色高亮。',
    '总时长：15-25 秒，节奏舒缓可阅读。',
  ].join('\n'),
};

export function buildHyperFramesPrompt(params: BuildPromptParams): string {
  const { script, topic, style = 'product', duration } = params;
  const styleGuide = STYLE_GUIDES[style] || STYLE_GUIDES.product;
  const durationHint = duration ? `\n视频总时长约 ${duration} 秒。` : '';

  return `你是顶级动效设计师，擅长 GSAP 动画和中文排版。请根据以下内容生成一个 HyperFrames HTML 文件。

${BASE_RULES}

${styleGuide}
${durationHint}

主题：${topic || '未指定'}
脚本内容：
${script}

输出完整 HTML（从 <!DOCTYPE html> 开始，不要任何额外说明）:`;
}
