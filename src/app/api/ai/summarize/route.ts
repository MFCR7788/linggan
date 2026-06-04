import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek, callDoubaoChat, callQwen } from '@/lib/ai-services';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const POST = withAuth(async ({ request, user }) => {
  try {
    const body = await request.json();
    const { content, type } = body;

    if (!content || content.length === 0) {
      return NextResponse.json({
        success: false,
        error: '内容不能为空'
      }, { status: 400 });
    }

    const creditCost = CREDIT_COSTS.ai_text.perCall;
    try {
      await consume(user.id, creditCost, 'ai_summarize', 'AI 内容总结', { type, contentLen: content.length });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    // 根据内容类型构建不同的提示
    const isText = type === 'text' || type === 'voice';
    const prompt = isText
      ? `你是一个智能创作助手，用户给你发送了一段内容。请分析用户的意图并给出有价值的回应。

用户输入：
${content}

请按以下JSON格式返回（不要包含其他文字）：
{
  "title": "对话标题，概括用户输入的主题，最多20字",
  "summary": "对用户输入的回应分析，像聊天一样自然流畅，50-100字",
  "keyPoints": ["基于用户内容提炼的要点1", "要点2", "要点3"],
  "tags": ["标签1", "标签2", "标签3"],
  "suggestions": ["创作建议1", "建议2", "建议3"],
  "reuseScore": 4,
  "intent": "分析用户意图，如：记录灵感、寻求建议、文案创作、问题咨询等"
}

注意：
- reuseScore 1-5（可复用性）
- keyPoints 最多3个
- tags 最多5个
- suggestions 最多3个
- intent 简短描述用户意图
- 直接返回JSON，不要包含其他文字`
      : `请分析以下${type === 'image' ? '图片内容' : '视频内容'}，并按以下格式返回JSON：

内容：
${content}

请返回JSON格式，格式如下：
{
  "title": "标题，最多20个字",
  "summary": "简洁的内容摘要，50-100字",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "tags": ["标签1", "标签2", "标签3"],
  "suggestions": ["建议1", "建议2", "建议3"],
  "reuseScore": 4
}

注意：
- reuseScore 是1-5之间的数字，表示内容的可复用性
- keyPoints 最多3个
- tags 最多5个
- suggestions 最多3个
- 直接返回JSON，不要包含其他文字`;

    // 纯文本总结：DeepSeek 优先（成本低）
    try {
      const response = await callDeepSeek(prompt, { temperature: 0.7, maxTokens: 1000 });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const analysis = JSON.parse(jsonMatch[0]);
          return NextResponse.json({
            success: true,
            ...analysis,
            _model: 'deepseek'
          });
        } catch (parseError) {
          console.warn('解析 DeepSeek 返回失败:', parseError);
        }
      }
    } catch (dsError) {
      console.warn('DeepSeek 分析失败，切换到千问:', dsError);
    }

    // 千问备用
    try {
      const response = await callQwen(
        [{ role: 'user', content: prompt }],
        { model: 'qwen-plus', temperature: 0.7, maxTokens: 1000 }
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const analysis = JSON.parse(jsonMatch[0]);
          return NextResponse.json({
            success: true,
            ...analysis,
            _model: 'qwen-plus'
          });
        } catch (parseError) {
          console.warn('解析千问返回失败:', parseError);
        }
      }
    } catch (qwenError) {
      console.warn('千问分析失败，切换到豆包:', qwenError);
    }

    // Doubao 兜底
    try {
      const response = await callDoubaoChat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.7, maxTokens: 1000 }
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const analysis = JSON.parse(jsonMatch[0]);
          return NextResponse.json({
            success: true,
            ...analysis,
            _model: 'doubao-seed-2.0-mini'
          });
        } catch (parseError) {
          console.warn('解析 Doubao 返回失败:', parseError);
        }
      }
    } catch (doubaoError) {
      console.warn('Doubao 分析也失败:', doubaoError);
    }

    // DeepSeek 备用
    try {
      const response = await callDeepSeek(prompt, {
        temperature: 0.7,
        maxTokens: 1000
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const analysis = JSON.parse(jsonMatch[0]);
          return NextResponse.json({
            success: true,
            ...analysis,
            _model: 'deepseek'
          });
        } catch (parseError) {
          console.warn('解析 DeepSeek 返回失败:', parseError);
        }
      }
    } catch (deepseekError) {
      console.warn('DeepSeek 也失败，使用备用分析:', deepseekError);
    }
    
    // 如果 AI 失败，使用备用分析
    const fallbackAnalysis = getFallbackAnalysis(content, type);
    return NextResponse.json({
      success: true,
      ...fallbackAnalysis
    });
    
  } catch (error) {
    console.error('分析API错误:', error);
    
    // 返回备用分析
    const fallbackAnalysis = getFallbackAnalysis('', 'text');
    return NextResponse.json({
      success: true,
      ...fallbackAnalysis
    });
  }
});

// 备用分析生成
function getFallbackAnalysis(content: string, type: string) {
  // 生成标题
  let title = '未命名灵感';
  if (content) {
    title = content.substring(0, 20) + (content.length > 20 ? '...' : '');
  } else if (type === 'image') {
    title = '图片内容';
  } else if (type === 'video') {
    title = '视频内容';
  } else if (type === 'voice') {
    title = '语音内容';
  }
  
  // 生成摘要
  let summary = '这是您记录的灵感内容，请查看详细信息。';
  if (content && content.length > 0) {
    summary = content.length > 80 
      ? content.substring(0, 80) + '...' 
      : content;
  }
  
  // 生成要点
  const keyPoints: string[] = [];
  if (content) {
    keyPoints.push('这是您记录的原始内容');
    keyPoints.push('可以基于此进行创作');
    keyPoints.push('建议保存到灵感库');
  }
  
  // 生成标签
  const tags: string[] = ['灵感', '创意'];
  if (content && content.includes('明天')) tags.push('日程');
  if (content && content.includes('会议')) tags.push('会议');
  if (content && content.includes('工作')) tags.push('工作');
  if (type === 'image') tags.push('图片');
  if (type === 'video') tags.push('视频');
  if (type === 'voice') tags.push('语音');
  
  // 生成建议
  const suggestions: string[] = [
    '保存到灵感库以便后续查看和扩展',
    '可以基于此生成相关内容',
    '建议添加更多细节'
  ];
  
  return {
    title,
    summary,
    keyPoints,
    tags: tags.slice(0, 5),
    suggestions: suggestions.slice(0, 3),
    reuseScore: 4
  };
}
