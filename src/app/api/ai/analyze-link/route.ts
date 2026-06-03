// 链接内容分析 API — 自动识别链接类型(文章/图片/视频)并分流分析
import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek, callDoubaoVision } from '@/lib/ai-services';
import { createAdminClient } from '@/lib/supabase-server';
import { extractVideoText, canExtractTranscript } from '@/lib/video-transcriber';
import type { TranscriptResult } from '@/lib/video-transcriber';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

const VIDEO_DOMAINS = [
  'youtube.com', 'youtu.be', 'bilibili.com', 'douyin.com',
  'tiktok.com', 'vimeo.com', 'ixigua.com', 'kuaishou.com',
  'weibo.com/tv', 'mgtv.com', 'youku.com', 'tencent video',
];

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];

// 判断链接类型
function detectLinkType(url: string, contentType: string, html: string): 'image' | 'video' | 'article' {
  // 1. 根据 Content-Type 判断
  if (contentType.startsWith('image/')) return 'image';

  // 2. 根据 URL 后缀判断
  const urlLower = url.toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    if (urlLower.includes(ext)) return 'image';
  }

  // 3. 根据 URL 域名判断
  try {
    const hostname = new URL(url).hostname;
    for (const domain of VIDEO_DOMAINS) {
      if (hostname.includes(domain) || urlLower.includes(domain)) return 'video';
    }
  } catch {}

  // 4. 根据 HTML meta 标签判断
  const ogType = html.match(/<meta[^>]+property\s*=\s*["']og:type["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*\/?>/i)
    || html.match(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:type["'][^>]*\/?>/i);
  if (ogType) {
    const type = ogType[1].toLowerCase();
    if (type.startsWith('video')) return 'video';
    if (type === 'article') return 'article';
  }

  // 5. 检查是否有 og:video
  const hasOgVideo = html.includes('og:video') || html.includes('og:video:url');
  if (hasOgVideo) return 'video';

  // 默认当作文章
  return 'article';
}

// 提取 HTML meta 信息
function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property\\s*=\\s*["']${property}["'][^>]+content\\s*=\\s*["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+property\\s*=\\s*["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name\\s*=\\s*["']${property}["'][^>]+content\\s*=\\s*["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+name\\s*=\\s*["']${property}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// 从 HTML 提取正文文本
function extractText(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyText = bodyMatch ? bodyMatch[1] : html;
  return bodyText
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 4000);
}

// 上传图片到 Supabase Storage
async function uploadImageFromUrl(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.split('/')[1] || 'jpg';
    const fileName = `link-import/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const supabase = createAdminClient();
    const { error } = await supabase.storage
      .from('lingji-media')
      .upload(fileName, buffer, { contentType, upsert: false });
    if (error) return null;

    const { data: { publicUrl } } = supabase.storage.from('lingji-media').getPublicUrl(fileName);
    return publicUrl;
  } catch {
    return null;
  }
}

// 分析图片链接
async function analyzeImageLink(imageUrl: string, pageTitle: string, ogImage: string | null) {
  const targetUrl = imageUrl || ogImage;
  let storedUrl: string | null = null;
  let visionResult: any = null;

  if (targetUrl) {
    // 1. 下载并存到我们的存储
    storedUrl = await uploadImageFromUrl(targetUrl);

    // 2. 用豆包视觉模型分析
    const visionPrompt = `请详细描述这张图片的内容，包括：
1. 图片中有什么（物体、人物、场景等）
2. 色彩和构图风格
3. 可能的用途（封面、插图、素材等）
4. 给创作者的建议

以 JSON 格式返回：
{
  "description": "详细的图片描述",
  "tags": ["标签1", "标签2", "标签3"],
  "usage": "图片可能的用途",
  "creationIdeas": ["创作思路1", "创作思路2"]
}`;
    visionResult = await callDoubaoVision(targetUrl, visionPrompt);
  }

  const description = visionResult?.description || '图片内容';
  const visionTags = visionResult?.tags || [];
  const creationIdeas = visionResult?.creationIdeas || [];

  return {
    linkType: 'image' as const,
    title: pageTitle?.substring(0, 20) || '图片素材',
    summary: description.substring(0, 200),
    keyPoints: [
      visionResult?.usage || '视觉素材',
      ...creationIdeas.slice(0, 2),
      '可基于此图片进行创作',
    ],
    tags: ['图片', ...visionTags.slice(0, 4)],
    suggestions: [
      '保存到灵感库作为视觉参考',
      ...creationIdeas.slice(0, 2),
    ],
    reuseScore: 4,
    mediaUrl: storedUrl || targetUrl,
  };
}

// 分析视频链接
async function analyzeVideoLink(url: string, html: string, transcript?: string) {
  const ogTitle = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title') || '';
  const ogDescription = extractMeta(html, 'og:description') || extractMeta(html, 'description') || '';
  const ogVideo = extractMeta(html, 'og:video') || extractMeta(html, 'og:video:url') || url;
  const ogImage = extractMeta(html, 'og:image') || '';
  const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';

  const transcriptSection = transcript
    ? `\n视频语音逐字稿:\n${transcript.substring(0, 3000)}\n`
    : '';

  const prompt = `请根据以下视频页面信息进行分析，给出内容分析和创作建议。

视频页面: ${url}
页面标题: ${pageTitle || ogTitle}
页面描述: ${ogDescription}
封面图: ${ogImage || '无'}${transcriptSection}
请分析这个视频的内容方向、创作价值，返回 JSON（不要包含其他文字）:
{
  "title": "基于内容的标题，最多20个字",
  "summary": "内容摘要，50-100字",
  "keyPoints": ["内容方向1", "内容方向2", "创作启发"],
  "tags": ["视频", "标签2", "标签3"],
  "suggestions": ["观看完整视频获取详细内容", "基于视频主题进行二次创作", "提取关键观点作为素材"],
  "reuseScore": 4
}`;

  const response = await callDeepSeek(prompt, { temperature: 0.3, maxTokens: 1000 });
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  const analysis = jsonMatch ? tryParseJSON(jsonMatch[0]) : null;

  return {
    linkType: 'video' as const,
    title: analysis?.title || pageTitle?.substring(0, 20) || '视频内容',
    summary: analysis?.summary || ogDescription?.substring(0, 100) || '视频素材链接',
    keyPoints: analysis?.keyPoints || ['视频内容已保存', '观看后补充详细分析'],
    tags: ['视频', ...(analysis?.tags || []).slice(0, 4)],
    suggestions: analysis?.suggestions || ['观看完整视频', '基于视频主题创作'],
    reuseScore: analysis?.reuseScore ?? 4,
    mediaUrl: ogVideo || url,
    transcript: transcript || undefined,
  };
}

// 分析文章链接
async function analyzeArticleLink(url: string, html: string) {
  const ogTitle = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title') || '';
  const ogDescription = extractMeta(html, 'og:description') || extractMeta(html, 'description') || '';
  const ogImage = extractMeta(html, 'og:image') || '';
  const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';
  const bodyText = extractText(html);

  const contentForAI = bodyText || ogDescription || pageTitle || url;
  const title = pageTitle || ogTitle || '文章内容';

  const analysisPrompt = `请分析以下文章内容，按 JSON 格式返回。

文章标题: ${title}
文章摘要: ${ogDescription || '无'}
${ogImage ? `封面图: ${ogImage}` : ''}
URL: ${url}

正文内容:
${contentForAI.substring(0, 3000)}

请返回 JSON（不要包含其他文字）:
{
  "title": "基于内容的标题，最多20个字",
  "summary": "内容摘要，50-100字，概括文章核心观点",
  "keyPoints": ["核心观点1", "核心观点2", "核心观点3"],
  "tags": ["标签1", "标签2", "标签3"],
  "suggestions": ["创作建议1", "创作建议2"],
  "reuseScore": 4
}`;

  const response = await callDeepSeek(analysisPrompt, { temperature: 0.3, maxTokens: 1000 });
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  const analysis = jsonMatch ? tryParseJSON(jsonMatch[0]) : null;

  return {
    linkType: 'article' as const,
    title: analysis?.title || title?.substring(0, 20) || '文章内容',
    summary: analysis?.summary || ogDescription?.substring(0, 100) || bodyText?.substring(0, 100) || '文章链接',
    keyPoints: analysis?.keyPoints || ['文章已保存', '可基于此进行创作'],
    tags: ['文章', '链接', ...(analysis?.tags || []).slice(0, 3)],
    suggestions: analysis?.suggestions || ['阅读原文获取完整内容', '基于文章观点进行创作'],
    reuseScore: analysis?.reuseScore ?? 4,
    mediaUrl: ogImage || undefined,
  };
}

function tryParseJSON(str: string): any | null {
  try { return JSON.parse(str); } catch { return null; }
}

// 主入口
export const POST = withAuth(async ({ request }: { request: NextRequest }) => {
  try {
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ success: false, error: '缺少 URL' }, { status: 400 });
    }

    // 1. 获取页面
    let html = '';
    let contentType = '';
    let finalUrl = url;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LingjiBot/1.0)' },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      html = await response.text();
      contentType = response.headers.get('content-type') || '';
      finalUrl = response.url || url;
    } catch {
      // 如果页面抓取失败，尝试当图片链接处理
      const isImageUrl = IMAGE_EXTENSIONS.some(ext => url.toLowerCase().includes(ext));
      if (isImageUrl) {
        const storedUrl = await uploadImageFromUrl(url);
        const visionResult = await callDoubaoVision(url, '描述这张图片的内容和用途');
        return NextResponse.json({
          success: true,
          linkType: 'image',
          title: '图片素材',
          summary: visionResult?.description?.substring(0, 200) || '图片素材',
          keyPoints: ['视觉素材', '可基于此图片创作'],
          tags: ['图片', ...(visionResult?.tags || []).slice(0, 3)],
          suggestions: ['保存到灵感库作为视觉参考'],
          reuseScore: 3,
          mediaUrl: storedUrl || url,
        });
      }

      // 完全无法获取，返回基本信息
      return NextResponse.json({
        success: true,
        linkType: 'article',
        title: '链接内容',
        summary: `来自 ${url} 的内容，暂时无法获取页面详情`,
        keyPoints: ['链接已保存'],
        tags: ['链接'],
        suggestions: ['稍后重试获取内容'],
        reuseScore: 3,
      });
    }

    // 2. 检测链接类型
    const linkType = detectLinkType(finalUrl, contentType, html);

    // 3. 根据类型分流分析
    let result;
    if (linkType === 'image') {
      // 获取图片 URL：og:image 或者直接就是图片链接
      const ogImage = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image') || '';
      result = await analyzeImageLink(finalUrl, extractMeta(html, 'og:title') || '', ogImage);
    } else if (linkType === 'video') {
      // 对国内视频平台，尝试提取语音逐字稿
      let transcript: string | undefined;
      if (canExtractTranscript(finalUrl)) {
        try {
          const transcriptResult = await Promise.race([
            extractVideoText(finalUrl),
            new Promise<TranscriptResult>((resolve) =>
              setTimeout(() => resolve({ success: false, error: "timeout" }), 60000)
            ),
          ]);
          if (transcriptResult.success && transcriptResult.transcript) {
            transcript = transcriptResult.transcript;
          }
        } catch {
          // 转录失败不影响主流程
        }
      }
      result = await analyzeVideoLink(finalUrl, html, transcript);
    } else {
      result = await analyzeArticleLink(finalUrl, html);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('链接分析错误:', error);
    return NextResponse.json({
      success: true,
      linkType: 'article',
      title: '链接内容',
      summary: '无法获取链接内容',
      keyPoints: ['链接已保存'],
      tags: ['链接'],
      suggestions: ['稍后重试获取内容'],
      reuseScore: 3,
    });
  }
});
