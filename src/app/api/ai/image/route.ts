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

    const { prompt, ratio, n } = await request.json();

    if (!prompt) {
      return createApiError('Prompt is required', 400);
    }

    const count = Math.min(n || 1, 4);
    const result = await generateImage(prompt, { ratio, n: count });

    // 记录AI使用
    await logAiUsage(user.id, 'image', 100 * count);

    // 保存到"AI创作"作品集
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
      const firstResult = Array.isArray(result) ? result[0] : result;
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        user_id: user.id,
        type: 'ai',
        content: prompt,
        content_type: 'text',
        metadata: {
          source: 'ai_creation',
          generatedImage: { imageUrl: firstResult.imageUrl, prompt: firstResult.prompt, size: firstResult.size },
          batchImages: Array.isArray(result) ? result.map((r) => ({ imageUrl: r.imageUrl, size: r.size })) : undefined,
        },
      });
    }

    return createApiResponse(result, 'Image generated');
  } catch (error) {
    console.error('AI image generation error:', error);
    return createApiError('Failed to generate image', 500);
  }
}
