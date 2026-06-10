import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock MCP SDK
const mockClientInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  listTools: vi.fn().mockResolvedValue({
    tools: [
      { name: 'search', description: 'Search tool', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } },
      { name: 'read', description: 'Read tool', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
    ],
  }),
  callTool: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'result from MCP tool' }],
    isError: false,
  }),
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    connect: typeof mockClientInstance.connect;
    close: typeof mockClientInstance.close;
    listTools: typeof mockClientInstance.listTools;
    callTool: typeof mockClientInstance.callTool;
    constructor() {
      this.connect = mockClientInstance.connect;
      this.close = mockClientInstance.close;
      this.listTools = mockClientInstance.listTools;
      this.callTool = mockClientInstance.callTool;
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class MockStdioTransport {},
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class MockHTTPTransport {},
}));

import { MCPClient } from '@/lib/mcp/client';
import { ToolRegistry } from '@/lib/agent/tools/registry';
import type { MCPServerConfig } from '@/lib/mcp/types';

const stdioConfig: MCPServerConfig = {
  name: 'test-server',
  transport: 'stdio',
  command: 'node',
  args: ['server.js'],
  timeout: 5000,
  connectTimeout: 5000,
};

describe('MCPClient', () => {
  let client: MCPClient;

  beforeEach(() => {
    client = new MCPClient(stdioConfig);
  });

  describe('connect', () => {
    it('连接成功后 connected 为 true', async () => {
      await client.connect();
      expect(client.getStatus().connected).toBe(true);
    });

    it('重复连接不报错', async () => {
      await client.connect();
      await client.connect();
      expect(client.getStatus().connected).toBe(true);
    });
  });

  describe('discoverTools', () => {
    it('连接后发现工具', async () => {
      await client.connect();
      const tools = await client.discoverTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('search');
      expect(tools[1].name).toBe('read');
    });

    it('未连接时抛出错误', async () => {
      await expect(client.discoverTools()).rejects.toThrow('未连接');
    });
  });

  describe('registerTools', () => {
    it('将 MCP 工具注册到 ToolRegistry', async () => {
      await client.connect();
      const registry = new ToolRegistry();
      const names = await client.registerTools(registry);

      expect(names).toHaveLength(2);
      expect(registry.get('mcp_test-server_search')).toBeDefined();
      expect(registry.get('mcp_test-server_read')).toBeDefined();
    });

    it('注册的工具可通过 toolset 查找', async () => {
      await client.connect();
      const registry = new ToolRegistry();
      await client.registerTools(registry);

      const mcpTools = registry.getByToolset('mcp-test-server');
      expect(mcpTools).toHaveLength(2);
    });
  });

  describe('callTool', () => {
    it('调用已连接 MCP 工具', async () => {
      await client.connect();
      const result = await client.callTool('search', { q: 'test' });
      expect(result.success).toBe(true);
      expect(result.output).toBe('result from MCP tool');
    });

    it('未连接时返回失败', async () => {
      const result = await client.callTool('search', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('未连接');
    });
  });

  describe('disconnect', () => {
    it('断开后状态为未连接', async () => {
      await client.connect();
      await client.disconnect();
      expect(client.getStatus().connected).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('初始状态', () => {
      const status = client.getStatus();
      expect(status.name).toBe('test-server');
      expect(status.connected).toBe(false);
      expect(status.toolsCount).toBe(0);
    });
  });
});
