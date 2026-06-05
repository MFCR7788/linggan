'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * 跨页面内容流转 hook
 *
 * 用法：
 *   const { handoff, receive } = useContentHandoff();
 *   handoff('/ai/image', { prompt: result.content, topic: type });
 *   // → router.push('/ai/image?prompt=...&topic=...')
 *
 *   const { prompt } = receive(['prompt', 'topic']);
 *
 * 支持的字段（任意页面可读）：
 *   - prompt: 文本 prompt
 *   - topic: 主题/类型
 *   - firstFrame: 视频首帧图片 URL
 *   - imageUrl: 图片 URL
 *   - audioUrl: 音频 URL
 *   - text: 通用文本
 *   - script: 配音脚本
 *   - inspirationId: 灵感 ID（逗号分隔）
 *   - style: 文风/风格
 *   - industry: 行业
 *   - preset: 生图预设
 *   - palette: 调色板
 */
import type { HandoffField } from '@/lib/handoff-url';
export type { HandoffField } from '@/lib/handoff-url';
import { HANDOFF_FIELD_KEYS, buildHandoffUrl } from '@/lib/handoff-url';
export { buildHandoffUrl };

export function useContentHandoff() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * 跳转到目标页面，并把参数拼到 URL
   * 自动跳过空值
   */
  const handoff = useCallback(
    (target: string, params: Partial<Record<HandoffField, string | number | undefined>>) => {
      const query = new URLSearchParams();
      for (const key of HANDOFF_FIELD_KEYS) {
        const v = params[key];
        if (v === undefined || v === null || v === '') continue;
        query.set(key, String(v));
      }
      const qs = query.toString();
      const url = qs ? `${target}?${qs}` : target;
      router.push(url);
    },
    [router]
  );

  /**
   * 从当前 URL 读取指定的字段
   * @param fields 要读取的字段名列表
   * @returns 字段名 → 值的对象（空值字段不会出现）
   */
  const receive = useCallback(
    (fields: HandoffField[]): Partial<Record<HandoffField, string>> => {
      const out: Partial<Record<HandoffField, string>> = {};
      for (const f of fields) {
        const v = searchParams.get(f);
        if (v !== null && v !== '') out[f] = v;
      }
      return out;
    },
    [searchParams]
  );

  /**
   * 一次性取所有支持的字段（用于在组件初始化时把 URL 参数写入状态）
   */
  const receiveAll = useCallback((): Partial<Record<HandoffField, string>> => {
    return receive(HANDOFF_FIELD_KEYS);
  }, [receive]);

  return { handoff, receive, receiveAll, searchParams };
}


