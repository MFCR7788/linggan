// 文本工具 — 纯客户端/服务端通用的字符串处理
// 注意：此文件必须保持零依赖，确保 client component 可以安全 import

/** 按句子边界将长文本拆分为多段，每段不超过 maxCharsPerSegment */
export function splitLongText(text: string, maxCharsPerSegment: number = 500): string[] {
  const segments: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerSegment) {
      segments.push(remaining);
      break;
    }
    const chunk = remaining.substring(0, maxCharsPerSegment);
    const lastBreak = Math.max(
      chunk.lastIndexOf('。'),
      chunk.lastIndexOf('！'),
      chunk.lastIndexOf('？'),
      chunk.lastIndexOf('.'),
      chunk.lastIndexOf('!'),
      chunk.lastIndexOf('?'),
      chunk.lastIndexOf('\n'),
    );
    const cutPoint = lastBreak > maxCharsPerSegment * 0.5 ? lastBreak + 1 : maxCharsPerSegment;
    segments.push(remaining.substring(0, cutPoint).trim());
    remaining = remaining.substring(cutPoint).trim();
  }

  return segments.filter(s => s.length > 0);
}
