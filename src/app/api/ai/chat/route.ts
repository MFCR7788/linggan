import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek, callDeepSeekStream, callDoubaoChat, callQwen, callOpenRouter, generateImage, submitVideoTask, callDoubaoVision, getVideoTaskStatus, fetchWeather } from '@/lib/ai-services';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { isLinkInput, normalizeUrl, analyzeLink, extractDocuments, type LinkContext } from '@/lib/assistant/chat-helpers';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { detectIntent, buildPrompt, LINGJI_IDENTITY, GEN_JSON_TEMPLATE } from '@/lib/assistant';
import { MemoryManager } from '@/lib/assistant/memory/manager';
import { BuiltinMemoryProvider } from '@/lib/assistant/memory/builtin-provider';
import { KnowledgeManager } from '@/lib/assistant/knowledge/manager';
import { InspirationKnowledgeProvider } from '@/lib/assistant/knowledge/inspiration-provider';
import { PublicKnowledgeProvider } from '@/lib/assistant/knowledge/public-provider';
import { WebSearchProvider } from '@/lib/assistant/knowledge/web-search-provider';
import { generateEmbedding } from '@/lib/assistant/embedding';
import { LongTermMemoryProvider } from '@/lib/memory/long-term/provider';
import { compressHistory, buildCompressedMessages } from '@/lib/assistant/context-compressor';
import { SkillsHub } from '@/lib/assistant/skills/hub';
import type { DetectedIntent, IntentType, GenType } from '@/lib/assistant';

