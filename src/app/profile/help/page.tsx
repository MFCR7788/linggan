'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, FileText, ImageIcon, Mic, VideoIcon, Music,
  BookOpen, TrendingUp, Calendar, MessageCircle, Send,
  HelpCircle, Lightbulb, Settings, ExternalLink, CheckCircle2,
  Loader2, Sparkles, Globe, Layers, Zap, Bot, Bell, Grid3x3, BarChart3,
  Wand2,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { ProtectedRoute } from '@/components';
import { Toast } from '@/components/Toast';
import { apiClient } from '@/lib/api-client';

// ─── 功能介绍数据 ──────────────────────────────────────────

interface FeatureEntry {
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
  highlights: string[];
  path?: string;
}

const features: FeatureEntry[] = [
  {
    icon: <FileText size={20} />,
    title: 'AI 文案',
    desc: '4 步流程：选材+输入 → 智能提炼 → 平台类型 → 文风 → 行业（25 大行业可选）。生成后一键导入 AI 生图/视频。',
    color: '#3B82F6',
    highlights: [
      'Step 1 选材:灵感库多选 + 自由输入 + 智能助手提炼核心信息',
      'Step 1 默认显示所有灵感(含 AI 作品),AI 作品列表右侧加 ⚠️ AI 标签警示(避免二次创作放大 AI 味),可手动开「隐藏 AI 作品」chip 过滤',
      'Step 1 多模态:🔗 输入框粘贴 URL 自动解析(文章/图片/视频三类自动分流,含视频 ASR 语音转写) + 🖼️ 拖入/选择图片自动 OCR + 视觉理解(豆包视觉模型)',
      'Step 1 智能排序:按"新近度 + 内容长度 + 是否已提炼"自动评分,可切"最新优先"',
      'Step 1 类型 chip 过滤:全部 / 灵感(text) / 图片(image) / 视频(video)',
      'Step 1 智能助手产物对比:左右两栏弹窗(左:原素材+输入;右:提炼结果可编辑),确认后再喂给 AI',
      'Step 1 选 3 条以上提示:AI 容易分心,3 条以内最佳',
      'Step 2 平台:8 大平台(小红书/抖音/快手/公众号/微博/B站/知乎/短视频脚本)',
      'Step 3 文风:14 种文风按"情感/专业/营销/搞笑"分类',
      'Step 4 行业:🎯 25 大行业(V2.0.1 扩列)——美妆/穿搭/美食/母婴/数码/家居/教育/职场/法律/财税/教培/医疗咨询/留学/餐饮/宠物/健身/美容医美/汽车/房产/游戏/体育/二次元/银发/男士向/通用,每个行业有专属必含元素/避坑/CTA',
      '"去 AI 味"让文案更像真人;批量生成 3 个不同角度',
      '生成后一键"导入 AI 生图"或"导入 AI 视频"',
      '多平台改写:同一内容适配不同平台调性',
    ],
    path: '/ai/copywriting',
  },
  {
    icon: <ImageIcon size={20} />,
    title: 'AI 图片',
    desc: '8 个快捷预设联动比例/风格/色调，智能提示分析素材+输入+预设，生成后一键 AI 图生视频。',
    color: '#8B5CF6',
    highlights: [
      '8 个预设：小红书封面、公众号头图、抖音封面、产品主图、手机壁纸、海报、朋友圈配图、头像',
      '选预设自动联动比例/风格/色调（无需手动调）',
      'Step 1 选材+输入+智能提示：DeepSeek 分析后生成精准 prompt',
      'Step 2 参数：8 种风格 + 5 种比例',
      'Step 3 色调：4 种调色板（珊瑚粉/霓虹蓝/森系绿/暗夜黑）',
      'Step 4 高级（折叠）：批量 4 张、🎲 种子（可点 ❓ 看说明）、负面提示',
      '🎲 高级技巧：设置种子可复现相同风格的图片（0~21亿任意整数），便于对比 prompt 调整前后的细微差异；结果区可"复制/复用"种子',
      '生成后 5 按钮：重新生成/下载/存灵感/AI 图生视频/复制 prompt（批量模式多一个"全部存"）',
      '图片增强：超分辨率放大、背景替换、风格迁移',
    ],
    path: '/ai/image',
  },
  {
    icon: <Mic size={20} />,
    title: 'AI 数字人',
    desc: '照片 + 音频 → 口型同步视频（20 秒短视频），7 种模式覆盖不同场景。',
    color: '#06B6D4',
    highlights: [
      '7 种工作模式：一键生数字人、AI写稿、批量生成、多语言、用我的形象（角色动作迁移）、用我的分身（HeyGen）、手动配置（tab 顺序从左到右）',
      '一键生数字人：输入主题 → 全自动流水线（写稿→配音→上传→生成）',
      'AI写稿：输入主题 → DeepSeek 自动生成口播脚本（3个变体可选）',
      '批量生成：多个主题逐条处理，每个独立跟踪状态（20s 短视频合集）',
      '多语言：支持中文、English、日本語、한국어（20s 多语种短讲解）',
      '用我的形象（V2.0.2 P1-1 新增）：上传角色头像 + 参考视频 → wan2.2-animate 让静态图复刻视频里的动作/表情/口型。适合创始人 IP 持续产出、虚拟主播预制动作库。',
      '用我的分身（V2.0.2 P2-1 新增）：先在「账号设置」训练 5-10 分钟个人形象（HeyGen Digital Twin），训练就绪后输入口播脚本 → 一键生成「你自己的脸 + 你自己的声音」口播视频。适合创始人 IP 终极形态。',
      '手动配置：选图 → 音频（TTS/上传）→ 参数设置 → 生成，4步完成',
      '硬限制：音频 ≤ 20 秒（wan2.2-s2v 模型限制），系统自动拦截超长音频',
      '自动保存：生成完成自动存入灵感库,带「数字人」标签(可在灵感库按标签筛选)',
      '图片来源：上传 / 灵感库 / URL，三种方式灵活选择',
      '6 种豆包 TTS 音色 + ⭐ 我的克隆音色(声音复刻)',
    ],
    path: '/ai/digital-human',
  },
  {
    icon: <Music size={20} />,
    title: 'AI 配音',
    desc: '文本转语音，多音色可选，支持语速和音调调节，可下载 MP3 或保存至灵感库。',
    color: '#22C55E',
    highlights: [
      '6 种豆包 TTS 音色：男女声各多种风格',
      '语速调节：0.5x - 2.0x（默认 1.15x）',
      '音调调节：0.5 - 2.0（默认 1.0）',
      '文本上限 2000 字',
      '可在浏览器中直接预览音频',
      '支持下载 MP3 文件',
      '可从灵感库选取素材文本',
      'TTS 音色同时可用于数字人口播',
    ],
    path: '/ai/tts',
  },
  {
    icon: <VideoIcon size={20} />,
    title: 'AI 视频',
    desc: '3 步流程：方向（含首帧） → 分镜 → 生成。真实 BGM/字幕烧录，AI 图生视频可作为首帧带入。',
    color: '#F43F5E',
    highlights: [
      '首帧图片 3 选 1：灵感库 / URL / 本地上传（关键：AI 图生视频的核心入口）',
      '从 AI 文案 / AI 生图 跳转时自动带入 prompt 和首帧',
      '6 种风格预设：抖音爆款、治愈Vlog、产品展示、知识科普、赛博朋克、随机风格',
      '每种风格自动匹配 BGM（科技/轻松/热血）、字幕样式、推荐时长',
      '3 步流程：确定方向（素材+风格+时长+主题） → 分镜预览（可编辑） → 生成',
      '分镜 AI 自动生成，可手动编辑每段的 visualPrompt 和字幕',
      '后期配置：3 种 BGM（带波形预览 + 试听）+ 4 种字幕样式 + 3 种字幕位置',
      '多首尾帧模式（V2.0.2 P1-2 新增）：step 1 启用多帧 → 上传尾帧 URL + 多个中间关键帧（逗号/换行分隔，最多 5 张）→ 后端用 Seedance 多图版生成更连贯的视频过渡。适合产品 360° 展示、人物多角度切换、场景过渡。',
      'FFmpeg 合并：多段视频 + BGM（/public/bgm/*.mp3）+ 字幕烧录合成最终成片',
      '3 个画质等级：标准 / 高清 / 超高清',
      '一键成片模式：全自动生成，无需手动干预',
      '灵感库素材直接引用',
    ],
    path: '/ai/video',
  },
  {
    icon: <Grid3x3 size={20} />,
    title: '朋友圈 9 宫格',
    desc: '产品+3-5 个卖点 → AI 自动设计 9 张不同视觉角度的 1:1 封面 + 9 句广告标题 + 一键打包 ZIP。',
    color: '#F59E0B',
    highlights: [
      '3 步流程：产品名 → 卖点（3-5 个）→ 可选参考图',
      'AI 自动设计 9 个不同视觉角度：痛点共鸣、场景代入、产品特写、对比、用户证言、节日情感、品牌调性、生活方式、限时紧迫',
      '每张封面配一句 20 字内广告标题（带 emoji），方便复制',
      '9 张 1:1 比例 PNG/JPG 封面 + 1 份 CSV 标题清单（序号/标题/角度/对应卖点）',
      '一键打包 ZIP（含 BOM 头让 Excel 直接打开 UTF-8）',
      '可从 AI 生图页带入参考图，自动预填产品名',
      '配额：按 9 张 image 调用计费',
    ],
    path: '/ai/ads',
  },
  {
    icon: <Send size={20} />,
    title: '多平台分发',
    desc: '创作完成 → 一键分发到公众号/微博(自动 OAuth 发) + 抖音/小红书/视频号/B站(复制引导)。',
    color: '#F43F5E',
    highlights: [
      '2 平台全自动：微信公众号 + 微博(需 OAuth 授权)',
      '4 平台复制引导：抖音/小红书/视频号/B站(深链打开 App + 回填链接)',
      '定时发布：设定未来时间，自动到点发(2 平台)',
      '已连接账号管理：列出所有授权账号,可解除',
      '从 AI 文案/AI 生图跳转自动带入标题+封面',
      '多平台同时提交：一次操作分发到 6 个平台',
      'token 用 PLATFORM_ENCRYPTION_KEY 加密存储',
    ],
    path: '/publish',
  },
  {
    icon: <BarChart3 size={20} />,
    title: '效果数据',
    desc: '公众号/微博自动抓取(每 6 小时)+ 4 平台手动录入,统一看板看总览/平台对比/时间线/Top 10。',
    color: '#06B6D4',
    highlights: [
      '2 平台自动抓取：发布后 6/24/72 小时自动拉阅读/点赞/评论/转发',
      '4 平台手动录入：抖音/小红书/视频号/B站用「录入数据」卡 4 字段手动记',
      '总览：总发布数 + 总阅读 + 总互动 + 平均互动率',
      '平台对比：每平台发布数/平均阅读/互动率(条形图)',
      '时间线：近 30 天发布量 + 阅读量双轴趋势',
      'Top 10 作品：按互动率排名(自动/手动标识)',
      '时间范围切换：近 7/30/90 天',
    ],
    path: '/insights',
  },
  {
    icon: <Layers size={20} />,
    title: '批量生图',
    desc: '一次提交 N 个 SKU/课程名/讲点,后端真并发跑,进度可视化 + 失败重试。',
    color: '#22C55E',
    highlights: [
      '3 种输入方式:CSV 导入 / 表格内联编辑 / 灵感库多选',
      '后端真任务队列:Vercel cron 每分钟 claim,worker 并发 10 个',
      '进度可视化:每张图独立进度条,失败可重试',
      '模板复用:8 个生图预设联动比例/风格/色调,带 {{name}} 占位符',
      '配额透明:提交前显示已用/将用,免费 20 批/月,Pro 200 批/月',
      '完成后操作:一键全部存灵感库 / 全部下载 / 全部 AI 图生视频',
      '中断可恢复:中途关页面,重开继续看进度',
    ],
    path: '/ai/image/batch',
  },
  {
    icon: <BookOpen size={20} />,
    title: '灵感库',
    desc: '全类型灵感素材的统一管理中心，支持文本、图片、视频的增删改查与在线编辑。',
    color: '#F59E0B',
    highlights: [
      '4 种灵感类型：文本、图片、视频、日程',
      '支持手动录入 + AI 多模态分析（上传文件自动提取信息）',
      '日历视图：按时间查看所有灵感',
      '在线编辑：悬停卡片点击编辑按钮，可修改标题、描述和原文',
      '筛选排序：按类型、时间范围、关键词搜索',
      'AI 处理流水线：上传 → 分析 → 总结 → 标签分类 → 创作建议',
      '智能排版：原素材与 AI 分析自动分段、识别标题/列表/粗体，易读易览',
      '所有 AI 功能（文案/图片/数字人/视频）均可引用灵感库素材',
    ],
    path: '/inspiration',
  },
  {
    icon: <TrendingUp size={20} />,
    title: '热点监控',
    desc: '关键词驱动的实时热点追踪，自动抓取、分析并提供创作建议。',
    color: '#EF4444',
    highlights: [
      '关键词管理：添加/启用/停用/删除监测关键词',
      '自动抓取热点内容，显示平台来源和相关性评分',
      'AI 摘要：自动提炼热点核心内容',
      '创作建议：AI 分析热点后给出内容创作方向',
      '可信度评分：帮助判断热点真实性',
      '热点库：已抓取热点的可搜索、可排序归档',
      '统计数据栏：总热点数、今日新增、活跃关键词数',
      '从首页热点列表可直接跳转详情',
    ],
    path: '/hotspot',
  },
  {
    icon: <Calendar size={20} />,
    title: '日程管理',
    desc: '创作计划和任务安排，与灵感库和 AI 功能联动，点击日程查看 AI 分析详情。',
    color: '#8B5CF6',
    highlights: [
      '创建/编辑/删除日程，支持标题、描述、时间、地点',
      '状态管理：待完成 / 已完成 / 已取消，支持筛选查看',
      '点击日程卡片进入详情页，查看完整信息',
      'AI 分析关联：核心任务、任务清单、备选方案一目了然',
      '通过 AI 助手创建的日程自动包含结构化分析内容',
      '与灵感库联动：可从灵感详情跳转到关联的灵感素材',
      '首页待办提醒',
    ],
    path: '/schedule',
  },
  {
    icon: <MessageCircle size={20} />,
    title: 'AI 助手 (Capture)',
    desc: '多模态 AI 对话助手，支持文字、图片、视频、语音输入。',
    color: '#3B82F6',
    highlights: [
      '多模态输入：文字消息、图片分析、视频分析、语音录音',
      '会话管理：新建/切换/删除对话',
      '消息操作：复制、朗读、重新生成、保存至灵感库、添加到日程',
      '风格改写：可将 AI 回复改写为多种写作风格',
      '灵感采集：对话中的好想法一键保存到灵感库',
      '文件上传：支持图片、视频文件直接分析',
    ],
    path: '/capture',
  },
  {
    icon: <Bell size={20} />,
    title: '通知中心',
    desc: '系统消息和热点提醒的统一管理。',
    color: '#9CA3AF',
    highlights: [
      '消息分类：全部 / 热点 / 系统',
      '优先级标签：紧急 / 高 / 中 / 低',
      '一键全部已读',
    ],
    path: '/notification',
  },
  {
    icon: <Settings size={20} />,
    title: '账号设置',
    desc: '管理资料、安全、通知、平台集成 4 大模块。',
    color: '#8B5CF6',
    highlights: [
      '资料：修改头像、昵称，查看手机号（换号需联系客服）',
      '安全：改密码、退出所有设备',
      '集成：6 个 V2.0.2 env 一站式配置（自动生成 + 申请指引）',
      '通知：跳到「通知中心」',
    ],
    path: '/profile/settings',
  },
  {
    icon: <Sparkles size={20} />,
    title: '智能推荐 + 工作流联通',
    desc: '8 大账号类型智能推荐 3-4 套内容组合,6 步工作流自动联通,媒体运营官 3 分钟出片。',
    color: '#EC4899',
    highlights: [
      '8 大账号类型:初创/知识IP/电商品牌/B2B/个人创作者/教培/餐饮/医美',
      '新用户首次登录弹窗引导选账号类型,选择后 AI 创作中心展示推荐组合',
      '每个推荐组合 4 步流水线:灵感→文案→图片→数字人→视频(一步到位)',
      '6 步全局工作流进度条:当前步骤高亮,已完成标绿,下一步 ⭐ 提示',
      '跨页自动带入:文案→图片→视频→数字人→多平台分发,点击自动预填',
      '账号类型随时在「账号设置→账号类型」里换,推荐组合实时切换',
    ],
    path: '/ai',
  },
  {
    icon: <Wand2 size={20} />,
    title: '声音克隆 + BGM AI + 智能字幕',
    desc: '创始人 IP 关键三件套:30s 样本克隆声音、BGM 智能推荐、LLM 改写字幕。',
    color: '#F59E0B',
    highlights: [
      '声音克隆:AI 配音页「克隆我的声音」→ 30s 样本 → 1-5 分钟训练完成 → 「我的克隆」音色(¥99 一次性)',
      '克隆音色贯通:配音页 + 数字人页 TTS 下拉都支持,创始人可用自己声音做数字人口播',
      'BGM AI 自动:AI 视频后期选「AI 自动」,根据主题关键词自动匹配科技/放松/促销/优雅/活力 5 档',
      'BGM 6 档:科技感/轻松舒缓/热血激昂/AI 自动/优雅高级/活力激情(优雅/活力有降级到本地 mp3)',
      'AI 智能字幕:分镜卡片点「AI 字幕」→ DeepSeek 把视觉描述改写为 5-15 字口播短句,合并时自动烧入',
    ],
    path: '/ai/tts',
  },
];

