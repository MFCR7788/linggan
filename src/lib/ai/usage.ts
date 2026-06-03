// AI Services - Usage Recording

import type { AiTaskType } from './types';

export async function logAiUsage(
  userId: string,
  taskType: AiTaskType,
  tokensUsed: number
): Promise<void> {
  try {
    const { createAdminClient } = await import('../supabase-server');
    const supabase = createAdminClient();
    const month = new Date().toISOString().substring(0, 7);

    const { data: existing } = await supabase
      .from('usage_records')
      .select('*')
      .eq('user_id', userId)
      .eq('month', month)
      .single();

    const fieldMap: Record<AiTaskType, string> = {
      ai_summary: 'ai_summary_count',
      copywriting: 'ai_writing_count',
      image: 'image_count',
      image_batch: 'image_count',
      video: 'video_count',
      digital_human: 'digital_human_count',
      digital_human_batch: 'digital_human_count',
      video_merge: 'video_count',
    };

    if (existing) {
      const field = fieldMap[taskType];
      await supabase
        .from('usage_records')
        .update({
          [field]: (existing as Record<string, number>)[field] + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('usage_records').insert({
        user_id: userId,
        month,
        ai_summary_count: taskType === 'ai_summary' ? 1 : 0,
        ai_writing_count: taskType === 'copywriting' ? 1 : 0,
        image_count: taskType === 'image' ? 1 : 0,
        video_count: taskType === 'video' ? 1 : 0,
        link_parse_count: 0,
        video_minutes: 0,
        audio_minutes: 0,
        storage_used_mb: 0,
      });
    }
  } catch (e) {
    console.error('Failed to log AI usage:', e);
  }
}