// ====== 去除 Markdown 格式 ======
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')          // **粗体**
    .replace(/__([^_]+)__/g, '$1')            // __粗体__
    .replace(/\*([^*\n]+)\*/g, '$1')           // *斜体*
    .replace(/_([^_\n]+)_/g, '$1')             // _斜体_
    .replace(/`{1,3}[^`\n]*`{1,3}/g, '')      // `代码`
    .replace(/^#{1,6}\s+/gm, '')               // ### 标题
    .replace(/^>\s*/gm, '')                     // > 引用
    .replace(/^[-*+]\s+/gm, '· ')              // - 无序列表
    .replace(/^\d+\.\s+/gm, '')                 // 1. 有序列表
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // [文字](链接)
    .replace(/!\[.*?\]\([^)]+\)/g, '')          // ![图片](链接)
    .replace(/^---+\s*$/gm, '')                 // --- 分隔线
    .replace(/\n{3,}/g, '\n\n')                 // 多余空行合并
    .trim();
}

// ====== JSON 提取（支持 markdown 代码块） ======
function extractJSON(response: string): any {
  // 先尝试提取 markdown 代码块中的 JSON
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch {}
  }
  // 回退：找第一个 { 到最后一个 } 的完整 JSON
  const firstOpen = response.indexOf('{');
  const lastClose = response.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose > firstOpen) {
    try { return JSON.parse(response.substring(firstOpen, lastClose + 1)); } catch {}
  }
  return null;
}

// ====== 生成兜底执行 ======
async function executeGenerationFallback(
  intent: DetectedIntent,
  content: string,
  images: string[],
  videos: string[],
  analysis: any
): Promise<void> {
  const genType = intent.genType;
  if (!genType) return; // 非生成意图，不执行

  // 提取纯净的描述文本
  const cleanContent = (text: string): string =>
    text
      .replace(/生成.*(?:图片|图像|照片|视频|动画|短片)|制作.*(?:图片|视频)|帮我|请|我想要|我要|复刻|克隆|模仿/gi, '')
      .replace(/[，。！？、\s]+/g, ' ')
      .trim();

  switch (genType) {
    case 'text2vid':
    case 'img2vid':
    case 'vid2vid': {
      if (analysis.generatedVideo) return;

      let videoPrompt: string;
      if (genType === 'img2vid' && images.length > 0) {
        try {
          const visionDesc = await callDoubaoVision(images[0],
            `Please describe this image in detail in English (objects, scene, style, colors, composition, lighting, movement).`);
          const desc = cleanContent(content) || 'generate a video based on this image';
          videoPrompt = `${visionDesc.description || 'A beautiful scene'}. ${desc}`;
        } catch {
          videoPrompt = cleanContent(content) || 'A beautiful cinematic scene';
        }
      } else if (genType === 'vid2vid' && videos.length > 0) {
        try {
          const visionDesc = await callDoubaoVision(videos[0],
            `Please describe this video scene in detail in English (setting, objects, people, colors, lighting, mood).`);
          const desc = cleanContent(content) || 'create a similar style video';
          videoPrompt = `${visionDesc.description || 'A cinematic video scene'}. ${desc}`;
        } catch {
          videoPrompt = cleanContent(content) || 'A cinematic video scene';
        }
      } else {
        videoPrompt = cleanContent(content);
        if (!videoPrompt || videoPrompt.length < 5) {
          videoPrompt = content.substring(0, 500);
        }
      }

      console.log(`[${genType} 兜底] prompt:`, videoPrompt.substring(0, 100));
      try {
        const result = await submitVideoTask(videoPrompt.substring(0, 500), 5);
        if (result.taskId) {
          analysis.generatedVideo = { taskId: result.taskId, status: result.status, prompt: videoPrompt };
        }
      } catch (e) {
        console.warn(`${genType} 兜底失败:`, e);
      }
      break;
    }

    case 'text2img':
    case 'img2img': {
      if (analysis.generatedImage) return;

      let imgPrompt: string;
      if (genType === 'img2img' && images.length > 0) {
        try {
          const visionDesc = await callDoubaoVision(images[0],
            `Please describe this image in detail in English (objects, scene, style, colors, composition). Additional requirements: ${cleanContent(content) || 'create a new version of this image'}`);
          imgPrompt = `${visionDesc.description}. Style transformation: ${cleanContent(content) || 'new creative version'}`;
        } catch {
          imgPrompt = cleanContent(content) || 'A beautiful artistic image';
        }
      } else {
        imgPrompt = cleanContent(content);
        if (!imgPrompt || imgPrompt.length < 5) {
          imgPrompt = content.substring(0, 500);
        }
      }

      console.log(`[${genType} 兜底] prompt:`, imgPrompt.substring(0, 100));
      try {
        const img = await generateImage(imgPrompt);
        analysis.generatedImage = img;
      } catch (e) {
        console.warn(`${genType} 兜底失败:`, e);
      }
      break;
    }
  }
}

// ====== POST 处理器 ======
export const POST = withAuth(async ({ request, user }) => {
  const modelErrors: string[] = [];
  try {
    const body = await request.json();
    const { content = '', images = [], videos = [], documents = [], searchResults, session_id, model: selectedModel, stream: useStream } = body;

    if (!content && images.length === 0 && videos.length === 0 && documents.length === 0) {
      return NextResponse.json({
        success: false,
        error: '内容不能为空'
      }, { status: 400 });
    }

    // 基础 prompt 注入检测
    if (content && typeof content === 'string') {
      const lower = content.toLowerCase();
      const injectionPatterns = [
        /ignore\s+(all\s+)?(previous|prior|above|your)\s+instructions?/i,
        /system\s*:\s*you\s+are\s+now/i,
        /pretend\s+you\s+are\s+(a\s+)?(different|another)/i,
        /you\s+are\s+now\s+(DAN|jailbroken|unrestricted)/i,
        /forget\s+(all\s+)?your\s+(training|programming|rules)/i,
        /<\|im_start\|>/i,
        /<\|im_end\|>/i,
      ];
      if (injectionPatterns.some(p => p.test(lower))) {
        return NextResponse.json({
          success: false,
          error: '检测到异常输入模式，请重新描述您的需求'
        }, { status: 400 });
      }
    }

    const hasImages = images.length > 0;
    const hasVideos = videos.length > 0;
    const hasDocuments = documents.length > 0;
    const isMultimodal = hasImages || hasVideos;

    const creditCost = CREDIT_COSTS.ai_text.perCall;
    try {
      await consume(user.id, creditCost, 'ai_chat', 'AI 对话', { contentLen: content.length, hasImages, hasVideos, hasDocuments });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    // 加载历史消息作为上下文，长对话自动压缩
    let historyMessages: { role: 'user' | 'assistant'; content: string }[] = [];
    let historySummary = '';
    if (session_id) {
      try {
        const supabase = createAdminClient();
        const { data: prevMessages } = await supabase
          .from('chat_messages')
          .select('type, content')
          .eq('session_id', session_id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });
        if (prevMessages) {
          const MAX_HISTORY = 40;
          const allMessages = prevMessages.map(m => ({
            role: m.type === 'user' ? 'user' as const : 'assistant' as const,
            content: m.content,
          }));

          // 超过阈值时压缩较早的消息
          const { compressedSummary, recentMessages, wasCompressed } = await compressHistory(allMessages);
          if (wasCompressed) {
            historySummary = compressedSummary;
          }
          historyMessages = recentMessages.length > MAX_HISTORY
            ? recentMessages.slice(-MAX_HISTORY)
            : recentMessages;
        }
      } catch (e) {
        console.warn('加载历史消息失败:', e);
      }
    }

    // ====== Layer 1: 链接检测与路由 ======
    const isLink = !hasImages && !hasVideos && !hasDocuments && isLinkInput(content);
    const linkContext: LinkContext | null = isLink
      ? await analyzeLink(request.url, normalizeUrl(content))
      : null;

    // ====== 文档附件抽取 ======
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const documentContext: string[] = hasDocuments && supabaseUrl
      ? await extractDocuments(documents, user.id, supabaseUrl)
      : [];

    // ====== 意图检测 ======
    let intent: DetectedIntent;

    if (hasDocuments && documentContext.length > 0) {
      // 文档内容直接走 office 意图
      intent = {
        type: 'office', label: '文档分析', needsChat: true,
        hasImage: false, hasVideo: false,
        description: '文档内容分析与总结',
        wantsGeneration: false,
      };
    } else if (linkContext) {
      // Layer 1: 链接类型决定路由目标
      switch (linkContext.linkType) {
        case 'article':
          intent = {
            type: 'writing', label: '链接内容处理', needsChat: true,
            hasImage: false, hasVideo: false,
            description: '网页/文章内容分析与创作',
            wantsGeneration: false,
          };
          break;
        case 'image':
          intent = {
            type: 'image', label: '图像处理&生成', needsChat: true,
            hasImage: false, hasVideo: false,
            description: '链接图片分析与描述',
            wantsGeneration: false,
          };
          break;
        case 'video':
          intent = {
            type: 'video', label: '视频分析&复刻', needsChat: true,
            hasImage: false, hasVideo: false,
            description: '链接视频内容分析',
            wantsGeneration: false,
          };
          break;
      }
    } else {
      // Layer 2: 文本意图识别
      intent = detectIntent(content, hasImages, hasVideos, historyMessages);
    }

    const isGeneration = intent.wantsGeneration;

    console.log(`[意图] ${intent.label}${intent.genType ? ' → ' + intent.genType : ''} | content: "${content.substring(0, 50)}..."`);

    // ====== 天气查询：提取城市并获取实时天气 ======
    let weatherData: import('@/lib/ai-services').WeatherData | null = null;
    if (intent.type === 'weather') {
      // 去掉常见的天气/时间/疑问词，剩下的中文字符最可能是城市名
      const noiseWords = /的|天气|气温|温度|下雨|下雪|刮风|雾霾|空气质量|预报|今天|明天|后天|昨天|最近|未来|这周|本周|下周|周末|怎么样|如何|冷不冷|热不热|会不会|会下|热|冷|带伞|穿什么|紫外线|多云|阴天|晴天|台风|暴雪|冰雹|寒潮|降温|升温|变天|查一下|帮我看|搜一下|一下|一查/g;
      const cleaned = content.replace(noiseWords, ' ').trim();
      // 提取第一个连续2-3个中文字符作为城市名
      const cityMatch = cleaned.match(/[\u4e00-\u9fff]{2,3}/);
      const city = cityMatch ? cityMatch[0] : '';

      if (city) {
        console.log(`[天气] 检测到城市: "${city}" (原始: "${content}")`);
        weatherData = await fetchWeather(city);
        if (weatherData) {
          console.log(`[天气] 获取成功: ${weatherData.current.desc} ${weatherData.current.temp}°C`);
        } else {
          console.log(`[天气] fetchWeather 返回 null，城市="${city}"`);
        }
      } else {
        console.log(`[天气] 未检测到城市名，原始: "${content}"`);
      }
    }

    // 注入文档抽取文本（在上下文检索前计算，以便用完整内容搜索记忆/知识）
    const effectiveContent = documentContext.length > 0
      ? `用户上传了文档文件，以下是文档内容：\n\n${documentContext.join('\n\n---\n\n')}\n\n用户指令：${content || '请分析以上文档内容，给出总结、关键要点和创作建议'}`
      : content;

    // ====== V2.0: 多源上下文检索（记忆 + 知识库） ======
    let memoryBlock = '';
    let knowledgeBlock = '';
    let contextStats: { memoriesUsed: number; inspirationsUsed: number; knowledgeUsed: number; webSearchUsed: boolean; skillsMatched: number } | null = null;
    try {
      const ctxEmbedding = await generateEmbedding(effectiveContent || ' ').catch(() => [] as number[]);
      if (ctxEmbedding.length > 0) {
        const memMgr = new MemoryManager();
        const builtinMem = new BuiltinMemoryProvider();
        await builtinMem.initialize(user.id);
        memMgr.addProvider(builtinMem);

        const kMgr = new KnowledgeManager();
        kMgr.addProvider(new InspirationKnowledgeProvider(user.id));
        kMgr.addProvider(new PublicKnowledgeProvider());
        kMgr.addProvider(new WebSearchProvider());

        const [mBlock, kResult] = await Promise.all([
          memMgr.prefetchAll(effectiveContent, ctxEmbedding),
          kMgr.search(effectiveContent, ctxEmbedding, user.id),
        ]);

        memoryBlock = mBlock;
        const allKnowledge = kResult.results;
        if (allKnowledge.length > 0) {
          knowledgeBlock = `<knowledge-context>\n${allKnowledge
            .map((r, i) => `[${r.source || '知识'}${i + 1}] ${r.title}\n${r.content.slice(0, 300)}`)
            .join('\n\n')}\n</knowledge-context>`;
        }
        contextStats = {
          memoriesUsed: memoryBlock ? 1 : 0,
          inspirationsUsed: allKnowledge.filter(r => r.source === '你的灵感库').length,
          knowledgeUsed: allKnowledge.filter(r => r.source !== '你的灵感库' && r.source !== '联网搜索').length,
          webSearchUsed: kResult.fellBackToWeb,
          skillsMatched: 0,
        };
      }
    } catch (e) {
      console.warn('[V2] 上下文检索失败:', e);
    }

    // ====== V2.0: 技能匹配（精准匹配 1 个，支持 /技能名 指定） ======
    let skillsBlock = '';
    let skillsMatched = 0;
    try {
      const hub = new SkillsHub({ userId: user.id });
      await hub.initialize();

      // 斜杠指令别名 — 让用户用简短名称强制指定技能
      const SLASH_ALIASES: Record<string, string> = {
        xiaohongshu: 'xiaohongshu-optimizer',
        douyin: 'douyin-script',
        wechat: 'wechat-formatter',
        seo: 'seo-title-gen',
        remix: 'cross-platform',
        hotspot: 'hotspot-analyzer',
        draw: 'ai-image-prompt',
        storyboard: 'video-storyboard',
      };

      let targetSkill: import('@/lib/assistant/types').SkillDefinition | null = null;

      // 1. 检测 /技能名 斜杠指令
      const slashMatch = effectiveContent.match(/^\/(\S+)/);
      if (slashMatch) {
        const cmd = slashMatch[1].toLowerCase();
        // 先查别名，再查原始 name
        const resolvedName = SLASH_ALIASES[cmd] || cmd;
        const allSkills = hub.registry.getAll();
        targetSkill = allSkills.find(
          s => s.name.toLowerCase() === resolvedName
        ) ?? null;
        if (targetSkill) {
          console.log(`[技能] 斜杠指令 /${cmd} → ${targetSkill.displayName}`);
        }
      }

      // 2. 无斜杠指令 → 语义匹配最相关的 1 个技能
      if (!targetSkill) {
        const matches = hub.matchSkills(effectiveContent, 1);
        if (matches.length > 0 && matches[0].score >= 0.2) {
          targetSkill = matches[0].skill;
          console.log(`[技能] 自动匹配: ${targetSkill.displayName} (score=${matches[0].score.toFixed(2)})`);
        }
      }

      // 3. 构建技能块（仅注入匹配到的 1 个技能，完整 prompt）
      if (targetSkill) {
        skillsBlock = [
          `<active-skill id="${targetSkill.name}" name="${targetSkill.displayName}">`,
          '请严格遵循以下技能指令来完成用户的请求：',
          '',
          targetSkill.promptTemplate,
          '</active-skill>',
        ].join('\n');
        skillsMatched = 1;

        // 构建可用指令列表供 AI 向用户建议
        const allInstalled = hub.registry.getAll().filter(
          s => hub.installedSkillIds.includes(s.id) || s.visibility === 'official'
        );
        if (allInstalled.length > 0) {
          const cmdList = allInstalled.map(s => {
            const alias = Object.entries(SLASH_ALIASES).find(([, v]) => v === s.name)?.[0];
            return alias ? `/${alias}` : `/${s.name}`;
          }).join(' ');
          skillsBlock += `\n\n<available-commands>\n用户可用的技能指令：${cmdList}\n在对话中可以向用户建议使用这些指令来精准激活技能。\n</available-commands>`;
        }

        if (contextStats) contextStats.skillsMatched = skillsMatched;
      }
    } catch (e) {
      console.warn('[V2] 技能加载失败:', e);
    }

    // ====== 构造 Prompt ======

    const { systemPrompt: baseSystemPrompt, userPrompt: baseUserPrompt, requiresJSON } = buildPrompt(intent, effectiveContent);

    // V2.0: 注入记忆和知识上下文到 System Prompt
    const summaryBlock = historySummary ? `<conversation-summary>\n${historySummary}\n</conversation-summary>` : '';
    const systemPrompt = [summaryBlock, memoryBlock, knowledgeBlock, skillsBlock, baseSystemPrompt]
      .filter(Boolean)
      .join('\n\n---\n\n');

    let userPrompt: string;

    if (linkContext) {
      // 抓取质量判断:extractedContent 太短(<200字)说明 SSR 空壳/反爬失败
      // analyze-link 已先试 SSR,再 fallback jina.ai reader,仍 < 200 才是真没救
      // 这种情况下 LLM 容易自我合理化为"我是离线助手",必须显式说明已联网但没拿到正文
      const isFetchFailed = !linkContext.extractedContent || linkContext.extractedContent.trim().length < 200;
      const fetchFailedHint = isFetchFailed ? `
