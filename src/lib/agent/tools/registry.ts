// Agent Tool Registry — 工具注册、查找、执行
// OpenAI 兼容 function calling 格式

import type { ToolDefinition, ToolContext, ToolResult } from '../types';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** 转为 OpenAI compatible tools 数组 */
  toOpenAITools(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    return this.getAll().map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /** 执行工具，带错误隔离 */
  async execute(name: string, params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: '', error: `未找到工具: ${name}` };
    }
    try {
      return await tool.handler(params, context);
    } catch (e) {
      return {
        success: false,
        output: '',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** 按名称过滤工具 */
  filter(names: string[]): ToolRegistry {
    const filtered = new ToolRegistry();
    for (const name of names) {
      const tool = this.tools.get(name);
      if (tool) filtered.tools.set(name, tool);
    }
    return filtered;
  }
}