// ─── 常见问题 ──────────────────────────────────────────────

interface FAQEntry {
  q: string;
  a: string;
}

const faqs: FAQEntry[] = [
  {
    q: '灵集是什么？',
    a: '灵集（LingJi）是一个 AI 驱动的内容创作助手，帮助内容创作者高效完成从灵感采集、AI 写稿、图片生成、数字人口播、视频合成到日程管理的全流程工作。',
  },
  {
    q: '免费版有什么限制？',
    a: '免费版每天可使用 5 次 AI 生成功能，灵感库最多存储 100 条记录。升级到专业版（¥39/月）可享受无限使用和更多高级功能。',
  },
  {
    q: 'AI 生成的视频可以商用吗？',
    a: '可以。灵集生成的文案、图片、数字人视频和短视频均由 AI 创作，版权归用户所有。但请注意，使用他人肖像生成数字人需获得授权。',
  },
  {
    q: '数字人支持哪些语言？',
    a: '当前支持中文、英语、日语、韩语四种语言。AI 写稿功能会自动使用目标语言生成脚本。TTS 音色目前主要为中文优化，后续会扩展专用多语言音色。\n\n⚠️ 音频时长硬限制 20 秒：所有语言的数字人音频都必须 ≤ 20 秒（wan2.2-s2v 模型限制，约等于 100 个中文字 / 30-40 个英文单词）。一键生数字人模式会自动用 AI 写稿生成 ≤ 100 字的短脚本，无需手动调；多语言模式同理。手动配置模式需自己控制 TTS 文本长度（后端会自动拦截超长音频并返回明确错误）。',
  },
  {
    q: 'AI 文案的 25 大行业怎么选?选错了能改吗?',
    a: '进入 AI 文案 → Step 4 行业,选择最贴近你内容主题的行业即可。\n\n按需选: 卖美妆产品选「美妆」;发法律科普选「法律」;做餐饮探店选「餐饮」;面向中老年群体选「银发」;给男生推荐数码产品选「男士向」;不确定就选「通用」。\n\n每个行业内置专属的「必含元素/避坑项/开头钩子/CTA 句式/推荐长度/推荐文风」,AI 会按行业调性生成更垂直的内容。\n\n选错了可以重选再生成,不会留下历史。25 行业:美妆/穿搭/美食/母婴/数码/家居/教育/职场/法律/财税/教培/医疗咨询/留学/餐饮/宠物/健身/美容医美/汽车/房产/游戏/体育/二次元/银发/男士向/通用。',
  },
  {
    q: '朋友圈 9 宫格怎么用?能直接投放吗?',
    a: '进入 AI 创作中心 → 「朋友圈 9 宫格」,3 步输入:产品/服务名 → 3-5 个卖点 → 可选参考图,点「生成 9 宫格素材包」即可。\n\nAI 会自动设计 9 个不同视觉角度的 1:1 封面(痛点共鸣/场景代入/产品特写/对比/用户证言/节日情感/品牌调性/生活方式/限时紧迫),每张配一句 20 字内的广告标题。\n\n下载的 ZIP 包含 9 张封面 + 1 份 CSV 标题清单(序号/标题/角度/对应卖点),CSV 带 UTF-8 BOM 可直接用 Excel 打开。\n\n适用场景:朋友圈广告 A/B 测试、电商新品投放、课程招生裂变。\n\n配额:按 9 次 image 调用计费,生成失败的格子不影响其他格子的下载。',
  },
  {
    q: '怎么用多平台分发?公众号和微博怎么授权?',
    a: '进入 AI 创作中心 → 「多平台分发」,3 步:填写内容 → 选平台 → 可选定时 → 发布。\n\n公众号/微博需要先授权:\n- 公众号: 服务号 + 微信开放平台第三方平台账号(企业资质, ¥300/年)\n- 微博: 个人开发者可申请\n\n配置: 在 .env.local 设置 WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET / WEIBO_APP_KEY / WEIBO_APP_SECRET / PLATFORM_ENCRYPTION_KEY(32 字节 hex)。\n\n抖音/小红书/视频号/B站: 点发布后跳到「复制引导页」,按 3 步操作(复制 → 打开 App → 回填链接)。\n\n定时发布: 设未来时间,后端 cron 每分钟扫描,到点自动发。\n\ntoken 用 PLATFORM_ENCRYPTION_KEY 加密存数据库,授权解除立刻失效。',
  },
  {
    q: '效果数据怎么统计?为什么不显示某些平台?',
    a: '微信公众号/微博: 后端每 6 小时自动调官方 API 抓取阅读/点赞/评论/转发,无需手动操作。\n\n抖音/小红书/视频号/B站: 没有公开 API,需在「发布详情」点「录入数据」手动填 4 字段(阅读/点赞/评论/转发)。录入后在数据看板自动汇总。\n\n看板包含:总览(总发布/总阅读/总互动/平均互动率)、平台对比(每平台平均阅读 + 互动率)、时间线(近 30 天发布+阅读双轴)、Top 10 作品(按互动率排名)。\n\n时间范围:支持近 7/30/90 天切换。',
  },
  {
    q: '批量生图为什么用 N×12 秒?任务会不会丢?',
    a: '预估时间:每张图豆包 API 约 10-15 秒,12 秒是经验值(并发 10 张 + Vercel cron 1 分钟粒度)。\n\n任务队列: 不是「客户端轮询」,而是后端真任务队列(ai_tasks 表 + Vercel cron + worker 池)。即使关掉页面,任务在数据库里,重开自动续上。\n\n中途关页面: 进度不丢,重新进入「批量生图」页,会自动用 batchId 拉最新进度。\n\n失败重试: 失败任务可单独「重试」,最多 3 次自动重试(指数退避 30s/2min/8min)。',
  },
  {
    q: 'TTS 语音合成失败怎么办？',
    a: '请检查：(1) 文本字节数 ≤ 1000（UTF-8 编码，约 333 个中文字 / 1000 个英文字母，注意 emoji 和标点都算字节数）；(2) 网络连接正常；(3) 尝试切换不同音色。\n\nV2.0.2 修复：之前误把字节数限制写成 2000 字，火山引擎 TTS 实际限制是 1024 字节 UTF-8，已修正为 1000 字节安全阈值。超长时会返回明确错误「exceed max len limit」+ 当前字节数，方便你精简文案。',
  },
  {
    q: '智能推荐的 8 种账号类型怎么选?',
    a: 'V2.0.2 起,新用户首次登录会弹窗引导选 1 次账号类型,选择后 AI 创作中心会展示 3-4 套针对性的内容组合。\n\n8 大账号类型:\n- 初创(初创公司 CEO): 产品发布、品牌故事、媒体宣传\n- 知识 IP(自媒体讲师/咨询师): 知识科普、行业洞察、课程引流\n- 电商品牌: 产品种草、9 宫格、直播切片、节日营销\n- B2B(企业服务/SaaS): 行业白皮书、产品 demo、客户案例\n- 个人创作者(博主/vlogger): 日常 vlog、生活记录、穿搭分享\n- 教培(K12/职业培训): 课程介绍、学习方法、家长沟通\n- 餐饮(餐厅/食品品牌): 菜品展示、探店、食材溯源、节日套餐\n- 医美/健康: 项目介绍、用户证言、医生科普、避坑指南\n\n不确定就选「个人创作者」最通用,后续在「账号设置→账号类型」里随时可换,推荐组合会实时切换。',
  },
  {
    q: '声音克隆怎么用?为什么是 ¥99?',
    a: 'V2.0.2 起 AI 配音页加了「克隆我的声音」功能,创始人 IP 打造必备。\n\n操作步骤: 进入 AI 配音 → 展开「克隆我的声音」折叠面板 → 上传 30 秒清晰人声样本(wav/mp3/m4a, ≤10MB, 无背景音乐) → 输入演示文本(4-80 字) → 点「开始训练」→ 等待 1-5 分钟 → 训练完成后音色自动存到「我的克隆」,可在 TTS 音色下拉选择。\n\n¥99 是火山引擎声音复刻的官方训练费(一次性),之后用克隆音色合成按字符数计费 ~¥0.0001/字,很便宜。\n\n为什么需要 demo text: 火山 API 拿 demo text 和音频对比,验证音色一致性,防止上传非本人声音。\n\n克隆音色贯通: AI 数字人页 TTS 下拉也有「⭐ 我的克隆」入口,数字人口播直接用自己声音。',
  },
  {
    q: 'BGM AI 自动推荐怎么用?有哪些风格?',
    a: 'V2.0.2 起,AI 视频 step 3 后期配置里 BGM 选项加了「AI 自动」,选中后合并时后端会根据 topic/stylePreset 关键词自动匹配最合适的 BGM 风格。\n\n6 档 BGM:\n- AI 自动(根据主题智能匹配,默认推荐)\n- 科技感(电子节拍,适合 AI/数码/SaaS)\n- 轻松舒缓(轻音乐,适合 vlog/生活)\n- 热血激昂(快节奏鼓点,适合直播/促销)\n- 优雅高级(轻柔钢琴,适合美妆/轻奢)\n- 活力激情(快节拍,适合运动/健身/游戏)\n\n实现: 纯本地关键词权重匹配,毫秒级响应,零外部 API 依赖。匹配不到时降级到「轻松舒缓」。\n\n优雅高级/活力激情的 mp3 文件暂未提供,合并时会自动降级到「轻松舒缓」/「热血激昂」,不影响发布。',
  },
  {
    q: 'AI 智能字幕是什么?会改我原字幕吗?',
    a: 'V2.0.2 起,AI 视频 step 2 分镜卡片右上角加了「AI 字幕」按钮。\n\n用法: 生成分镜后(LLM 已自动生成每段 subtitle),点「AI 字幕」→ DeepSeek 把每段视觉描述改写为 5-15 字的朗朗上口口播短句 → 覆盖原 subtitle → 合并时自动用新字幕烧入视频。\n\n不会丢信息: 改写是「优化文案」,不修改 visualPrompt 和画面,只让字幕更口语化、有节奏感。\n\n可以反复点: 每次调用都是新结果,不满意可再点。\n\n失败降级: LLM 调用失败时会保留原字幕(不会清空),控制台会有 fallback 提示。\n\n兜底机制: 故事版生成后若 LLM 没填 subtitle,前端会用 visualPrompt 截短作字幕,保证烧字幕时永远有内容。',
  },
  {
    q: '6 步工作流怎么用?会自动跳转吗?',
    a: 'V2.0.2 起 AI 创作中心顶部加了 6 步全局工作流 stepper:灵感 → 文案 → 图片 → 数字人 → 视频 → 分发。\n\n当前在哪个页面就高亮哪一步,已完成步骤标绿,下一步加 ⭐ 角标提示。\n\n自动跳转: 所有 AI 页面之间可以「一键带入」: 文案生成完 → 点「导入 AI 生图」自动跳图片页 + 预填 prompt;图片生成完 → 点「AI 图生视频」自动跳视频页 + 预填首帧;数字人生成完 → 「做更长视频」/「多平台分发」一键跳转。\n\n手动跳转: 点 stepper 任意一步直接跳(若该步骤未完成,会空状态引导)。\n\n不强制按顺序: 任何步骤都可独立使用,但按顺序用完出片效率最高。',
  },
  {
    q: '数字人「用我的形象」是什么?能做什么?',
    a: 'V2.0.2 P1-1 起,AI 数字人加了第 6 种模式「用我的形象」,底层是阿里云百炼的 wan2.2-animate 角色动作迁移模型。\n\n能做什么: 上传一张静态头像(创始人/虚拟形象) + 一段参考视频(任意人物的动作/表情/口播),AI 会让头像「复刻」视频里的动作、表情、口型,产出新视频。\n\n典型场景:\n- 创始人 IP: 录一次参考视频(讲解产品/分享观点),后续用不同头像(不同场景/服装)复刻,无需重录\n- 虚拟主播: 预制 5-10 个动作模板(打招呼/点头/指产品),随时调用\n- 产品发布会: 同一段产品演示套到不同虚拟形象上\n\n使用方法: AI 数字人 → tab「用我的形象」→ 上传头像 + 上传参考视频(≤100MB)→ 选「动作迁移」或「角色替换」模式 → 点「开始 Animate」→ 1-3 分钟完成,自动存灵感库。\n\n注意: wan2.2-animate 需在阿里云百炼控制台申请开通,若未开通会返「ModelNotFound」错误(后端友好提示)。',
  },
  {
    q: 'AI 视频多首尾帧模式怎么用?',
    a: 'V2.0.2 P1-2 起,AI 视频 step 1 加了「多帧」卡片(在「首帧」卡片下方),启用后可上传尾帧 URL + 多个中间关键帧。\n\n适用场景:\n- 产品 360° 展示: 首帧正面 + 中间帧侧面 + 尾帧背面,AI 生成流畅的旋转视频\n- 人物多角度切换: 首帧正面特写 + 中间帧半侧 + 尾帧背影\n- 场景过渡: 首帧 A 场景 + 中间帧过渡 + 尾帧 B 场景\n\n使用方法:\n1. step 1 正常选择首帧(必填,沿用现有「首帧」卡片)\n2. 点「多帧」卡片右上的「启用」按钮\n3. 填「尾帧 URL」(视频最后一帧的图,必填)\n4. 填「中间关键帧 URL」,每行一张或逗号分隔,最多 5 张\n5. 卡片下方会显示「预览」:首 + 关键 1/2/3/4/5 + 尾\n6. 继续 step 1 选风格/时长/主题,后续 step 2-3 不变\n\n计费: 走 Seedance 多图版,约 ¥0.4-0.8/秒(比单图版略贵,因多帧推理)。',
  },
  {
    q: '数字分身训练是什么?和「用我的形象」有什么区别?',
    a: 'V2.0.2 P2-1 起,「账号设置」新增「数字分身」section,底层是 HeyGen Digital Twin API。\n\n核心区别:\n- 用我的形象(wan2.2-animate): 静态图 + 参考视频 → 复刻动作(需每次上传参考视频,产出 1 条视频)\n- 用我的分身(HeyGen Digital Twin): 上传 5-10 分钟个人形象视频 → 训练 1 次得到 avatar_id → 之后输入任何口播脚本 → 一键生成「你自己的脸 + 你自己的声音」视频(无需每次上传参考)\n\n简单说: 用我的形象是「让静态图动起来」,用我的分身是「克隆一个你自己,从此可以无限次让他/她口播」。\n\n训练流程: 账号设置 → 数字分身 → 训练我的分身 → 填名称 + 视频 URL(5-10 分钟清晰人声,正脸)→ 开始训练 → 5-15 分钟完成 → 状态变「就绪」→ 在 AI 数字人「用我的分身」tab 输入脚本 → 一键生成。\n\n价格: HeyGen 训练本身免费(2026 年新定价),按生成视频秒数计费(约 $0.067/秒,即 ¥0.5/秒),生成 1 条 30s 口播视频约 ¥15。\n\n注意: 需配置 HEYGEN_API_KEY 环境变量,未配置时训练/生成会返友好错误。\n\n适用场景: 创始人 IP 终极形态——录一次形象,之后用文字脚本批量生产口播视频,本人无需再出镜。',
  },
  {
    q: 'AI 生图里的"🎲 种子"是什么？怎么用？',
    a: '种子是 0~21 亿之间的任意整数，相当于 AI 想象的"起点"。相同的 prompt + 相同的种子，会得到几乎相同的图。\n\n常用场景：(1) 调 prompt 时固定种子，看风格/细节的细微差异；(2) 看到喜欢的图时复制其种子，之后用同种子+微调 prompt 复现相近风格；(3) 批量模式下，4 张图共用同一种子作为起点。\n\n使用方法：进入 AI 生图 → 展开"Step 4 高级设置" → 在"种子"框输入数字（或点 🎲 随机一个）→ 生成。结果区会显示"用了种子: X"以及"复制/复用此种子"两个按钮，方便下次再用到。留空 = 每次随机。',
  },
  {
    q: '数字人视频生成需要多长时间？',
    a: '通常需要 30 秒到 2 分钟，取决于视频分辨率（480P 更快，720P 稍慢）。批量生成模式下，多个视频会按顺序逐个处理，每个独立跟踪状态。\n\nV2.0.2 起，数字人模式已精简为 5 种（一键生数字人 / AI写稿 / 批量生成 / 多语言 / 手动配置），原来的「课程培训」模式已下线（与 20 秒音频硬限制冲突，长讲稿场景请用 AI 文案 → 短视频脚本 + AI 视频）。',
  },
  {
    q: '如何下载生成的视频？',
    a: '在视频生成完成后，点击视频下方的"下载"按钮即可保存到本地。\n\nV2.0.2 起视频会自动保存：所有 5 种数字人模式生成完成后，系统自动调 POST /api/inspiration 把视频存入灵感库（type=video, tags=["数字人", "AI生成", "video_material"]），无需手动点"保存"。\n\n去灵感库按「数字人」标签筛选可看到所有历史生成的数字人视频，可一键复用到 AI 文案 / AI 视频项目。',
  },
  {
    q: '7 种数字人模式怎么选?',
    a: 'V2.0.2 起 AI 数字人页面有 7 种模式（tab 顺序从左到右），按使用频率排列：\n\n1) 一键生数字人（最常用）：输入主题，全自动「写稿→配音→上传→生成」，零配置。推荐所有新用户从这里开始。\n\n2) AI 写稿：只想让 AI 生成口播脚本、不立刻生成视频。3 个变体可选，可对比后挑一个再配音/上传。\n\n3) 批量生成：多个主题逐条处理，每个独立跟踪状态（适合 20s 短视频合集、社群批量内容）。\n\n4) 多语言：输入主题 + 选目标语言（中/英/日/韩），AI 自动写对应语言脚本 + 配音 + 生成。\n\n5) 用我的形象（wan2.2-animate 角色动作迁移）：静态图 + 参考视频 → 复刻动作。\n\n6) 用我的分身（HeyGen Digital Twin 数字分身）：先训练个人形象,之后输入口播脚本 → 一键生成「你自己的脸 + 你的声音」视频。\n\n7) 手动配置：完全控制每一步——选图 → 音频（TTS 或上传 mp3）→ 参数 → 生成。适合已有现成口播稿/想用自己配音的用户。\n\n⚠️ 原来的「课程培训」模式已下线（与 20 秒音频硬限制冲突，长讲稿场景请用「AI 文案 → 短视频脚本」+「AI 视频」组合替代）。',
  },
  {
    q: '为什么数字人音频限 20 秒?',
    a: '20 秒是上游模型 wan2.2-s2v（阿里云 DashScope 数字人模型）的硬限制，超出会返回「The input audio is longer than 20s」错误，无法绕开。\n\nV2.0.2 已做的优化：\n- 一键生数字人 / AI写稿 / 多语言模式：AI 写稿时硬限 [50, 300] 字、默认 100 字（约 20 秒），无需用户手动调。\n- 后端双重防御：/api/ai/digital-human 接收 audioDuration 参数，超 20 秒直接返 400 错误并给出明确文案。\n- 一键生数字人前端：用 HTMLAudioElement 测量 TTS 生成后的音频时长，> 20 秒立即 throw 拦截，不浪费上游任务。\n- 手动配置模式：用户上传自己的音频时无法改长度，但脚本生成会标「X 字 · ≈N秒」帮你预估。\n\n如果需要 20 秒以上的长讲稿/课程内容，请用「AI 文案 → 短视频脚本」生成完整长脚本（无长度限制），再分镜后用「AI 视频」生成多段 20s 短视频，最后合并。',
  },
  {
    q: '数字人视频会自动保存到哪?',
    a: 'V2.0.2 起所有 5 种数字人模式（手动配置 / 一键生数字人 / 批量 / 多语言）生成完成后，系统自动调 POST /api/inspiration 把视频存入灵感库：\n\n- type: video\n- media_urls: [生成的视频 URL]\n- title: 默认「数字人视频 · 480P」或「数字人 · {主题}」\n- tags: ["数字人", "AI生成", "video_material"]\n\n去灵感库页面：点「标签筛选」chip → 选「数字人」就能看到所有历史生成的数字人视频。\n\n为什么自动存：解决「生成完没及时下载，链接就过期」的痛点；且让生成的素材自动归入灵感库，可在 AI 文案 / AI 视频项目里直接复用。\n\n用 savedVideoUrls Set 去重：同一视频 URL 不会重复入库，刷新页面也会保持。',
  },
  {
    q: '灵感库的存储空间有多大？',
    a: '免费版 100 条，专业版和团队版无限制。灵感条目支持文本、图片、视频等多种类型，图片和视频文件存储在云端。',
  },
  {
    q: 'AI 文案 Step 1 里的 AI 作品右上角的 ⚠️ AI 标签是什么?',
    a: 'V2.0.2 起,Step 1 默认会显示所有灵感(包括豆包/DeepSeek 生成的 AI 作品),但每条 AI 作品右侧会加黄底"⚠️ AI"标签警示。\n\n为什么这么设计: AI 创作平台如果反复拿 AI 文案当素材,会出现"AI 味自我强化"的怪圈(越改越像 AI)。所以显示出来让你知道风险,但不替你决定。\n\n如果完全不想看 AI 作品: 点列表上方的"⚠️ 隐藏 AI 作品" chip 开启过滤,灵感库只剩人工采集/链接解析/上传的素材。\n\n如果想看 AI 作品二次创作: 默认就显示,不用任何操作,选中后顶部会出现"选了 N 条 AI 作品,二次创作会放大 AI 味,建议开启『去 AI 味』开关"的黄色提示。',
  },
  {
    q: 'AI 文案 Step 1 怎么粘贴 URL 或图片自动解析?',
    a: 'V2.0.2 起 Step 1 输入框支持多模态素材理解(第三层):\n\n1) 粘贴 URL: 直接在 ✏️ 自由输入框输入或粘贴 https:// 开头的链接(如公众号文章、抖音视频、微博图),500ms debounce 后自动调链接分析 API,识别类型后分流:\n   - 文章: 抓正文 → DeepSeek 提炼核心信息 → 入库到灵感库,自动勾选 + 写入提炼结果\n   - 图片: 下载到 Supabase Storage + 豆包视觉理解 → 入库\n   - 视频: yt-dlp 抓视频 + DashScope Paraformer-v2 ASR 转录语音 → 入库(需 60-90 秒)\n\n2) 粘贴/拖入图片: 在输入框里 Cmd+V 粘贴截图,或把图片文件拖到 Step 1 卡片上的虚线框,自动调豆包视觉理解,识别图片中的文字/场景/标签,入库到灵感库,自动勾选 + 写入提炼结果。\n\n失败处理: 不支持的网站/视频转录失败/上传失败时,前端给明确错误,不会卡住。',
  },
  {
    q: '"智能助手"提炼结果不满意,怎么调整?',
    a: 'V2.0.2 起,点"智能助手"按钮后,会弹一个左右对比 Modal:\n\n左栏(只读): 显示你输入的主题 + 选中的素材(标 [素材1] [素材2]),方便你回顾 AI 拿到的原料。\n\n右栏(可编辑): 显示 AI 提炼出的核心信息,直接当 textarea 可以改。\n\n如果觉得 AI 偏了,直接在右栏改完点"用这个提炼",改完的版本会成为 Step 1 的"已提炼核心信息",喂给后续 AI 生成。如果 AI 提炼完全不行,点"取消"即可,不污染下游。\n\n为什么不直接覆盖: AI 提炼是黑盒,用户失去判断机会。这次改版让用户在确认前能改、能取消、能看左右对比。',
  },
  {
    q: '支持哪些平台的内容发布？',
    a: '文案功能支持小红书、抖音（短视频脚本）、微信公众号、微博四大平台的风格适配。多平台改写功能可一键将同一内容转换为不同平台的风格。',
  },
  {
    q: '如何联系技术支持？',
    a: '通过本页面的"意见反馈"标签提交问题，我们会在 24 小时内回复。也可以通过反馈表单提交功能建议。',
  },
  {
    q: '平台集成里的 6 个 env 为什么要分别填到 Vercel？',
    a: '灵集代码读的是 Vercel 的 process.env，站内「平台集成」是「配置中心」（状态、申请指引、AES 加密备份），不是 env 的真源。\n\n配置流程：(1) 在站内填入或自动生成 → 站内加密存库 → 顶部出现「已配置」徽章；(2) 同步把同一个值贴到 Vercel → Settings → Environment Variables；(3) 重新部署后 Vercel env 生效 → 定时任务、多平台 OAuth 发布才真正能用。\n\n6 个 env：PLATFORM_ENCRYPTION_KEY（AES-256-GCM 加密 token 的密钥）、CRON_SECRET（Vercel cron 调 worker 的鉴权密钥）、WECHAT_MP_APP_ID/SECRET、WEIBO_APP_KEY/SECRET。',
  },
  {
    q: '微信公众号需要什么资质？个人能开吗？',
    a: '需要「已认证的服务号」+ 微信开放平台第三方平台账号，均需企业资质。\n\n流程：(1) 注册「微信公众平台」账号 → 完成企业主体认证（需营业执照，¥300/年审核费）；(2) 账号类型选「服务号」（订阅号无发文 API 权限）；(3) 在「微信开放平台」(open.weixin.qq.com) 注册开发者账号 → 认证 → 创建「第三方平台」→ 拿到 AppID + AppSecret；(4) 把这两个值填到灵集「平台集成」+ Vercel env。\n\n个人开发者无法走通这套流程（缺企业资质）。微博开放平台个人可以申请，但需要审核（约 1-3 个工作日）。',
  },
  {
    q: '改密码后会退出所有设备吗？',
    a: '会。出于安全考虑，Supabase 在密码修改后会让该用户的所有 refresh_token 立即失效，相当于强制所有设备重新登录。\n\n如果只是想在某些设备上退出、不想改密码，可以用「退出所有设备」按钮（仅当前可用，调用 listSessions + 逐个 signOut）。\n\n退出后本设备也需用新密码（或保持原密码）重新登录。',
  },
];