⚠️ 重要提示:这个链接(如微信公众号/知乎/小红书)的页面是 JS 动态渲染的 SPA,我们已尝试抓取但没拿到正文。
请基于你已有的知识(如果认识这个标题/主题)给出分析,绝对不要说自己"无法访问""离线""不能联网"——那是不准确的。
如果对主题也不熟悉,直接告诉用户"这个链接我们没抓到正文,你可以把全文贴过来让我分析",而不是说自己是离线助手。` : '';

      // Layer 1 链接路由：注入提取内容到对应模块
      switch (linkContext.linkType) {
        case 'article':
          userPrompt = `${systemPrompt}

用户粘贴了一个网页链接，以下是自动抓取的内容：

来源平台：${linkContext.sourcePlatform}
页面标题：${linkContext.title}
内容摘要：${linkContext.extractedContent || '(未能抓到正文)'}
原始链接：${linkContext.sourceUrl}${fetchFailedHint}

请基于以上信息(标题 + 摘要 + 你的知识),对这篇文章进行深度分析和总结:
1. 提炼核心观点和关键信息
2. 分析文章的结构和论证逻辑
3. 指出可借鉴的亮点和创作思路
4. 给出二次创作建议

请直接以自然语言输出分析内容。`;
          break;

        case 'image':
          userPrompt = `${systemPrompt}

