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

/**
 * 去除 Markdown 格式化符号，返回纯文本。
 * 处理：粗体/斜体/标题/列表/引用/代码/删除线。
 */
export function stripMarkdown(text: string): string {
  if (!text) return text;

  let result = text;

  // 逐行处理行级格式
  result = result
    .split('\n')
    .map(line => {
      let l = line.trim();

      // 标题: ### / ## / # 开头
      l = l.replace(/^#{1,6}\s+/, '');

      // 无序列表: - / * / + 开头
      l = l.replace(/^[-*+]\s+/, '');

      // 有序列表: 1. / 1) / 1、 开头
      l = l.replace(/^\d+[.)、]\s*/, '');

      // 引用: > 开头（多层 > >）
      l = l.replace(/^(>+\s*)+/, '');

      return l;
    })
    .join('\n');

  // 内联格式
  // 粗体: **text** 或 __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '$1');
  result = result.replace(/__(.+?)__/g, '$1');

  // 斜体: *text* 或 _text_（但不匹配 ** 残余）
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1');
  result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '$1');

  // 删除线: ~~text~~
  result = result.replace(/~~(.+?)~~/g, '$1');

  // 行内代码: `text`
  result = result.replace(/`(.+?)`/g, '$1');

  // 链接: [text](url) → text
  result = result.replace(/\[(.+?)\]\(.+?\)/g, '$1');

  // 图片: ![alt](url) → alt
  result = result.replace(/!\[(.+?)\]\(.+?\)/g, '$1');

  // 清理多余空白
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}
