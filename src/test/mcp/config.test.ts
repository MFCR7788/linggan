import { describe, it, expect, afterEach } from 'vitest';
import { loadMCPServerConfigs } from '@/lib/mcp/config';

describe('loadMCPServerConfigs', () => {
  afterEach(() => {
    // 清理测试环境变量
    delete process.env.MCP_SERVERS;
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('MCP_SERVER_')) delete process.env[key];
    }
  });

  it('空配置时返回空数组', () => {
    const configs = loadMCPServerConfigs();
    expect(configs).toEqual([]);
  });

  it('从 MCP_SERVERS JSON 加载配置', () => {
    process.env.MCP_SERVERS = JSON.stringify([
      {
        name: 'github',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        enabled: true,
      },
    ]);

    const configs = loadMCPServerConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0].name).toBe('github');
    expect(configs[0].command).toBe('npx');
  });

  it('从单项环境变量加载 stdio 配置', () => {
    process.env.MCP_SERVER_GITHUB_COMMAND = 'npx';
    process.env.MCP_SERVER_GITHUB_ARGS = '-y @modelcontextprotocol/server-github';
    process.env.MCP_SERVER_GITHUB_TIMEOUT = '30000';

    const configs = loadMCPServerConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0].name).toBe('github');
    expect(configs[0].transport).toBe('stdio');
    expect(configs[0].timeout).toBe(30000);
  });

  it('从单项环境变量加载 HTTP 配置', () => {
    process.env.MCP_SERVER_NOTION_URL = 'https://notion-mcp.example.com/mcp';

    const configs = loadMCPServerConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0].name).toBe('notion');
    expect(configs[0].transport).toBe('streamable_http');
    expect(configs[0].url).toBe('https://notion-mcp.example.com/mcp');
  });

  it('MCP_SERVER_<NAME>_ENABLED=false 时过滤', () => {
    process.env.MCP_SERVER_DISABLED_COMMAND = 'node';
    process.env.MCP_SERVER_DISABLED_ENABLED = 'false';

    const configs = loadMCPServerConfigs();
    // ENABLED check is in MCPManager.initialize, config loading doesn't filter
    expect(configs).toHaveLength(1);
    expect(configs[0].enabled).toBe(false);
  });
});
