// 多平台互联网搜索工具
// 底层：Exa REST API（fetch）、Jina Reader（fetch）、GitHub CLI（gh）

import type { ToolDefinition } from '../../types';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import { getExaApiKey } from '@/lib/runtime-config';

const SEARCH_TIMEOUT = 15000;
const execFileAsync = promisify(execFile);

function hasCli(name: string): boolean {
  // 安全：只接受字母数字+连字符的 CLI 名称，防止命令注入
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) return false;
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Exa 语义搜索（直接调用 REST API） */
async function exaSearch(query: string, limit = 5): Promise<string> {
  const apiKey = getExaApiKey();
  if (!apiKey) return 'Exa 搜索不可用：未配置 EXA_API_KEY 环境变量。';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults: limit,
        contents: { highlights: true },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return `Exa API 错误: HTTP ${response.status}`;
    const data = await response.json();
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
  } catch (e) {
    return `搜索异常: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Jina Reader 读取任意网页（含 JS 渲染的 SPA 页面，如微信公众号/小红书） */
async function readWebPage(url: string): Promise<string> {
  try {
    const normalizedUrl = url.replace(/^https?:\/\//, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(`https://r.jina.ai/${normalizedUrl}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return `读取失败: HTTP ${response.status}`;
    const text = await response.text();
    if (!text.trim()) return '页面无内容或无法访问';
    return text.length > 4000 ? text.substring(0, 4000) + '\n...(已截断)' : text;
  } catch (e) {
    return `读取失败: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** GitHub 搜索 — 使用 execFile 避免 shell 命令注入 */
async function githubSearch(query: string, type: 'repos' | 'code' | 'issues' = 'repos', limit = 5): Promise<string> {
  if (!hasCli('gh')) return 'GitHub 搜索不可用：gh CLI 未安装或未配置。运行 `gh auth login` 进行认证。';

  // execFile 不经过 shell，参数化传递避免注入
  const args: string[] = (() => {
    switch (type) {
      case 'repos':   return ['search', 'repos', query, '--sort', 'stars', '--limit', String(limit)];
      case 'code':    return ['search', 'code', query, '--limit', String(limit)];
      case 'issues':  return ['search', 'issues', query, '--limit', String(limit)];
    }
  })();

  try {
    const { stdout, stderr } = await execFileAsync('gh', args, {
      timeout: SEARCH_TIMEOUT,
      maxBuffer: 1024 * 1024,
    });
    if (stderr && !stdout) return `GitHub 搜索异常: ${stderr.substring(0, 300)}`;
    if (!stdout.trim()) return '无结果';
    return stdout.length > 3000 ? stdout.substring(0, 3000) + '\n...(已截断)' : stdout;
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return `GitHub 搜索失败: ${err.stderr || String(e)}`.substring(0, 500);
  }
}

export const searchInternetTool: ToolDefinition = {
  name: 'search_internet',
  description: `全网深度搜索工具，覆盖普通搜索引擎无法触达的平台：
- 使用 Exa 语义搜索获取高质量网页结果（比传统关键词搜索更智能）
- 使用 Jina Reader 读取任意网页全文（含微信公众号/小红书/知乎等 JS 渲染页面）
- 搜索 GitHub 仓库和代码
- 适合做深度调研、竞品分析、技术研究`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'read_page', 'github'],
        description: '操作类型：search=全网语义搜索，read_page=读取网页全文，github=搜索GitHub',
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
        default:
          return { success: false, output: '', error: `不支持的操作: ${action}` };
      }
    } catch (e) {
      return { success: false, output: '', error: `搜索失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
