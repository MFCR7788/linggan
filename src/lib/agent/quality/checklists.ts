// 审核Agent 检查清单 — 从 System Prompt "输出质量自检" 和 Skill "质量标准" 提取
// 纯 pattern/function 检测，零 LLM 调用

import type { ContentType, ChecklistItem, QualityChecklist, QualityFinding } from './types';

// ─── 工具名 → 内容类型映射 ──────────────────────────────────

const TOOL_TO_CONTENT_TYPE: Record<string, ContentType> = {
  generate_copywriting: 'copywriting',
  generate_image: 'image',
  edit_image: 'image',
  generate_grid_images: 'image',
  analyze_image: 'image',
  generate_video: 'video',
  compose_video: 'video',
  generate_hyperframes: 'video',
  generate_product_video: 'video',
  generate_agnes_video: 'video',
  video_face_swap: 'video',
  generate_video_template: 'video',
  generate_animate_video: 'video',
  generate_digital_human: 'digital_human',
  extract_content: 'content_extract',
  douyin_transcript: 'content_extract',
  summarize: 'content_extract',
  extract_schedule: 'content_extract',
  read_document: 'content_extract',
  analyze_link: 'content_extract',
  suggest_content_ideas: 'content_extract',
  synthesize_speech: 'tts',
  publish_content: 'publish',
  web_search: 'search',
  douyin_search: 'search',
  search_internet: 'search',
  search_inspirations: 'search',
  search_knowledge: 'search',
  search_memory: 'search',
};

// ─── 各内容类型检查清单 ────────────────────────────────────

