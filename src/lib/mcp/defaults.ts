// MCP 默认 Server 配置
// 默认接入 GitHub MCP Server，后续可扩展 Notion / 飞书等

import type { MCPServerConfig } from './types';
import { getEnv } from '@/lib/runtime-config';

/**
 * 获取默认 MCP Server 配置列表
 * 每个 server 通过检查环境变量决定是否启用
 */
export function getDefaultMCPServers(): MCPServerConfig[] {
  const servers: MCPServerConfig[] = [];

  // GitHub MCP Server
  const githubToken = getEnv('GITHUB_PERSONAL_ACCESS_TOKEN');
  if (githubToken) {
    servers.push({
      name: 'github',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-github'],
      env: {
        ...process.env,
        GITHUB_PERSONAL_ACCESS_TOKEN: githubToken,
      },
      timeout: 30000,
      connectTimeout: 15000,
      toolPrefix: 'github',
      enabled: true,
    });
  }

  // Notion MCP Server (未来扩展)
  const notionToken = getEnv('NOTION_API_TOKEN');
  if (notionToken) {
    servers.push({
      name: 'notion',
      transport: 'streamable_http',
      url: 'https://mcp.notion.com/mcp',
      headers: {
        Authorization: `Bearer ${notionToken}`,
      },
      timeout: 30000,
      connectTimeout: 15000,
      toolPrefix: 'notion',
      enabled: true,
    });
  }

  // 飞书 MCP Server (未来扩展)
  const feishuAppId = getEnv('FEISHU_APP_ID');
  const feishuAppSecret = getEnv('FEISHU_APP_SECRET');
  if (feishuAppId && feishuAppSecret) {
    servers.push({
      name: 'feishu',
      transport: 'streamable_http',
      url: 'https://open.feishu.cn/open-apis/mcp/v1',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
      connectTimeout: 15000,
      toolPrefix: 'feishu',
      enabled: true,
    });
  }

  return servers;
}
