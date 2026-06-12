// Agent Reach — 多平台互联网搜索工具
// 底层调用 Exa REST API、Jina Reader、gh CLI 等
// 比现有 web_search 覆盖更广：GitHub 代码搜索、JS 渲染页面读取

import type { ToolDefinition } from '../../types';
import { execSync } from 'child_process';

const SEARCH_TIMEOUT = 15000;

async function sh(cmd: string, timeoutMs = SEARCH_TIMEOUT): Promise<{ stdout: string; stderr: string }> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const result = await execAsync(cmd, { timeout: timeoutMs, maxBuffer: 1024 * 1024 });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; killed?: boolean };
    return { stdout: err.stdout || '', stderr: err.stderr || String(e) };
  }
}

function hasCli(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Exa 语义搜索（直接调用 REST API） */
async function exaSearch(query: string, limit = 5): Promise<string> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return 'Exa 搜索不可用：未配置 EXA_API_KEY 环境变量。';

  const body = JSON.stringify({
    query,
    type: 'auto',
    numResults: limit,
    contents: { highlights: true },
  });

  const { stdout, stderr } = await sh(
    `curl -s --max-time 30 -X POST "https://api.exa.ai/search" -H "Content-Type: application/json" -H "x-api-key: ${apiKey}" -d '${body.replace(/'/g, "'\\''")}'`
  );

  if (stderr && !stdout) return `搜索异常: ${stderr.substring(0, 300)}`;
  if (!stdout.trim()) return '无结果';

  try {
    const data = JSON.parse(stdout);
    if (data.error) return `Exa API 错误: ${data.error}`;
    const results = data.results || [];
    if (results.length === 0) return `"${query}" 无结果`;
    const formatted = results
      .map((r: { title?: string; url?: string; highlights?: string[] }, i: number) => {
        const title = r.title || '无标题';
        const url = r.url || '';
        const highlights = r.highlights?.slice(0, 2).join(' | ') || '';
        return `${i + 1}. ${title}\n   ${url}${highlights ? '\n   ' + highlights : ''}`;
      })
      .join('\n\n');
    return formatted.length > 3000 ? formatted.substring(0, 3000) + '\n...(已截断)' : formatted;
  } catch {
    return stdout.substring(0, 3000);
  }
}

/** Jina Reader 读取任意网页（含 JS 渲染的 SPA 页面，如微信公众号/小红书） */
async function readWebPage(url: string): Promise<string> {
  const { stdout, stderr } = await sh(
    `curl -s --max-time 20 "https://r.jina.ai/${url.replace(/^https?:\/\//, '')}"`
  );
  if (stderr && !stdout) return `读取失败: ${stderr.substring(0, 200)}`;
  if (!stdout.trim()) return '页面无内容或无法访问';
  return stdout.length > 4000 ? stdout.substring(0, 4000) + '\n...(已截断)' : stdout;
}

/** GitHub 搜索 */
async function githubSearch(query: string, type: 'repos' | 'code' | 'issues' = 'repos', limit = 5): Promise<string> {
  if (!hasCli('gh')) return 'GitHub 搜索不可用：gh CLI 未安装或未配置。运行 `gh auth login` 进行认证。';
  const map: Record<string, string> = {
    repos: `gh search repos "${query}" --sort stars --limit ${limit}`,
    code: `gh search code "${query}" --limit ${limit}`,
    issues: `gh search issues "${query}" --limit ${limit}`,
  };
  const { stdout, stderr } = await sh(map[type]);
  if (stderr && !stdout) return `GitHub 搜索异常: ${stderr.substring(0, 300)}`;
  if (!stdout.trim()) return '无结果';
  return stdout.length > 3000 ? stdout.substring(0, 3000) + '\n...(已截断)' : stdout;
}

/** agent-reach 健康检查，列出可用渠道 */
async function doctorCheck(): Promise<string> {
  if (!hasCli('agent-reach')) return 'agent-reach CLI 未安装';
  const { stdout } = await sh('agent-reach doctor --json', 10000);
  try {
    const data = JSON.parse(stdout);
    const channels = Object.entries(data)
      .map(([k, v]: [string, unknown]) => {
        const info = v as { status: string; name: string; active_backend: string | null };
        const icon = info.status === 'ok' ? '✅' : info.status === 'warn' ? '⚠️' : '❌';
        return `${icon} ${info.name}${info.active_backend ? ` (${info.active_backend})` : ''}`;
      })
      .join('\n');
    return channels;
  } catch {
    return stdout.substring(0, 2000);
  }
}

export const searchInternetTool: ToolDefinition = {
  name: 'search_internet',
  description: `全网深度搜索工具，覆盖普通搜索引擎无法触达的平台：
- 使用 Exa 语义搜索获取高质量网页结果（比传统关键词搜索更智能）
- 使用 Jina Reader 读取任意网页全文（含微信公众号/小红书/知乎等 JS 渲染页面）
- 搜索 GitHub 仓库和代码
- 查看 agent-reach 各平台渠道可用状态
- 适合做深度调研、竞品分析、技术研究`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'read_page', 'github', 'doctor'],
        description: '操作类型：search=全网语义搜索，read_page=读取网页全文，github=搜索GitHub，doctor=查看各渠道可用状态',
      },
      query: {
        type: 'string',
        description: '搜索关键词（action=search 或 action=github 时使用）',
      },
      url: {
        type: 'string',
        description: '网页 URL（action=read_page 时使用）',
      },
      github_type: {
        type: 'string',
        enum: ['repos', 'code', 'issues'],
        description: 'GitHub 搜索类型（action=github 时使用，默认 repos）',
      },
      limit: {
        type: 'number',
        description: '返回结果数（默认 5，最大 10）',
      },
    },
    required: ['action'],
  },
  async handler(params, _ctx) {
    const action = params.action as string;
    const limit = Math.min((params.limit as number) || 5, 10);

    try {
      switch (action) {
        case 'search': {
          const query = params.query as string;
          if (!query) return { success: false, output: '', error: '请提供 search 关键词' };
          const result = await exaSearch(query, limit);
          return { success: true, output: result, data: { source: 'exa', query } };
        }
        case 'read_page': {
          const url = params.url as string;
          if (!url) return { success: false, output: '', error: '请提供 url 参数' };
          const result = await readWebPage(url);
          return { success: true, output: result, data: { source: 'jina_reader', url } };
        }
        case 'github': {
          const query = params.query as string;
          if (!query) return { success: false, output: '', error: '请提供 GitHub 搜索关键词' };
          const ghType = (params.github_type as string) || 'repos';
          const result = await githubSearch(query, ghType as 'repos' | 'code' | 'issues', limit);
          return { success: true, output: result, data: { source: 'github', query, type: ghType } };
        }
        case 'doctor': {
          const result = await doctorCheck();
          return { success: true, output: result };
        }
        default:
          return { success: false, output: '', error: `不支持的操作: ${action}` };
      }
    } catch (e) {
      return { success: false, output: '', error: `搜索失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