用户粘贴了一个图片链接，以下是图片分析结果：

图片描述：${linkContext.extractedContent || '(未能获取图片描述)'}
来源链接：${linkContext.sourceUrl}${fetchFailedHint}

请基于以上信息,对这张图片进行分析:
1. 图片的内容特点和风格
2. 可能的创作用途和灵感价值
3. 如果需要类似风格/内容的图片,给出创作建议

请直接以自然语言输出分析内容。`;
          break;

        case 'video':
          const transcriptBlock = linkContext.transcript
            ? `\n视频语音逐字稿：\n${linkContext.transcript}\n`
            : '';
          userPrompt = `${systemPrompt}

用户粘贴了一个视频链接，以下是视频信息：

视频标题：${linkContext.title}
内容摘要：${linkContext.extractedContent || '(未能抓到视频描述)'}
来源链接：${linkContext.sourceUrl}${transcriptBlock}${fetchFailedHint}
请基于以上信息(标题 + 描述 + 你的知识),对这个视频进行分析:
1. 可能的内容方向和创作风格
2. 值得关注的亮点和可借鉴之处
3. 如果用户想做类似视频,给出创作建议
${linkContext.transcript ? '4. 基于逐字稿,分析视频的文案结构和表达技巧' : ''}

请直接以自然语言输出分析内容。`;
          break;
      }
    } else if (intent.hasVideo && videos.length > 0) {
      const textPart = content
        ? `用户发送了以下内容和一个视频，请理解并给出回应：\n\n${content}`
        : '用户发送了一个视频，请仔细分析视频内容。';

      if (intent.wantsGeneration) {
        userPrompt = `${systemPrompt}\n\n${textPart}\n\n用户希望基于这个参考视频生成新视频。请分析视频风格、场景、节奏等特点，给出视频复刻方案。\n\n最后按以下JSON格式返回：\n${GEN_JSON_TEMPLATE}\n\n注意：先自然对话，再输出JSON。`;
      } else {
        userPrompt = `${systemPrompt}\n\n${textPart}\n\n请仔细分析视频中的画面、场景、文字、人物、物体等所有可视内容，给出有深度、有价值的回应。如果视频中有文字，请提取并理解。直接以自然语言回复，不需要JSON格式。`;
      }
    } else if (intent.hasImage && images.length > 0) {
      const textPart = content
        ? `用户发送了以下内容，请理解并给出回应：\n\n${content}`
        : '用户发送了图片，请仔细分析图片内容。';

      if (intent.wantsGeneration) {
        userPrompt = `${systemPrompt}\n\n${textPart}\n\n请仔细分析图片中的物体、场景、文字、颜色、构图、风格等所有可视元素。\n用户希望基于这张图生成${intent.genType === 'img2vid' ? '视频' : '新图片'}。\n\n最后按以下JSON格式返回：\n${GEN_JSON_TEMPLATE}\n\n注意：先自然对话，再输出JSON。`;
      } else {
        userPrompt = `${systemPrompt}\n\n${textPart}\n\n请仔细分析图片中的物体、场景、文字、颜色、构图、风格等所有可视元素。描述你看到了什么，并根据图片内容给出有价值的见解。直接以自然语言回复，不需要JSON格式。`;
      }
    } else if (searchResults?.length > 0) {
      const searchContext = searchResults.map((r: any, i: number) =>
        `[来源${i + 1}] ${r.title}\n链接：${r.url}\n摘要：${r.snippet}`
      ).join('\n\n');

      userPrompt = `${systemPrompt}\n\n你是一位专业的研究分析师，擅长基于搜索到的信息和自身知识给出深度分析。

