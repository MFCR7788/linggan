import type { ToolDefinition } from '../../types';
import { generateEmbedding } from '@/lib/assistant/embedding';
import { MemoryManager } from '@/lib/assistant/memory/manager';
import { BuiltinMemoryProvider } from '@/lib/assistant/memory/builtin-provider';

export const searchMemoryTool: ToolDefinition = {
  name: 'search_memory',
  description: '搜索用户的个人记忆库。当需要回忆用户的偏好、历史信息、或之前讨论过的话题时使用。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索查询' },
    },
    required: ['query'],
  },
  async handler(params, ctx) {
    const query = params.query as string;
    try {
      const manager = new MemoryManager();
      manager.addProvider(new BuiltinMemoryProvider());
      await manager.initialize(ctx.userId);
      const embedding = await generateEmbedding(query);
      const memoryBlock = await manager.prefetchAll(query, embedding);
      return {
        success: true,
        output: memoryBlock || '未找到相关记忆。',
        data: { memoryBlock },
      };
    } catch (e) {
      return { success: false, output: '', error: `记忆搜索失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