// ─── 操作指南 ──────────────────────────────────────────────

interface GuideSection {
  title: string;
  icon: React.ReactNode;
  steps: { step: number; content: string }[];
  color: string;
}

const guides: GuideSection[] = [
  {
    title: '快速开始：第一段 AI 文案',
    icon: <FileText size={18} />,
    color: '#3B82F6',
    steps: [
      { step: 1, content: '进入 AI 创作中心,点击"AI 文案"' },
      { step: 2, content: 'Step 1 选材(默认 4 类:type chip 过滤、智能排序、AI 作品默认隐藏)。可选 1-3 条灵感(选多了 AI 容易分心)' },
      { step: 3, content: 'Step 1 ✏️ 输入主题,或粘贴 URL 自动解析(文章/图片/视频三类自动分流),或拖入图片自动 OCR + 视觉理解' },
      { step: 4, content: 'Step 1 点"智能助手"提炼核心信息,弹出左右对比 Modal,可编辑右栏后确认(或取消)' },
      { step: 5, content: 'Step 2 选平台:小红书/抖音脚本/公众号/微博/快手/B站/知乎/短视频脚本(8 大)' },
      { step: 6, content: 'Step 3 选文风(14 种,按"情感/专业/营销/搞笑"分类)' },
      { step: 7, content: 'Step 4 选行业(25 大,内置必含元素/避坑/CTA 模板)' },
      { step: 8, content: '底部开"去 AI 味"获得更自然的文案;"批量生成"同时出 3 个不同角度' },
      { step: 9, content: '点"立即生成",结果区可"导入 AI 生图"或"导入 AI 视频","多平台改写"一键适配其他平台' },
    ],
  },
  {
    title: '一键生数字人',
    icon: <Mic size={18} />,
    color: '#06B6D4',
    steps: [
      { step: 1, content: '进入 AI 数字人页面，顶部默认在"一键生数字人"模式（tab 顺序：一键生数字人 → AI写稿 → 批量生成 → 多语言 → 手动配置）' },
      { step: 2, content: '选择角色照片（上传 / 灵感库 / URL 三选一）' },
      { step: 3, content: '输入口播主题（建议 100 字以内，约 20 秒），选文案风格 + TTS 音色 + 分辨率' },
      { step: 4, content: '点"一键生数字人"，系统自动完成「写稿 → 配音 → 上传 → 提交生成」全流程' },
      { step: 5, content: '系统自动用 HTMLAudioElement 测量音频时长，超 20 秒会直接拦截并提示精简主题/换更短脚本' },
      { step: 6, content: '等待约 1-2 分钟，视频生成后自动存入灵感库（带「数字人」「AI生成」标签），可预览/下载/复用到 AI 文案' },
    ],
  },
  {
    title: 'AI 视频合成',
    icon: <VideoIcon size={18} />,
    color: '#F43F5E',
    steps: [
      { step: 1, content: '进入 AI 视频页面' },
      { step: 2, content: '选择参考素材（最多5条灵感）、视频风格和时长' },
      { step: 3, content: '点击"生成分镜"，AI 自动拆解场景' },
      { step: 4, content: '检查并编辑每个分镜的视觉描述和字幕文案' },
      { step: 5, content: '选择 BGM 风格和字幕样式' },
      { step: 6, content: '点击"生成全部"，等待各段视频完成' },
      { step: 7, content: '合并视频 + BGM + 字幕，下载最终成片' },
    ],
  },
  {
    title: '灵感采集与 AI 处理',
    icon: <BookOpen size={18} />,
    color: '#F59E0B',
    steps: [
      { step: 1, content: '进入灵感库，点击"+"新建灵感' },
      { step: 2, content: '选择类型（文本/图片/视频/日程），输入内容或上传文件' },
      { step: 3, content: '点击"AI 处理"进入智能分析流水线' },
      { step: 4, content: 'AI 自动识别内容、生成摘要、打标签、给创作建议' },
      { step: 5, content: '处理完成后，可在详情页查看完整分析结果' },
      { step: 6, content: '悬停卡片，点击编辑按钮（铅笔图标）可直接修改标题和内容' },
      { step: 7, content: '在任何 AI 功能中都可以引用这些灵感素材' },
    ],
  },
  {
    title: '热点监控设置',
    icon: <TrendingUp size={18} />,
    color: '#EF4444',
    steps: [
      { step: 1, content: '进入热点监控页面' },
      { step: 2, content: '点击"添加关键词"，输入你关注的话题关键词' },
      { step: 3, content: '启用关键词，系统自动开始监测' },
      { step: 4, content: '在首页可看到最新热点列表' },
      { step: 5, content: '点击热点查看 AI 摘要、分析和创作建议' },
      { step: 6, content: '热点库中可搜索和管理已抓取的所有热点' },
    ],
  },
  {
    title: '完善账号设置',
    icon: <Settings size={18} />,
    color: '#8B5CF6',
    steps: [
      { step: 1, content: '个人中心 → 右上角齿轮 → 跳到「账号设置」' },
      { step: 2, content: '「资料」section：上传头像、修改昵称（1-30 字符）' },
      { step: 3, content: '「安全」section：点「修改密码」→ 输入当前密码 + 8 位以上新密码 → 确认（其他设备会立即退出）' },
      { step: 4, content: '「集成」section：点「自动生成 PLATFORM_ENCRYPTION_KEY」→ 复制 64 字符 hex → 粘贴到 Vercel env；CRON_SECRET 同理' },
      { step: 5, content: '「集成」section：填入 WECHAT_MP_APP_ID / APP_SECRET、WEIBO_APP_KEY / APP_SECRET（需在微信公众平台、微博开放平台先申请）' },
      { step: 6, content: '所有 env 都贴到 Vercel → 重新部署 → 集成状态变「已配置」+ 多平台 OAuth 发布 + 定时任务即可用' },
    ],
  },
  {
    title: '智能推荐 + 声音克隆 + BGM AI',
    icon: <Wand2 size={18} />,
    color: '#EC4899',
    steps: [
      { step: 1, content: '首次登录:弹窗引导选账号类型(8 大:初创/知识IP/电商品牌/B2B/个人/教培/餐饮/医美),选完跳到 AI 创作中心看到 3-4 套推荐组合' },
      { step: 2, content: '推荐组合卡片点「开始这套」:一键跳到第一步(文案/图片/数字人/视频)并自动预填主题/行业/文风' },
      { step: 3, content: '顶部 6 步 stepper 高亮当前进度,已完成步骤标绿,下一步 ⭐ 提示。任意环节可点 stepper 跳' },
      { step: 4, content: '声音克隆(可选,创始人 IP): AI 配音页 → 展开「克隆我的声音」→ 上传 30s 样本 → 输入 demo text → 训练 1-5 分钟 → 自动存为「我的克隆」' },
      { step: 5, content: 'AI 视频 step 3 BGM 选「AI 自动」: 后端根据主题智能匹配 5 档风格(科技/放松/促销/优雅/活力),合并时自动应用' },
      { step: 6, content: 'AI 智能字幕(可选, 改写更口语化): 分镜卡片点「AI 字幕」→ DeepSeek 改写为 5-15 字口播短句 → 合并时自动烧入视频' },
    ],
  },
  {
    title: '角色动作迁移 + 多首尾帧',
    icon: <Wand2 size={18} />,
    color: '#A78BFA',
    steps: [
      { step: 1, content: '用我的形象(wan2.2-animate): AI 数字人 → tab 选「用我的形象」→ 上传角色头像(可用上方选择图片的预览,或直接贴 URL)→ 上传参考视频(≤100MB)' },
      { step: 2, content: '选迁移模式:「动作迁移」(头像复刻视频动作)或「角色替换」(视频人物换成头像)→ 选分辨率 480P/720P → 点「开始 Animate」' },
      { step: 3, content: '等待 1-3 分钟(轮询状态)→ 生成完成后可预览/下载/存灵感库(自动打 Animate 标签)' },
      { step: 4, content: '多首尾帧模式(Seedance 多图版): AI 视频 step 1 → 点「多帧」卡片右上「启用」→ 填尾帧 URL(必填)' },
      { step: 5, content: '中间关键帧(可选,最多 5 张): 每行一张或逗号分隔,卡片下方预览图按 首 → 关键 1/2/3/4/5 → 尾 排列' },
      { step: 6, content: '继续后续 step 1 选风格/时长,生成分镜后,合并时 Seedance 多图版会自动用多帧做平滑过渡(比单图版更连贯,适合产品 360° / 场景过渡)' },
    ],
  },
];

