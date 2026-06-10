// MCP 配置加载 — 从环境变量读取 MCP Server 配置
// 配置格式：MCP_SERVERS = JSON array of MCPServerConfig
// 或通过 MCP_SERVER_<NAME>_* 环境变量定义单个 server

import { getEnv } from '@/lib/runtime-config';
import type { MCPServerConfig } from './types';

/**
 * 加载 MCP Server 配置
 * 支持两种格式：
 * 1. MCP_SERVERS 环境变量 — JSON 数组
 * 2. MCP_SERVER_<NAME>_COMMAND / MCP_SERVER_<NAME>_URL 环境变量 — 单项配置
 */
export function loadMCPServerConfigs(): MCPServerConfig[] {
  // 方式 1: JSON 配置
  const jsonConfig = getEnv('MCP_SERVERS');
  if (jsonConfig) {
    try {
      const parsed = JSON.parse(jsonConfig);
      if (Array.isArray(parsed)) return parsed as MCPServerConfig[];
    } catch {
      console.warn('[MCP] MCP_SERVERS JSON 解析失败');
    }
  }

  // 方式 2: 单项环境变量
  const servers: MCPServerConfig[] = [];
  const prefix = 'MCP_SERVER_';

  // 扫描所有 MCP_SERVER_<NAME>_COMMAND 或 MCP_SERVER_<NAME>_URL 变量
  const serverNames = new Set<string>();

  // 遍历 process.env 收集 server 名称
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith(prefix)) continue;

    const suffix = key.slice(prefix.length);
    const underscoreIdx = suffix.indexOf('_');
    if (underscoreIdx === -1) continue;

    const name = suffix.slice(0, underscoreIdx);
    const field = suffix.slice(underscoreIdx + 1).toLowerCase();

    if (field === 'command' || field === 'url') {
      serverNames.add(name);
    }
  }

  for (const name of serverNames) {
    const command = process.env[`${prefix}${name}_COMMAND`];
    const url = process.env[`${prefix}${name}_URL`];
    const argsEnv = process.env[`${prefix}${name}_ARGS`];
    const headersEnv = process.env[`${prefix}${name}_HEADERS`];
    const timeoutEnv = process.env[`${prefix}${name}_TIMEOUT`];
    const enabledEnv = process.env[`${prefix}${name}_ENABLED`];

    if (!command && !url) continue;

    const config: MCPServerConfig = {
      name: name.toLowerCase(),
      transport: command ? 'stdio' : 'streamable_http',
      ...(command ? { command, args: argsEnv ? argsEnv.split(' ') : [] } : {}),
      ...(url ? { url } : {}),
      ...(headersEnv ? { headers: JSON.parse(headersEnv) } : {}),
      ...(timeoutEnv ? { timeout: parseInt(timeoutEnv, 10) } : {}),
      ...(enabledEnv !== undefined ? { enabled: enabledEnv !== 'false' && enabledEnv !== '0' } : { enabled: true }),
    };

    servers.push(config);
  }

  return servers;
}
