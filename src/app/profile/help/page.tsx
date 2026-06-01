'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, FileText, ImageIcon, Mic, VideoIcon, Music,
  BookOpen, TrendingUp, Calendar, MessageCircle, Send,
  HelpCircle, Lightbulb, Settings, ExternalLink, CheckCircle2,
  Loader2, Sparkles, Globe, Layers, Zap, Bot, Bell,
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
    desc: '智能生成小红书、公众号、短视频脚本等多平台文案，支持去 AI 味和多平台一键改写。',
    color: '#3B82F6',
    highlights: [
      '支持小红书、抖音、公众号、微博四大平台',
      '7 种写作风格可选：博主风、专业感、幽默、情感、干货、故事、极简',
      '"去 AI 味"功能让文案更像真人创作',
      '批量生成 3 个变体，一键切换选用',
      '多平台改写：同一内容适配不同平台调性',
      '灵感库素材直接引用，AI 自动结合热点创作',
    ],
    path: '/ai/copywriting',
  },
  {
    icon: <ImageIcon size={20} />,
    title: 'AI 图片',
    desc: '文生图 + 图片增强，支持多种风格、比例和色彩方案，可批量生成封面图、配图、海报。',
    color: '#8B5CF6',
    highlights: [
      '文生图：输入描述 → AI 生成图片，支持8种艺术风格',
      '快速预设：小红书封面(1:1)、公众号头图(16:9)、抖音封面(9:16)',
      '4 种色彩方案：清新、暖调、冷调、高对比',
      '批量生成 4 张变体（2×2 网格展示）',
      '图片增强：超分辨率放大、背景替换、风格迁移',
      '风格迁移：水彩、插画、赛博朋克、3D、素描、复古',
      '生成图片可保存至灵感库',
    ],
    path: '/ai/image',
  },
  {
    icon: <Mic size={20} />,
    title: 'AI 数字人',
    desc: '照片 + 音频 → 口型同步视频，支持 6 种模式覆盖不同场景需求。',
    color: '#06B6D4',
    highlights: [
      '6 种工作模式：手动配置、AI写稿、一键成片、批量生成、多语言、课程培训',
      '手动模式：选图 → 音频（TTS/上传）→ 参数设置 → 生成，4步完成',
      'AI写稿：输入主题 → DeepSeek 自动生成口播脚本（3个变体可选）',
      '一键成片：输入主题 → 全自动流水线（写稿→配音→生成）',
      '批量生成：多个主题逐条处理，每个独立跟踪状态',
      '多语言：支持中文、English、日本語、한국어',
      '课程培训：粘贴长文本 → 自动拆分段落 → 逐段生成视频',
      '图片来源：上传 / 灵感库 / URL，三种方式灵活选择',
      '6 种豆包 TTS 音色：标准女声、自然女声、甜美女声、知性女声、标准男声、自然男声',
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
    desc: '短视频自动合成，支持分镜生成、字幕叠加、BGM 混音，可一键成片。',
    color: '#F43F5E',
    highlights: [
      '3 步流程：设定方向 → 分镜预览 → 生成合并',
      '9 种风格预设：抖音热门、科技、旅行Vlog、美食、时尚、知识科普、产品测评、情感、纪录片',
      '每种风格自动推荐时长、BGM、字幕样式',
      '3 个画质等级：标准 / 高清 / 超高清',
      'AI 自动生成分镜脚本（可手动编辑每镜的视觉描述和字幕）',
      '多模型支持：Wan 2.6、HappyHorse、Seedance Fast/Pro/Lite',
      'FFmpeg 合并：多段视频 + BGM + 字幕合成最终成片',
      '一键成片模式：全自动生成，无需手动干预',
      '灵感库素材直接引用',
    ],
    path: '/ai/video',
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
    a: '当前支持中文、英语、日语、韩语四种语言。AI 写稿功能会自动使用目标语言生成脚本。TTS 音色目前主要为中文优化，后续会扩展专用多语言音色。',
  },
  {
    q: '如何获得更好的 AI 生成效果？',
    a: '提示词的清晰度直接影响输出质量：(1) 提供具体细节而非笼统描述；(2) 使用灵感库中的素材作为参考；(3) 善用"去 AI 味"功能让文案更自然；(4) 批量生成多个变体，选择最佳的。',
  },
  {
    q: 'TTS 语音合成失败怎么办？',
    a: '请检查：(1) 文本不超过2000字；(2) 网络连接正常；(3) 尝试切换不同音色。如果问题持续，请通过反馈功能联系我们。',
  },
  {
    q: '数字人视频生成需要多长时间？',
    a: '通常需要 30 秒到 2 分钟，取决于视频分辨率（480P 更快，720P 稍慢）。批量生成模式下，多个视频会按顺序逐个处理。',
  },
  {
    q: '如何下载生成的视频？',
    a: '在视频生成完成后，点击视频下方的"下载"按钮即可保存到本地。也可以点击"保存"将视频链接存入灵感库。',
  },
  {
    q: '灵感库的存储空间有多大？',
    a: '免费版 100 条，专业版和团队版无限制。灵感条目支持文本、图片、视频等多种类型，图片和视频文件存储在云端。',
  },
  {
    q: '支持哪些平台的内容发布？',
    a: '文案功能支持小红书、抖音（短视频脚本）、微信公众号、微博四大平台的风格适配。多平台改写功能可一键将同一内容转换为不同平台的风格。',
  },
  {
    q: '如何联系技术支持？',
    a: '通过本页面的"意见反馈"标签提交问题，我们会在 24 小时内回复。也可以通过反馈表单提交功能建议。',
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
      { step: 1, content: '进入 AI 创作中心，点击"AI 文案"' },
      { step: 2, content: '（可选）从灵感库选择参考素材' },
      { step: 3, content: '选择内容类型：小红书/抖音脚本/公众号文章' },
      { step: 4, content: '选择写作风格，开启"去 AI 味"获得更自然的文案' },
      { step: 5, content: '点击"生成文案"，查看结果' },
      { step: 6, content: '可用"多平台改写"一键适配其他平台' },
    ],
  },
  {
    title: '数字人一键成片',
    icon: <Mic size={18} />,
    color: '#06B6D4',
    steps: [
      { step: 1, content: '进入 AI 数字人页面，顶部切换到"一键成片"模式' },
      { step: 2, content: '先选择一张角色照片（上传/灵感库/URL）' },
      { step: 3, content: '输入口播主题，选择文案风格和 TTS 音色' },
      { step: 4, content: '点击"一键成片"，系统自动完成全部流程' },
      { step: 5, content: '等待约 1-2 分钟，视频生成后可预览、下载或保存' },
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