// ─── 反馈表单 ──────────────────────────────────────────────

function FeedbackForm() {
  const [type, setType] = useState<'bug' | 'feature' | 'question' | 'other'>('feature');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const feedbackTypes = [
    { key: 'bug' as const, label: '问题反馈', icon: '🐛' },
    { key: 'feature' as const, label: '功能建议', icon: '💡' },
    { key: 'question' as const, label: '使用咨询', icon: '❓' },
    { key: 'other' as const, label: '其他', icon: '💬' },
  ];

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post('/feedback', { type, content: content.trim(), contact: contact.trim() });
      if (res.success) {
        setToast({ type: 'success', message: '感谢您的反馈，我们会认真处理！' });
        setContent('');
        setContact('');
      } else {
        setToast({ type: 'error', message: res.error || '提交失败，请重试' });
      }
    } catch {
      setToast({ type: 'error', message: '网络错误，请检查连接后重试' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* 反馈类型 */}
      <div>
        <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>反馈类型</p>
        <div className="grid grid-cols-4 gap-2">
          {feedbackTypes.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setType(key)}
              className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl text-xs transition-all"
              style={{
                background: type === key ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                border: type === key ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                color: type === key ? '#93C5FD' : '#9CA3AF',
              }}
            >
              <span style={{ fontSize: 18 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 反馈内容 */}
      <div>
        <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>详细描述</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="请详细描述您遇到的问题、建议或想法..."
          rows={5}
          maxLength={2000}
          className="w-full rounded-xl px-4 py-3 resize-none text-sm"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#E5E7EB',
            outline: 'none',
          }}
        />
        <p style={{ color: '#6B7280', fontSize: 10, textAlign: 'right' }}>{content.length}/2000</p>
      </div>

      {/* 联系方式（选填） */}
      <div>
        <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>联系方式（选填）</p>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="手机号或邮箱，方便我们回复您"
          className="w-full rounded-xl px-4 py-2.5 text-sm"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#E5E7EB',
            outline: 'none',
          }}
        />
      </div>

      {/* 提交 */}
      <button
        onClick={handleSubmit}
        disabled={!content.trim() || submitting}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all"
        style={{
          background: content.trim() ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)' : 'rgba(255,255,255,0.1)',
          color: content.trim() ? '#FFFFFF' : '#6B7280',
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? (
          <><Loader2 size={16} className="animate-spin" /> 提交中...</>
        ) : (
          <><Send size={16} /> 提交反馈</>
        )}
      </button>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────

