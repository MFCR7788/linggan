// MCPClient — 单 MCP Server 连接管理
// 封装 @modelcontextprotocol/sdk，处理连接/发现/调用/重连

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { MCPServerConfig, MCPServerStatus, MCPToolInfo } from './types';
import type { ToolDefinition } from '@/lib/agent/types';
import type { ToolRegistry } from '@/lib/agent/tools/registry';

export class MCPClient {
  readonly name: string;
  private config: MCPServerConfig;
  private client: Client | null = null;
  private transport: StdioClientTransport | StreamableHTTPClientTransport | null = null;
  private connected = false;
  private connectPromise: Promise<void> | null = null;
  private lastError: string | undefined;
  private connectedAt: number | undefined;
  private registeredToolNames: string[] = [];

  constructor(config: MCPServerConfig) {
    this.name = config.name;
    this.config = config;
  }

  /** 连接到 MCP Server */
  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this._doConnect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async _doConnect(): Promise<void> {
    const timeout = this.config.connectTimeout ?? 30_000;

    try {
      // 创建 transport
      if (this.config.transport === 'stdio') {
        if (!this.config.command) throw new Error('stdio transport requires "command"');
        this.transport = new StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          env: this.config.env as Record<string, string> | undefined,
        });
      } else {
        if (!this.config.url) throw new Error(`${this.config.transport} transport requires "url"`);
        this.transport = new StreamableHTTPClientTransport(
          new URL(this.config.url),
          { requestInit: { headers: this.config.headers } }
        );
      }

      this.client = new Client(
        { name: `lingji-${this.name}`, version: '1.0.0' },
        { capabilities: {} as Record<string, unknown> }
      );

      await Promise.race([
        this.client.connect(this.transport),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error(`连接 MCP Server "${this.name}" 超时`)), timeout)
        ),
      ]);

      this.connected = true;
      this.connectedAt = Date.now();
      this.lastError = undefined;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.connected = false;
      throw e;
    }
  }

  /** 从 MCP Server 发现工具列表 */
  async discoverTools(): Promise<MCPToolInfo[]> {
    if (!this.client || !this.connected) {
      throw new Error(`MCP Server "${this.name}" 未连接`);
    }

    const { tools } = await this.client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
    }));
  }

  /** 将发现的工具注册到 ToolRegistry */
  async registerTools(registry: ToolRegistry): Promise<string[]> {
    const tools = await this.discoverTools();
    const prefix = this.config.toolPrefix ?? `mcp_${this.name}`;
    const names: string[] = [];

    for (const tool of tools) {
      const fullName = `${prefix}_${tool.name}`;
      const toolDef: ToolDefinition = {
        name: fullName,
        description: `[MCP:${this.name}] ${tool.description}`,
        parameters: tool.inputSchema,
        handler: async (params) => {
          return this.callTool(tool.name, params);
        },
      };
      registry.register(toolDef, { override: true, toolset: `mcp-${this.name}` });
      names.push(fullName);
    }

    this.registeredToolNames = names;
    return names;
  }

  /** 调用 MCP 工具 */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; error?: string }> {
    if (!this.client || !this.connected) {
      return { success: false, output: '', error: `MCP Server "${this.name}" 未连接` };
    }

    try {
      const timeout = this.config.timeout ?? 60_000;
      const result = await Promise.race([
        this.client.callTool({ name: toolName, arguments: args }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`MCP 工具 "${this.name}/${toolName}" 执行超时`)), timeout)
        ),
      ]);

      const content = result.content as Array<{ type: string; text?: string }> | undefined;
      const text = content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text || '')
        .join('\n') ?? '';

      return { success: !result.isError, output: text, error: result.isError ? text : undefined };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** 断开连接 */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
      }
    } catch { /* ignore */ }
    this.client = null;
    this.transport = null;
    this.connected = false;
    this.registeredToolNames = [];
  }

  /** 刷新工具列表（处理 list_changed 通知） */
  async refreshTools(registry: ToolRegistry): Promise<void> {
    // 先注销旧工具
    for (const name of this.registeredToolNames) {
      registry.deregister(name);
    }
    this.registeredToolNames = [];
    // 重新发现和注册
    try {
      await this.registerTools(registry);
    } catch (e) {
      console.warn(`[MCP] "${this.name}" 工具刷新失败:`, e);
    }
  }

  /** 获取状态 */
  getStatus(): MCPServerStatus {
    return {
      name: this.name,
      connected: this.connected,
      toolsCount: this.registeredToolNames.length,
      lastError: this.lastError,
      connectedAt: this.connectedAt,
    };
  }
}
