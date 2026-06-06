'use client';

import { useState, useEffect } from 'react';
import { formatRelativeTime } from '@/lib/style-constants';

export interface HistoryWork {
  id: string;
  title: string;
  time: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  content?: string;
  prompt?: string;
  metadata?: any;
}

export function useWorkHistory(workType: string, sourcePlatform?: string) {
  const [items, setItems] = useState<HistoryWork[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let url = `/api/chat/history?works=true&type=${encodeURIComponent(workType)}`;
    if (sourcePlatform) url += `&sourcePlatform=${encodeURIComponent(sourcePlatform)}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.data)) {
          setItems(
            data.data.slice(0, 6).map((w: any) => ({
              id: w.id,
              title: w.title || '',
              time: formatRelativeTime(w.time || ''),
              imageUrl: w.metadata?.generatedImage?.imageUrl || undefined,
              videoUrl: w.metadata?.generatedVideo?.videoUrl || undefined,
              audioUrl: w.metadata?.generatedAudio?.audioUrl || w.metadata?.audioUrl || undefined,
              content: w.content
                ? (typeof w.content === 'string' ? w.content : '').replace(/<[^>]*>/g, '').substring(0, 80)
                : '',
              prompt: w.metadata?.prompt || w.content || '',
              metadata: w.metadata,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [workType, sourcePlatform]);

  return { items, isLoading };
}