type HelpTab = 'features' | 'guides' | 'faq' | 'feedback';

function HelpContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<HelpTab>('features');
  const [expandedFAQs, setExpandedFAQs] = useState<Set<number>>(new Set());
  const [expandedGuides, setExpandedGuides] = useState<Set<number>>(new Set());

  const tabs: { key: HelpTab; label: string; icon: React.ReactNode }[] = [
    { key: 'features', label: '功能介绍', icon: <Sparkles size={14} /> },
    { key: 'guides', label: '操作指南', icon: <Lightbulb size={14} /> },
    { key: 'faq', label: '常见问题', icon: <HelpCircle size={14} /> },
    { key: 'feedback', label: '意见反馈', icon: <Send size={14} /> },
  ];

  const toggleFAQ = (idx: number) => {
    setExpandedFAQs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleGuide = (idx: number) => {
    setExpandedGuides(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  return (
    <div className="flex flex-col min-h-screen pb-6">
      <TopNav
        title="帮助与反馈"
        showBack
        onBack={() => router.back()}
      />

      {/* Tab Bar */}
      <div className="px-4 pt-4">
        <div className="flex rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {tabs.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs transition-all"
              style={{
                color: activeTab === key ? '#3B82F6' : '#9CA3AF',
                background: activeTab === key ? 'rgba(59,130,246,0.15)' : 'transparent',
                fontWeight: activeTab === key ? 600 : 400,
                borderBottom: activeTab === key ? '2px solid #3B82F6' : '2px solid transparent',
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* ─── 功能介绍 ──────────────────────────────────── */}
        {activeTab === 'features' && (
          <>
            <div style={{ color: '#E5E7EB', fontSize: 14, marginBottom: 4 }}>
              灵集提供 10 大 AI 功能模块，覆盖内容创作全流程。
            </div>
            {features.map((f) => (
              <GlassCard key={f.title} className="!p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${f.color}20`, border: `1px solid ${f.color}33` }}
                  >
                    <span style={{ color: f.color }}>{f.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>{f.title}</h3>
                      {f.path && (
                        <button
                          onClick={() => router.push(f.path!)}
                          className="flex items-center gap-0.5 text-xs"
                          style={{ color: f.color }}
                        >
                          去看看 <ExternalLink size={10} />
                        </button>
                      )}
                    </div>
                    <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8, lineHeight: 1.5 }}>{f.desc}</p>
                    <div className="space-y-1">
                      {f.highlights.map((h, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 size={12} style={{ color: '#22C55E', marginTop: 2, flexShrink: 0 }} />
                          <span style={{ color: '#D1D5DB', fontSize: 11, lineHeight: 1.5 }}>{h}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </>
        )}

        {/* ─── 操作指南 ──────────────────────────────────── */}
        {activeTab === 'guides' && (
          <>
            <div style={{ color: '#E5E7EB', fontSize: 14, marginBottom: 4 }}>
              从零开始，快速掌握每个功能的使用方法。
            </div>
            {guides.map((g, idx) => {
              const isExpanded = expandedGuides.has(idx);
              return (
                <GlassCard key={idx} className="!p-4">
                  <button
                    onClick={() => toggleGuide(idx)}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: `${g.color}20` }}
                      >
                        <span style={{ color: g.color }}>{g.icon}</span>
                      </div>
                      <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>{g.title}</span>
                    </div>
                    <span style={{ color: '#9CA3AF', fontSize: 12, transform: isExpanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}>▼</span>
                  </button>
                  {isExpanded && (
                    <div className="mt-3 pl-10 space-y-2">
                      {g.steps.map(({ step, content }) => (
                        <div key={step} className="flex items-start gap-2">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: `${g.color}30`, border: `1px solid ${g.color}55` }}
                          >
                            <span style={{ color: g.color, fontSize: 11, fontWeight: 700 }}>{step}</span>
                          </div>
                          <span style={{ color: '#D1D5DB', fontSize: 12, lineHeight: 1.6 }}>{content}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </>
        )}

        {/* ─── 常见问题 ──────────────────────────────────── */}
        {activeTab === 'faq' && (
          <>
            <div style={{ color: '#E5E7EB', fontSize: 14, marginBottom: 4 }}>
              关于灵集的常见问题与解答。
            </div>
            {faqs.map((faq, idx) => {
              const isExpanded = expandedFAQs.has(idx);
              return (
                <GlassCard key={idx} className="!p-4">
                  <button
                    onClick={() => toggleFAQ(idx)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 500, flex: 1, paddingRight: 8 }}>
                      {faq.q}
                    </span>
                    <span style={{
                      color: '#9CA3AF',
                      fontSize: 12,
                      transform: isExpanded ? 'rotate(180deg)' : undefined,
                      transition: 'transform 0.2s',
                      flexShrink: 0,
                    }}>▼</span>
                  </button>
                  {isExpanded && (
                    <p style={{ color: '#D1D5DB', fontSize: 12, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', lineHeight: 1.7 }}>
                      {faq.a}
                    </p>
                  )}
                </GlassCard>
              );
            })}
          </>
        )}

        {/* ─── 意见反馈 ──────────────────────────────────── */}
        {activeTab === 'feedback' && (
          <>
            <div style={{ color: '#E5E7EB', fontSize: 14, marginBottom: 4 }}>
              我们重视每一位用户的反馈，您的意见将帮助灵集变得更好。
            </div>
            <GlassCard className="!p-4">
              <FeedbackForm />
            </GlassCard>

            {/* 联系方式 */}
            <GlassCard className="!p-4">
              <h3 style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>其他联系方式</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
                    <span style={{ fontSize: 16 }}>📧</span>
                  </div>
                  <div>
                    <p style={{ color: '#E5E7EB', fontSize: 12 }}>邮件联系</p>
                    <p style={{ color: '#6B7280', fontSize: 11 }}>support@lingji.app</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                    <span style={{ fontSize: 16 }}>💬</span>
                  </div>
                  <div>
                    <p style={{ color: '#E5E7EB', fontSize: 12 }}>在线客服</p>
                    <p style={{ color: '#6B7280', fontSize: 11 }}>工作日 9:00 - 18:00</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}>
                    <span style={{ fontSize: 16 }}>📱</span>
                  </div>
                  <div>
                    <p style={{ color: '#E5E7EB', fontSize: 12 }}>官方公众号</p>
                    <p style={{ color: '#6B7280', fontSize: 11 }}>搜索&ldquo;灵集 AI 创作&rdquo;</p>
                  </div>
                </div>
              </div>
            </GlassCard>
          </>
        )}
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <ProtectedRoute>
      <HelpContent />
    </ProtectedRoute>
  );
}
