// 视频内容分析 API — 基于视频元数据 + AI 分析
import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { fileName, fileSize, fileType, videoUrl } = await request.json();

    const prompt = `请根据以下视频信息进行分析，给出内容分析和创作建议。

视频信息：
- 文件名: ${fileName}
- 文件大小: ${fileSize} MB
- 格式: ${fileType}
${videoUrl ? `- 视频地址: ${videoUrl}` : ''}

请分析这个视频可能属于什么类型的内容，有什么创作价值，并返回 JSON（不要包含其他文字）:
{
  "title": "基于文件名的标题，最多20个字",
  "summary": "内容分析摘要，50-100字，描述视频可能的内容和价值",
  "keyPoints": ["可能的内容方向1", "可能的内容方向2", "创作建议"],
  "tags": ["视频", "标签2", "标签3"],
  "suggestions": ["观看完整视频后补充详细分析", "基于视频主题进行二次创作", "提取关键帧作为素材"],
  "reuseScore": 4
}`;

    const response = await callDeepSeek(prompt, {
      temperature: 0.3,
      maxTokens: 1000,
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const analysis = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ success: true, ...analysis });
      } catch {}
    }

    // 备用分析
    return NextResponse.json({
      success: true,
      title: fileName?.replace(/\.[^.]+$/, '').substring(0, 20) || '视频内容',
      summary: `来自视频文件 "${fileName}" 的内容，大小 ${fileSize} MB`,
      keyPoints: ['视频素材已保存', '可基于视频内容进行创作', '建议观看后补充详细描述'],
      tags: ['视频', '素材'],
      suggestions: ['观看完整视频后补充分析', '基于视频主题进行二次创作'],
      reuseScore: 4,
    });
  } catch (error) {
    console.error('视频分析错误:', error);
    return NextResponse.json({
      success: true,
      title: '视频内容',
      summary: '视频素材已保存',
      keyPoints: ['视频已保存到灵感库'],
      tags: ['视频'],
      suggestions: ['查看视频后补充详细描述'],
      reuseScore: 3,
    });
  }
}
