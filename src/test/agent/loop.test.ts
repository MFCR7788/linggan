import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentLoop } from '@/lib/agent/loop';
import { ToolRegistry } from '@/lib/agent/tools/registry';
import { ContextEngine } from '@/lib/agent/context-engine';
import type { ChatMessage } from '@/lib/ai/types';
import type { ToolDefinition } from '@/lib/agent/types';

// Mock ModelRouter
const mockChatWithTools = vi.fn();
const mockChat = vi.fn();

vi.mock('@/lib/providers/model-router', () => ({
  defaultModelRouter: {
    chatWithTools: (...args: unknown[]) => mockChatWithTools(...args),
    chat: (...args: unknown[]) => mockChat(...args),
  },
}));

function makeRegistry(tools: ToolDefinition[] = []): ToolRegistry {
  const registry = new ToolRegistry();
  for (const t of tools) registry.register(t);
  return registry;
}

function makeMessages(msgs: Array<{ role: string; content: string }>): ChatMessage[] {
  return msgs as ChatMessage[];
}

describe('agentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('模型直接返回文本时立即结束', async () => {
    mockChatWithTools.mockResolvedValueOnce({
      message: { role: 'assistant', content: '你好！有什么可以帮你的？' },
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const result = await agentLoop(
      makeMessages([{ role: 'user', content: '你好' }]),
      makeRegistry(),
      { userId: 'user-1' },
    );

    expect(result.content).toBe('你好！有什么可以帮你的？');
    expect(result.iterations).toBe(1);
    expect(result.toolsUsed).toEqual([]);
  });

  it('模型请求调用工具', async () => {
    const searchTool: ToolDefinition = {
      name: 'search',
      description: '搜索工具',
      parameters: { type: 'object', properties: { q: { type: 'string' } } },
      handler: vi.fn().mockResolvedValue({ success: true, output: '搜索结果: AI 最新动态...' }),
    };

    mockChatWithTools
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q":"AI"}' } }],
        },
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      })
      .mockResolvedValueOnce({
        message: { role: 'assistant', content: '根据搜索结果，AI 领域最新动态是...' },
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
      });

    const result = await agentLoop(
      makeMessages([{ role: 'user', content: '搜索 AI' }]),
      makeRegistry([searchTool]),
      { userId: 'user-1' },
    );

    expect(searchTool.handler).toHaveBeenCalledTimes(1);
    expect(result.toolsUsed).toContain('search');
    expect(result.content).toContain('AI 领域');
  });

  it('防同参数死循环 — 同一工具+参数调用 3 次后跳过', async () => {
    const tool: ToolDefinition = {
      name: 'repeat_tool',
      description: '重复工具',
      parameters: { type: 'object', properties: {} },
      handler: vi.fn().mockResolvedValue({ success: true, output: 'done' }),
    };

    // 连续 3 次返回相同 tool_call
    const toolCallMsg = {
      message: {
        role: 'assistant' as const,
        content: null as string | null,
        tool_calls: [{ id: 'call_1', type: 'function' as const, function: { name: 'repeat_tool', arguments: '{}' } }],
      },
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    mockChatWithTools
      .mockResolvedValueOnce(toolCallMsg)
      .mockResolvedValueOnce(toolCallMsg)
      .mockResolvedValueOnce(toolCallMsg)
      .mockResolvedValueOnce({
        message: { role: 'assistant', content: '已跳过重复调用，给出最终答案' },
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

    const result = await agentLoop(
      makeMessages([{ role: 'user', content: 'test' }]),
      makeRegistry([tool]),
      { userId: 'user-1' },
      { maxIterations: 5, model: 'deepseek-v3', temperature: 0.7, maxTokens: 4096 },
    );

    // handler 只应被调用 2 次（第 3 次被跳过）
    expect(tool.handler).toHaveBeenCalledTimes(2);
    expect(result.content).toContain('最终答案');
  });

  it('达到 maxIterations 后强制总结', async () => {
    const tool: ToolDefinition = {
      name: 'always_call',
      description: '总是被调用',
      parameters: { type: 'object', properties: {} },
      handler: vi.fn().mockResolvedValue({ success: true, output: 'result' }),
    };

    const toolCallMsg = {
      message: {
        role: 'assistant' as const,
        content: null as string | null,
        tool_calls: [{ id: 'call_1', type: 'function' as const, function: { name: 'always_call', arguments: '{}' } }],
      },
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    // 总是返回 tool call（触发 maxIter）
    for (let i = 0; i < 5; i++) {
      mockChatWithTools.mockResolvedValueOnce(toolCallMsg);
    }
    mockChat.mockResolvedValueOnce('最终汇总结果');

    const result = await agentLoop(
      makeMessages([{ role: 'user', content: 'test' }]),
      makeRegistry([tool]),
      { userId: 'user-1' },
      { maxIterations: 3, model: 'deepseek-v3', temperature: 0.7, maxTokens: 4096 },
    );

    expect(result.iterations).toBe(3);
    expect(mockChat).toHaveBeenCalled(); // 强制总结被调用
  });

  it('abortSignal 触发时立即返回', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await agentLoop(
      makeMessages([{ role: 'user', content: 'test' }]),
      makeRegistry(),
      { userId: 'user-1', signal: controller.signal },
    );

    expect(result.content).toBe('执行已取消。');
    expect(result.iterations).toBe(0);
  });

  it('自定义 ContextEngine 正常工作', async () => {
    mockChatWithTools.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'done' },
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });

    const ctxEngine = new ContextEngine();
    const result = await agentLoop(
      makeMessages([{ role: 'user', content: 'hi' }]),
      makeRegistry(),
      { userId: 'user-1' },
      undefined,
      { contextEngine: ctxEngine },
    );

    expect(result.totalTokensUsed).toBeGreaterThan(0);
  });

  it('工具执行失败时返回错误信息', async () => {
    const failingTool: ToolDefinition = {
      name: 'failing',
      description: '总是失败',
      parameters: { type: 'object', properties: {} },
      handler: vi.fn().mockRejectedValue(new Error('网络错误')),
    };

    mockChatWithTools
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'failing', arguments: '{}' } }],
        },
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
      .mockResolvedValueOnce({
        message: { role: 'assistant', content: '工具调用失败，我无法完成此操作' },
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

    const result = await agentLoop(
      makeMessages([{ role: 'user', content: 'test' }]),
      makeRegistry([failingTool]),
      { userId: 'user-1' },
    );

    expect(result.toolsUsed).toContain('failing');
  });
});
