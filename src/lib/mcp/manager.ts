// MCPManager — 管理多个 MCP Server 连接
// 启动时连接所有已配置的 server，发现工具并注册到 ToolRegistry

import type { ToolRegistry } from '@/lib/agent/tools/registry';
import type { MCPServerConfig, MCPServerStatus } from './types';
import { MCPClient } from './client';
import { loadMCPServerConfigs } from './config';

export class MCPManager {
  private clients = new Map<string, MCPClient>();
  private registry: ToolRegistry;
  private initialized = false;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /** 初始化：加载配置、连接所有 MCP Server */
  async initialize(configs?: MCPServerConfig[]): Promise<void> {
    if (this.initialized) return;

    const servers = configs ?? loadMCPServerConfigs();

    const results = await Promise.allSettled(
      servers
        .filter((c) => c.enabled !== false)
        .map((config) => this.connectServer(config))
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.warn(`[MCP] ${failed.length}/${servers.length} server 连接失败`);
    }

    this.initialized = true;
  }

  /** 连接单个 MCP Server 并注册其工具 */
  async connectServer(config: MCPServerConfig): Promise<MCPClient> {
    const client = new MCPClient(config);
    this.clients.set(config.name, client);

    try {
      await client.connect();
      const toolNames = await client.registerTools(this.registry);
      console.log(`[MCP] "${config.name}" 已连接，${toolNames.length} 个工具已注册`);
    } catch (e) {
      console.warn(`[MCP] "${config.name}" 连接失败:`, e);
    }

    return client;
  }

  /** 断开指定 server */
  async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) return;

    await client.disconnect();
    this.clients.delete(name);
    // 清理已注册的工具
    this.registry.deregisterByToolset(`mcp-${name}`);
    console.log(`[MCP] "${name}" 已断开`);
  }

  /** 获取指定 server 状态 */
  getServerStatus(name: string): MCPServerStatus | undefined {
    return this.clients.get(name)?.getStatus();
  }

  /** 获取所有 server 状态 */
  getAllStatus(): MCPServerStatus[] {
    return Array.from(this.clients.values()).map((c) => c.getStatus());
  }

  /** 获取客户端实例 */
  getClient(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }

  /** 断开所有连接 */
  async shutdown(): Promise<void> {
    const promises = Array.from(this.clients.keys()).map((name) =>
      this.disconnectServer(name)
    );
    await Promise.allSettled(promises);
    this.clients.clear();
  }
}
