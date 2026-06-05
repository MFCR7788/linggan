/**
 * 跨页面内容流转 — URL 构建工具
 * 纯函数，兼容客户端和服务端
 */

export type HandoffField =
  | 'prompt'
  | 'topic'
  | 'firstFrame'
  | 'imageUrl'
  | 'audioUrl'
  | 'text'
  | 'script'
  | 'inspirationId'
  | 'style'
  | 'industry'
  | 'preset'
  | 'palette'
  | 'ratio';

export const HANDOFF_FIELD_KEYS: HandoffField[] = [
  'prompt', 'topic', 'firstFrame', 'imageUrl', 'audioUrl', 'text', 'script',
  'inspirationId', 'style', 'industry', 'preset', 'palette', 'ratio',
];

export function buildHandoffUrl(
  target: string,
  params: Partial<Record<HandoffField, string | number | undefined>>
): string {
  const query = new URLSearchParams();
  for (const key of HANDOFF_FIELD_KEYS) {
    const v = params[key];
    if (v === undefined || v === null || v === '') continue;
    query.set(key, String(v));
  }
  const qs = query.toString();
  return qs ? `${target}?${qs}` : target;
}
