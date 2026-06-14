// 上下文智能压缩 — 当对话历史超过阈值时，将较早的消息压缩为摘要
// 减少 token 消耗，防止上下文窗口溢出

import { callDeepSeek } from '@/lib/ai-services';

const COMPRESS_AT = 30;   // 超过 30 条消息触发压缩
const KEEP_RECENT = 10;   // 保留最近 10 条不压缩

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const COMPRESSION_PROMPT = `你是一个对话摘要助手。请将以下对话历史压缩为简洁的摘要，保留关键信息：
- 用户的重要偏好和要求
- 讨论的主要话题和结论
- 任何未完成的任务或待办事项
- 用户提到的事实信息（身份、工作、项目等）

请用中文输出，不超过 300 字。`;

export async function compressHistory(
  messages: ChatMessage[]
): Promise<{ compressedSummary: string; recentMessages: ChatMessage[]; wasCompressed: boolean }> {
  if (messages.length <= COMPRESS_AT) {
    return { compressedSummary: '', recentMessages: messages, wasCompressed: false };
  }

  const toCompress = messages.slice(0, -KEEP_RECENT);
  const recent = messages.slice(-KEEP_RECENT);

  try {
    // 按句子截断（500 字后找句号），避免丢关键信息
    const truncate = (text: string, maxLen = 500): string => {
      if (text.length <= maxLen) return text;
      const cut = text.slice(0, maxLen);
      const lastPeriod = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('\n'));
      return lastPeriod > maxLen * 0.5 ? cut.slice(0, lastPeriod + 1) : cut;
    };
    const conversation = toCompress
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}：${truncate(m.content)}`)
      .join('\n');

    const summary = await callDeepSeek(`${COMPRESSION_PROMPT}\n\n对话历史：\n${conversation}`, {
      temperature: 0.1,
      maxTokens: 500,
    });

    return {
      compressedSummary: summary.trim(),
      recentMessages: recent,
      wasCompressed: true,
    };
  } catch (e) {
    console.warn('[ContextCompressor] 压缩失败，保留原始历史:', e);
    return { compressedSummary: '', recentMessages: messages, wasCompressed: false };
  }
}

// 将压缩摘要注入消息列表（用于发送给 LLM）
export function buildCompressedMessages(
  summary: string,
  recentMessages: ChatMessage[]
): ChatMessage[] {
  if (!summary) return recentMessages;

  const summaryMsg: ChatMessage = {
    role: 'user',
    content: `[前情提要]\n${summary}\n\n---\n以下是最近的对话：`,
  };

  return [summaryMsg, ...recentMessages];
}
