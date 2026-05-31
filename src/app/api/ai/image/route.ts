import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { generateImage, logAiUsage } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const { prompt, ratio } = await request.json();

    if (!prompt) {
      return createApiError('Prompt is required', 400);
    }

    const result = await generateImage(prompt, { ratio });

    // 记录AI使用
    await logAiUsage(user.id, 'image', 100);

    // 保存到"AI创作"作品集（不再每次创建新对话）
    const supabase = createAdminClient();
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('title', 'AI创作')
      .maybeSingle();
    const sessionId = session?.id || (await supabase
      .from('chat_sessions')
      .insert({ user_id: user.id, title: 'AI创作' })
      .select('id')
      .single()
    ).data?.id;
    if (sessionId) {
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        user_id: user.id,
        type: 'ai',
        content: prompt,
        content_type: 'text',
        metadata: { source: 'ai_creation', generatedImage: { imageUrl: result.imageUrl, prompt: result.prompt, size: result.size } },
      });
    }

    return createApiResponse(result, 'Image generated');
  } catch (error) {
    console.error('AI image generation error:', error);
    return createApiError('Failed to generate image', 500);
  }
}