export const COPYWRITING_CHECKLIST: QualityChecklist = {
  contentType: 'copywriting',
  items: [
    {
      id: 'no-template-words',
      description: '无"首先/其次/总而言之/综上所述"等 AI 模板词',
      severity: 'major',
      detect: /(?:^|\n)\s*(?:首先[，,]\s*|其次[，,]\s*|最后[，,]\s*|总而言之[，,]|综上所述[，,]|不难看出[，,]|值得注意的是[，,])/m,
      fixSuggestion: '请用口语化表达替换模板连接词（如"首先/其次/总而言之"），使文案更自然',
    },
    {
      id: 'no-academic-flavor',
      description: '去 AI 味：无学术化用语',
      severity: 'minor',
      detect: /由此可见|基于上述|本篇文章旨在|笔者认为|我们不难发现/,
      fixSuggestion: '请用口语化表达替换学术用语',
    },
    {
      id: 'specific-cta',
      description: 'CTA 有具体可操作指令（不是泛化的"欢迎关注"）',
      severity: 'minor',
      detect: (output: string) => {
        // 有 CTA 但全是泛词
        const hasCta = /欢迎关注|点赞|收藏|评论|点击|关注我|转发|分享/.test(output);
        if (!hasCta) return false; // 无 CTA 不报错（有些文案不需要）
        const hasSpecificCta = /评论区(?:扣\d|告诉|聊聊|说说|写下|留言)|点击下方|私信|戳我|扫码|领取|限时|免费/.test(output);
        return hasCta && !hasSpecificCta;
      },
      fixSuggestion: 'CTA 过于泛化（如"欢迎关注"），建议改为具体可操作指令，如"评论区扣1""点击下方链接""私信领取"',
    },
    {
      id: 'platform-title-length',
      description: '标题不过长（小红书 ≤20 字）',
      severity: 'minor',
      detect: (output: string) => {
        const match = output.match(/^(?:#+\s*)?(.+)$/m);
        if (!match) return false;
        const title = match[1].trim();
        return title.length > 25;
      },
      fixSuggestion: '标题过长（>25字），部分平台会截断，请精简至20字以内',
    },
    {
      id: 'has-structure',
      description: '输出有分段结构，不是一大段文字',
      severity: 'major',
      detect: (output: string) => {
        const len = output.trim().length;
        // 超过 200 字但只有 1-2 个换行 = 缺少结构
        return len > 200 && (output.match(/\n/g)?.length ?? 0) < 2;
      },
      fixSuggestion: '输出为一大段文字，缺少分段结构。建议按"钩子 → 痛点 → 解决方案 → CTA"分段',
    },
  ],
};

export const IMAGE_CHECKLIST: QualityChecklist = {
  contentType: 'image',
  items: [
    {
      id: 'prompt-completeness',
      description: 'Prompt 包含 5 维度：主体外观 + 场景 + 光影 + 色彩 + 风格',
      severity: 'major',
      detect: (output: string, data?: unknown) => {
        // 检查工具返回的 prompt（在 data 中）
        const prompt = (data as Record<string, unknown> | undefined)?.prompt as string
          || (data as Record<string, unknown> | undefined)?.visualPrompt as string
          || output;
        if (!prompt || prompt.length < 20) return false;
        const keywords = [/主体|人物|产品|物体/, /场景|背景|环境/, /光|影|亮|暗|柔/, /色|调|暖|冷/, /风格|写实|插画|摄影|渲染/];
        const missing = keywords.filter((kw) => !kw.test(prompt));
        return missing.length >= 3; // 缺 3 个以上维度算问题
      },
      fixSuggestion: 'Prompt 缺少关键描述维度（主体外观/场景/光影/色彩/风格），建议补充',
    },
    {
      id: 'series-consistency',
      description: '系列图使用相同 seed 保持风格一致',
      severity: 'minor',
      detect: (output: string, data?: unknown) => {
        const count = (data as Record<string, unknown> | undefined)?.count as number
          || (data as Record<string, unknown> | undefined)?.n as number;
        const seed = (data as Record<string, unknown> | undefined)?.seed as number | undefined;
        return (count ?? 1) > 1 && seed === undefined;
      },
      fixSuggestion: '多张图片生成时未设置 seed，可能导致风格不一致',
    },
    {
      id: 'image-url-valid',
      description: '生成的图片 URL 可访问',
      severity: 'critical',
      detect: (output: string) => {
        // 检查是否包含有效 URL
        const hasUrl = /https?:\/\/[^\s"'<>]+/.test(output);
        // 检查是否有明显错误信息
        const hasError = /失败|错误|error|failed|timeout/i.test(output);
        return hasError || !hasUrl;
      },
      fixSuggestion: '图片生成可能失败，请检查返回结果中的错误信息',
    },
  ],
};

export const VIDEO_CHECKLIST: QualityChecklist = {
  contentType: 'video',
  items: [
    {
      id: 'storyboard-count',
      description: '分镜数量 ≥ 3',
      severity: 'major',
      detect: (output: string, data?: unknown) => {
        const sceneCount = (data as Record<string, unknown> | undefined)?.sceneCount as number
          || (data as Record<string, unknown> | undefined)?.shotCount as number;
        if (sceneCount !== undefined) return sceneCount < 3;
        return false; // 无法判断时放过
      },
      fixSuggestion: '分镜数量不足（<3），视频过于单调，建议增加到3-5个分镜',
    },
    {
      id: 'subtitle-length',
      description: '每段字幕 5-15 字（口语化短句）',
      severity: 'minor',
      detect: (output: string, data?: unknown) => {
        const subtitles = (data as Record<string, unknown> | undefined)?.subtitles as string[];
        if (!subtitles || subtitles.length === 0) return false;
        // 检查是否有超长字幕
        return subtitles.some((s) => s.length > 20);
      },
      fixSuggestion: '部分字幕超过20字，建议精简为口语化短句（5-15字/条）',
    },
    {
      id: 'bgm-selected',
      description: 'BGM 风格已选择',
      severity: 'minor',
      detect: (output: string, data?: unknown) => {
        const bgm = (data as Record<string, unknown> | undefined)?.bgmStyle as string
          || (data as Record<string, unknown> | undefined)?.bgm as string;
        return !bgm || bgm === 'auto'; // auto 不算"已选择"
      },
      fixSuggestion: 'BGM 风格未明确指定，建议根据内容风格选择（tech/chill/hype）',
    },
  ],
};

export const DIGITAL_HUMAN_CHECKLIST: QualityChecklist = {
  contentType: 'digital_human',
  items: [
    {
      id: 'script-length',
      description: '脚本 ≤ 100 字（约 20 秒，超了会失败）',
      severity: 'critical',
      detect: (output: string, data?: unknown) => {
        const script = (data as Record<string, unknown> | undefined)?.script as string || output;
        return script.length > 120;
      },
      fixSuggestion: '数字人脚本过长（>120字），可能超出最大时长限制（~20秒）',
    },
    {
      id: 'has-hook',
      description: '开头有钩子（前 3 秒抓住注意力）',
      severity: 'major',
      detect: (output: string, data?: unknown) => {
        const script = (data as Record<string, unknown> | undefined)?.script as string || output;
        if (script.length < 20) return false;
        // 开头 30 字内没有疑问/惊叹/数字/对比
        const opening = script.substring(0, 30);
        return !/[？?！!0-9]/.test(opening) && !/最|第一|竟然|居然|原来|终于/.test(opening);
      },
      fixSuggestion: '数字人脚本开头缺少钩子（疑问/惊叹/数据/对比），前3秒吸引力不足',
    },
    {
      id: 'voice-specified',
      description: 'TTS 音色已指定',
      severity: 'minor',
      detect: (output: string, data?: unknown) => {
        const voice = (data as Record<string, unknown> | undefined)?.voice as string
          || (data as Record<string, unknown> | undefined)?.voiceStyle as string;
        return !voice;
      },
      fixSuggestion: '未指定 TTS 音色，可能使用默认音色',
    },
  ],
};

export const CONTENT_EXTRACT_CHECKLIST: QualityChecklist = {
  contentType: 'content_extract',
  items: [
    {
      id: 'source-attribution',
      description: '已标注平台和来源链接',
      severity: 'major',
      detect: (output: string) => {
        if (output.length < 50) return false;
        const hasSource = /来源[：:]|平台[：:]|原文[：:]|出自[：:]|from[：:]/i.test(output);
        return !hasSource;
      },
      fixSuggestion: '提取内容缺少来源标注，请补充平台和链接信息',
    },
    {
      id: 'extract-method',
      description: '提取方式已说明（语音识别/网页提取/API）',
      severity: 'minor',
      detect: (output: string) => {
        if (output.length < 50) return false;
        return !/语音识别|网页提取|API|视频转文字|文档解析|自动提取/i.test(output);
      },
      fixSuggestion: '未说明内容提取方式，建议标注（如"通过语音识别提取"）',
    },
  ],
};

export const TTS_CHECKLIST: QualityChecklist = {
  contentType: 'tts',
  items: [
    {
      id: 'tts-text-length',
      description: '配音文本不宜过长（单次 ≤500 字）',
      severity: 'major',
      detect: (output: string, data?: unknown) => {
        const text = (data as Record<string, unknown> | undefined)?.text as string || output;
        return text.length > 500;
      },
      fixSuggestion: '配音文本过长（>500字），建议分段合成以避免超时',
    },
  ],
};

export const PUBLISH_CHECKLIST: QualityChecklist = {
  contentType: 'publish',
  items: [
    {
      id: 'platform-specified',
      description: '目标平台已指定',
      severity: 'critical',
      detect: (output: string, data?: unknown) => {
        const platform = (data as Record<string, unknown> | undefined)?.platform as string;
        return !platform;
      },
      fixSuggestion: '未指定发布平台，请选择目标平台（公众号/微博/小红书等）',
    },
  ],
};

export const SEARCH_CHECKLIST: QualityChecklist = {
  contentType: 'search',
  items: [
    {
      id: 'search-has-results',
      description: '搜索结果非空',
      severity: 'major',
      detect: (output: string) => {
        return output.length < 10 || /没有(找到|相关|搜索)/.test(output);
      },
      fixSuggestion: '搜索结果为空或不足，建议更换关键词或来源重试',
    },
  ],
};

// ─── 查找函数 ──────────────────────────────────────────────

const ALL_CHECKLISTS: Record<ContentType, QualityChecklist> = {
  copywriting: COPYWRITING_CHECKLIST,
  image: IMAGE_CHECKLIST,
  video: VIDEO_CHECKLIST,
  digital_human: DIGITAL_HUMAN_CHECKLIST,
  content_extract: CONTENT_EXTRACT_CHECKLIST,
  tts: TTS_CHECKLIST,
  publish: PUBLISH_CHECKLIST,
  search: SEARCH_CHECKLIST,
};

/** 根据工具名获取内容类型 */
export function getContentTypeForTool(toolName: string): ContentType | null {
  return TOOL_TO_CONTENT_TYPE[toolName] || null;
}

/** 根据工具名获取质量检查清单 */
export function getChecklistForTool(toolName: string): QualityChecklist | null {
  const ct = getContentTypeForTool(toolName);
  if (!ct) return null;
  return ALL_CHECKLISTS[ct];
}

/** 根据内容类型获取检查清单 */
export function getChecklist(contentType: ContentType): QualityChecklist {
  return ALL_CHECKLISTS[contentType];
}

/** 运行质量检查，返回所有问题发现（仅失败的） */
export function runQualityCheck(
  checklist: QualityChecklist,
  output: string,
  data?: unknown
): QualityFinding[] {
  const findings: QualityFinding[] = [];

  for (const item of checklist.items) {
    let detected = false;
    try {
      if (item.detect instanceof RegExp) {
        detected = item.detect.test(output);
      } else {
        detected = item.detect(output, data);
      }
    } catch {
      // 检测函数异常时跳过该项
      continue;
    }

    if (detected) {
      findings.push({
        checklistId: checklist.contentType,
        itemId: item.id,
        severity: item.severity,
        passed: false,
        detail: item.description,
        autoFixed: false,
      });
    }
  }

  return findings;
}