用户提问：${content}

以下是为你联网搜索到的相关资料：

${searchContext}

回答策略：
1. **搜索结果相关时**：基于搜索内容分析，并在相关观点后标注 [来源N]
2. **搜索结果不相关或不足时**：调用你自身的知识来回答
3. **核心要求**：无论搜索结果质量如何，都要给用户一个完整、专业、有价值的回答

注意：直接输出分析结果，不需要 JSON 包装。`;
    } else if (intent.type === 'weather' && weatherData) {
      // 天气模式：注入实时天气数据
      const forecastText = weatherData.forecast.map(f =>
        `${f.date}: ${f.desc || '晴'} ${f.minTemp}°C ~ ${f.maxTemp}°C，日出 ${f.sunrise} 日落 ${f.sunset}`
      ).join('\n');
      userPrompt = `${systemPrompt}

用户提问：${content}

以下是 ${weatherData.city} 的实时天气数据（数据来源：wttr.in）：

当前天气：
- 天气状况：${weatherData.current.desc}
- 当前温度：${weatherData.current.temp}°C
- 体感温度：${weatherData.current.feelsLike}°C
- 湿度：${weatherData.current.humidity}%
- 风速：${weatherData.current.windSpeed} km/h
- 云量：${weatherData.current.cloudCover}%

未来三天预报：
${forecastText}

请根据以上实时天气数据，用自然温馨的语气回答用户的问题。`;
    } else if (intent.type === 'weather') {
      // 天气 API 获取失败，降级为知识库 + 引导用户自行查询
      userPrompt = `${systemPrompt}

