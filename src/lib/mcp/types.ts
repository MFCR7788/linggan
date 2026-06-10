// MCP 类型定义 — Model Context Protocol 集成

export type MCPTransportType = 'stdio' | 'sse' | 'streamable_http';

export interface MCPServerConfig {
  /** 服务名称（唯一标识符） */
  name: string;
  /** 传输方式 */
  transport: MCPTransportType;
  /** stdio: 启动命令 */
  command?: string;
  /** stdio: 命令参数 */
  args?: string[];
  /** stdio: 环境变量 */
  env?: Record<string, string>;
  /** HTTP/SSE: 服务端 URL */
  url?: string;
  /** HTTP: 自定义请求头 */
  headers?: Record<string, string>;
  /** 单个工具调用超时 (ms)，默认 60000 */
  timeout?: number;
  /** 连接超时 (ms)，默认 30000 */
  connectTimeout?: number;
  /** 是否支持并行工具调用 */
  supportsParallelToolCalls?: boolean;
  /** 工具发现后添加到 ToolRegistry 的名称前缀，默认 "mcp_<name>" */
  toolPrefix?: string;
  /** 是否启用（可通过环境变量控制） */
  enabled?: boolean;
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPServerStatus {
  name: string;
  connected: boolean;
  toolsCount: number;
  lastError?: string;
  connectedAt?: number;
}
