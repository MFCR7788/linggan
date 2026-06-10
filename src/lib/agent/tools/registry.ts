// Agent Tool Registry — 工具注册、查找、执行
// OpenAI 兼容 function calling 格式
// V2: 支持动态注册/deregister、权限控制、并行执行、toolset 分组

import type { ToolDefinition, ToolContext, ToolResult } from '../types';
import type { ToolPermissionManager } from './permissions';

export interface ToolEntry extends ToolDefinition {
  /** 工具所属 toolset（如 "builtin", "mcp-github", "skill-xiaohongshu"） */
  toolset?: string;
}

export class ToolRegistry {
  private tools = new Map<string, ToolEntry>();

  register(tool: ToolDefinition, opts?: { override?: boolean; toolset?: string }): void {
    if (this.tools.has(tool.name) && !opts?.override) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, { ...tool, toolset: opts?.toolset });
  }

  registerAll(tools: ToolDefinition[], opts?: { toolset?: string }): void {
    for (const tool of tools) {
      this.register(tool, opts);
    }
  }

  /** 注销工具（MCP 动态工具清理等场景） */
  deregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** 批量注销（按 toolset 清理） */
  deregisterByToolset(toolset: string): number {
    let count = 0;
    for (const [name, entry] of this.tools.entries()) {
      if (entry.toolset === toolset) {
        this.tools.delete(name);
        count++;
      }
    }
    return count;
  }

  get(name: string): ToolEntry | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolEntry[] {
    return Array.from(this.tools.values());
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** 按 toolset 获取工具 */
  getByToolset(toolset: string): ToolEntry[] {
    return this.getAll().filter((t) => t.toolset === toolset);
  }

  /** 获取可用的 toolset 名称列表 */
  getAvailableToolsets(): string[] {
    const sets = new Set<string>();
    for (const t of this.tools.values()) {
      if (t.toolset) sets.add(t.toolset);
    }
    return Array.from(sets);
  }

  /** 检查 toolset 是否可用（有注册工具） */
  isToolsetAvailable(toolset: string): boolean {
    return this.getByToolset(toolset).length > 0;
  }

  /** 获取用户可用的工具列表（经权限过滤） */
  getAvailableForUser(
    userContext: { userRole?: string; sessionId?: string },
    permissionManager?: ToolPermissionManager
  ): ToolEntry[] {
    if (!permissionManager) return this.getAll();

    return this.getAll().filter((tool) => {
      const result = permissionManager.checkPermission(tool.name, userContext);
      return result.allowed;
    });
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

  /** 转为 OpenAI tools（仅指定名称） */
  toOpenAIToolsFiltered(names: string[]): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    const nameSet = new Set(names);
    return this.getAll()
      .filter((t) => nameSet.has(t.name))
      .map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
  }

  /** 执行单个工具，带错误隔离 */
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

  /** 并行执行多个工具（仅无依赖的工具） */
  async executeParallel(
    calls: Array<{ name: string; params: Record<string, unknown> }>,
    context: ToolContext
  ): Promise<Map<string, ToolResult>> {
    const results = new Map<string, ToolResult>();
    const promises = calls.map(async (call) => {
      const result = await this.execute(call.name, call.params, context);
      results.set(call.name, result);
    });
    await Promise.all(promises);
    return results;
  }

  /** 按名称过滤，创建新 registry */
  filter(names: string[]): ToolRegistry {
    const filtered = new ToolRegistry();
    for (const name of names) {
      const tool = this.tools.get(name);
      if (tool) filtered.tools.set(name, tool);
    }
    return filtered;
  }
}