用户提问：${content}

注意：实时天气数据暂时获取失败。请基于你对气候和季节的常识性知识来回答用户：
1. 如果问题涉及具体城市的实时天气，坦诚说明暂时无法获取实时数据
2. 可以介绍该城市当前季节的一般气候特点
3. 给出通用的穿衣/出行建议
4. 建议用户查看天气预报应用获取准确的实时天气

请直接以自然语言输出，不需要JSON格式。`;
    } else {
      // 纯文本模式
      userPrompt = `${systemPrompt}\n\n${baseUserPrompt}`;
    }

    // 构造 messages
    let messages: any[];
    if ((intent.hasImage || intent.hasVideo) && (images.length > 0 || videos.length > 0)) {
      messages = [
        ...historyMessages.map(m => ({ role: m.role, content: m.content })),
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: userPrompt },
            ...images.map((url: string) => ({ type: 'image_url' as const, image_url: { url } })),
            ...videos.map((url: string) => ({ type: 'video_url' as const, video_url: { url } })),
          ]
        }
      ];
    } else {
      messages = [
        ...historyMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userPrompt }
      ];
    }

    // ====== 3. 调用 AI 模型 ======
    let analysis: any = null;
    let modelUsed = '';
    const genMaxTokens = isGeneration ? 4096 : 1000;

    // ====== Streaming 模式（仅纯文本） ======
    if (useStream && !isMultimodal) {
      const supabase = createAdminClient();
      const encoder = new TextEncoder();
      let fullContent = '';

      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of callDeepSeekStream(userPrompt, { temperature: 0.7, maxTokens: genMaxTokens })) {
              fullContent += chunk;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
            }

            // 解析完整响应
            const parsed = extractJSON(fullContent);
            if (parsed) {
              analysis = parsed;
              modelUsed = 'deepseek-stream';
            } else {
              const cleaned = fullContent.replace(/```[\s\S]*?```/g, '').trim();
              analysis = {
                response: cleaned || fullContent,
                summary: (cleaned || fullContent).substring(0, 50),
                tags: [],
                suggestions: [],
                intent: intent.label,
              };
              modelUsed = 'deepseek-stream';
            }

            // 保存 assistant 消息到 DB
            if (session_id) {
              try {
                const assistantContent = analysis.response || fullContent;
                await supabase.from('chat_messages').insert({
                  user_id: user.id,
                  session_id,
                  type: 'ai',
                  content: assistantContent,
                  metadata: { model: modelUsed, intent: intent.type },
                });
              } catch (e) { console.warn('保存 streaming 消息失败:', e); }
            }

            // 异步提取记忆（双写 Supabase + SQLite）
            if (session_id) {
              const memMgr = new MemoryManager();
              const builtin = new BuiltinMemoryProvider();
              await builtin.initialize(user.id);
              memMgr.addProvider(builtin);
              memMgr.addProvider(new LongTermMemoryProvider());
              const userMsg = content || '';
              const assistantMsg = analysis.response || '';
              const msgs = [
                ...historyMessages,
                { role: 'user' as const, content: userMsg },
                { role: 'assistant' as const, content: assistantMsg },
              ];
              memMgr.onSessionEnd(session_id, msgs as any).catch(e => console.warn('[Memory] onSessionEnd 失败:', e));
            }

            // 发送最终结果
            if (!analysis.intent) analysis.intent = intent.label;
            if (analysis.response) analysis.response = stripMarkdown(analysis.response);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              done: true,
              response: analysis.response,
              summary: analysis.summary,
              tags: analysis.tags || [],
              suggestions: analysis.suggestions || [],
              _model: modelUsed,
              _intent: intent.type,
              _context: contextStats,
            })}\n\n`));
            controller.close();
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const tryModel = async (name: string, fn: () => Promise<string>): Promise<boolean> => {
      try {
        const response = await fn();
        // 尝试提取 JSON（多模态/生成模式下 prompt 要求了 JSON 输出）
        const parsed = extractJSON(response);
        if (parsed) {
          analysis = parsed;
          modelUsed = name;
          return true;
        }
        // 没有 JSON：用模型的原始文字回复
        const cleaned = response.replace(/```[\s\S]*?```/g, '').trim();
        analysis = {
          response: cleaned || response,
          summary: (cleaned || response).replace(/<[^>]*>/g, '').substring(0, 50),
          tags: [],
          suggestions: [],
          intent: intent.label,
        };
        modelUsed = name;
        // 生成模式下标记需要兜底，非生成模式直接成功
        if (isGeneration) {
          analysis._needsGenerationFallback = true;
        }
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack : '';
        console.warn(`${name} 失败:`, msg, stack);
        modelErrors.push(`${name}: ${msg.substring(0, 200)}`);
      }
      return false;
    };

    if (selectedModel && selectedModel !== 'auto') {
      // 手动指定模型，先验证模型名称
      const validModels = ['deepseek', 'doubao', 'qwen-plus', 'qwen-vl-plus', 'qwen-turbo', 'qwen-max', 'qwen3.7-max', 'openrouter'];
      const normalizedModel = validModels.includes(selectedModel) ? selectedModel : 'qwen-plus';
      
      // 手动指定模型
      const modelMap: Record<string, () => Promise<string>> = {
        'deepseek': () => callDeepSeek(messages[messages.length - 1].content as string, { temperature: 0.7, maxTokens: genMaxTokens }),
        'doubao': () => callDoubaoChat(messages, { model: isMultimodal ? 'doubao-1.5-vision-pro-32k' : 'doubao-seed-2.0-241215', temperature: 0.7, maxTokens: genMaxTokens }),
        'qwen-vl-plus': () => callQwen(messages, { model: 'qwen-vl-plus', temperature: 0.7, maxTokens: genMaxTokens }),
        'qwen-plus': () => callQwen(messages, { model: 'qwen-plus', temperature: 0.7, maxTokens: genMaxTokens }),
        'qwen-turbo': () => callQwen(messages, { model: 'qwen-turbo', temperature: 0.7, maxTokens: genMaxTokens }),
        'qwen-max': () => callQwen(messages, { model: 'qwen-max', temperature: 0.7, maxTokens: genMaxTokens }),
        'qwen3.7-max': () => callQwen(messages, { model: 'qwen3.7-max', temperature: 0.7, maxTokens: genMaxTokens }),
        'openrouter': () => callOpenRouter(messages[messages.length - 1].content as string, { temperature: 0.7, maxTokens: genMaxTokens }),
      };
      const fallback = () => callQwen(messages, { model: 'qwen-plus', temperature: 0.7, maxTokens: genMaxTokens });

      if (modelMap[normalizedModel]) {
        await tryModel(normalizedModel, modelMap[normalizedModel]);
      } else {
        await tryModel('qwen-plus', fallback);
      }
    } else {
      // 自动选择
      if (isMultimodal) {
        // 多模态：千问视觉优先，豆包兜底
        const ok = await tryModel('qwen-vl-plus', () =>
          callQwen(messages, { model: 'qwen-vl-plus', temperature: 0.7, maxTokens: genMaxTokens }));
        if (!ok) {
          await tryModel('doubao-vision', () =>
            callDoubaoChat(messages, { model: 'doubao-1.5-vision-pro-32k', temperature: 0.7, maxTokens: genMaxTokens }));
        }
      } else {
        // 纯文本：DeepSeek 优先，豆包兜底
        const ok = await tryModel('deepseek', () =>
          callDeepSeek(messages[messages.length - 1].content as string, {
            temperature: 0.7,
            maxTokens: genMaxTokens,
          }));
        if (!ok) {
          const ok2 = await tryModel('doubao', () =>
            callDoubaoChat(messages, {
              temperature: 0.7,
              maxTokens: genMaxTokens,
            }));
          if (!ok2) {
            await tryModel('openrouter', () =>
              callOpenRouter(messages[messages.length - 1].content as string, { temperature: 0.7, maxTokens: genMaxTokens }));
          }
        }
      }
    }

    // ====== 4. JSON 重试：AI 没输出 JSON 时，用纯 JSON 指令再试一次 ======
    if (analysis?._needsGenerationFallback && intent.genType) {
      console.log(`[${intent.label}] AI 未输出 JSON，尝试纯 JSON 重试`);
      const isVideo = intent.genType === 'text2vid' || intent.genType === 'img2vid' || intent.genType === 'vid2vid';
      const jsonOnlyPrompt = `请为以下需求生成一个 JSON，不要输出任何其他内容，不要用 markdown 代码块，只输出纯 JSON：

需求：${content}
生成类型：${isVideo ? '视频' : '图片'}
描述：${intent.description}

JSON 格式：
{
  "response": "对用户需求的创意回复（一句话）",
  "summary": "一句话概括",
  "tags": ["标签1", "标签2"],
  "suggestions": ["建议1"],
  "intent": "${intent.label}",
  "generationRequest": {
    "type": "${intent.genType}",
    "prompt": "英文生成提示词"
  }
}`;

      await tryModel('deepseek-json', () =>
        callDeepSeek(jsonOnlyPrompt, { temperature: 0.3, maxTokens: genMaxTokens }));
    }

    // ====== 5. 兜底 ======
    if (!analysis) {
      analysis = {
        response: isGeneration
          ? `好的，正在为你${intent.genType?.includes('vid') ? '生成视频' : '生成图片'}：${content.substring(0, 100)}`
          : (content || (hasImages ? '已收到图片' : (hasVideos ? '已收到视频' : '已收到'))),
        summary: content ? content.substring(0, 30) + (content.length > 30 ? '...' : '') : '内容已记录',
        tags: ['灵感'],
        suggestions: ['保存到灵感库'],
        intent: intent.label,
      };
    }

    // 执行生成兜底（AI 没输出 generationRequest 但用户明确表达了意图）
    if (isGeneration) {
      await executeGenerationFallback(intent, content, images, videos, analysis);
    }

    // 处理 AI 输出的 generationRequest
    if (analysis.generationRequest?.type && analysis.generationRequest?.prompt) {
      const gen = analysis.generationRequest;
      const prompt = gen.prompt.trim();

      switch (gen.type) {
        case 'text2img':
          if (!analysis.generatedImage) {
            try { analysis.generatedImage = await generateImage(prompt); } catch (e) { console.warn('文生图失败:', e); }
          }
          break;

        case 'img2img':
          if (!analysis.generatedImage && images.length > 0) {
            try {
              const visionDesc = await callDoubaoVision(images[0],
                `Please describe this image in detail in English. Additional requirements: ${prompt}`);
              const enhancedPrompt = `${visionDesc.description || ''}. Style transformation: ${prompt}`;
              analysis.generatedImage = await generateImage(enhancedPrompt);
            } catch (e) { console.warn('图生图失败:', e); }
          }
          break;

        case 'text2vid':
          if (!analysis.generatedVideo) {
            try {
              const result = await submitVideoTask(prompt, 5);
              if (result.taskId) analysis.generatedVideo = { taskId: result.taskId, status: result.status, prompt };
            } catch (e) { console.warn('文生视频失败:', e); }
          }
          break;

        case 'img2vid':
          if (!analysis.generatedVideo && images.length > 0) {
            try {
              const visionDesc = await callDoubaoVision(images[0],
                `Please describe this image in detail in English. Additional requirements: ${prompt}`);
              const enhancedPrompt = `${visionDesc.description || ''}. ${prompt}`;
              const result = await submitVideoTask(enhancedPrompt, 5);
              if (result.taskId) analysis.generatedVideo = { taskId: result.taskId, status: result.status, prompt };
            } catch (e) { console.warn('图生视频失败:', e); }
          }
          break;

        case 'vid2vid':
          if (!analysis.generatedVideo && videos.length > 0) {
            try {
              const visionDesc = await callDoubaoVision(videos[0],
                `Please describe this video scene in detail in English. Additional requirements: ${prompt}`);
              const enhancedPrompt = `${visionDesc.description || ''}. ${prompt}`;
              const result = await submitVideoTask(enhancedPrompt, 5);
              if (result.taskId) analysis.generatedVideo = { taskId: result.taskId, status: result.status, prompt };
            } catch (e) { console.warn('视频复刻失败:', e); }
          } else if (!analysis.generatedVideo) {
            // vid2vid 但没有视频附件 → 降级为 text2vid
            try {
              const result = await submitVideoTask(prompt, 5);
              if (result.taskId) analysis.generatedVideo = { taskId: result.taskId, status: result.status, prompt };
            } catch (e) { console.warn('视频复刻降级失败:', e); }
          }
          break;
      }
    }

    // 确保 intent 字段有值
    if (!analysis.intent) {
      analysis.intent = intent.label;
    }

    // 清洗 response 中的 markdown 格式
    if (analysis.response) {
      analysis.response = stripMarkdown(analysis.response);
    }
    // 移除内部标记
    delete analysis._needsGenerationFallback;
    // 链接上下文：附加来源信息
    if (linkContext) {
      analysis.sourceUrl = linkContext.sourceUrl;
      analysis.sourcePlatform = linkContext.sourcePlatform;
    }
    // V2.0: 异步提取记忆（fire-and-forget）
    if (session_id) {
      const memMgr = new MemoryManager();
      const builtin = new BuiltinMemoryProvider();
      await builtin.initialize(user.id);
      memMgr.addProvider(builtin);
      memMgr.addProvider(new LongTermMemoryProvider());
      const userMsg = content || '';
      const assistantMsg = analysis.response || '';
      const msgs = [
        ...historyMessages,
        { role: 'user' as const, content: userMsg },
        { role: 'assistant' as const, content: assistantMsg },
      ];
      memMgr.onSessionEnd(session_id, msgs as any).catch(e => console.warn('[Memory] onSessionEnd 失败:', e));
    }

    return NextResponse.json({
      success: true,
      ...analysis,
      _model: modelUsed,
      _intent: intent.type,
      _context: contextStats,
      _modelErrors: modelErrors.length > 0 ? modelErrors : undefined,
      // 链接抓取失败信号:前端用这个决定是否显示"建议贴正文"提示
      // 阈值 200:analyze-link 已先试 SSR HTML,再 fallback jina.ai reader
      // 仍 < 200 字说明这个 URL 真没救了(SPA 反爬 + 404 + 登录墙)
      linkFetchFailed: !!(linkContext && (!linkContext.extractedContent || linkContext.extractedContent.trim().length < 200)),
    });

  } catch (error) {
    console.error('聊天 API 错误:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      error: errMsg.length > 500 ? errMsg.substring(0, 500) + '...' : errMsg,
      modelErrors: modelErrors.length > 0 ? modelErrors.slice(0, 5) : undefined,
    });
  }
});

// GET /api/ai/chat?action=video_status&taskId=xxx — 查询视频生成状态
export const GET = withAuth(async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'video_status') {
    const taskId = searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ success: false, error: '缺少 taskId' }, { status: 400 });
    }
    try {
      const result = await getVideoTaskStatus(taskId);
      return NextResponse.json({ success: true, data: result });
    } catch (e) {
      console.error('视频状态查询失败:', e);
      return NextResponse.json({ success: false, error: '查询失败' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: false, error: '未知操作' }, { status: 400 });
});
