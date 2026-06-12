// 抖音搜索工具 — 调用 douyin-cli Python 库进行关键词搜索
// 底层：LIghtJUNction/douyin CLI（开源，通过 Cookie 认证）

import type { ToolDefinition } from '../../types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

let _pythonPath: string | null = null;

async function getPythonPath(): Promise<string> {
  if (_pythonPath) return _pythonPath;
  try {
    const { stdout } = await execAsync('which douyin');
    const douyinBin = stdout.trim();
    // douyin-cli 的 venv python 在 bin/douyin 旁边
    const { stdout: pyOut } = await execAsync(`ls "$(dirname "${douyinBin}")/python"* 2>/dev/null || echo ""`);
    if (pyOut.trim()) {
      _pythonPath = pyOut.trim().split('\n')[0];
    } else {
      // Fallback: find python in the uv tool venv
      const { stdout: uvOut } = await execAsync(
        `find ~/.local/share/uv/tools/douyin-cli/bin -name 'python*' -type f 2>/dev/null | head -1 || echo ""`
      );
      _pythonPath = uvOut.trim() || 'python3';
    }
  } catch {
    _pythonPath = 'python3';
  }
  return _pythonPath;
}

interface SearchResult {
  id: string;
  desc: string;
  create_time: number;
  author: { nickname: string; unique_id: string };
  statistics: { digg_count: number; comment_count: number; share_count: number; play_count: number };
  video: { duration: number; cover: string };
}

async function douyinSearch(
  keyword: string,
  options: { limit?: number; sortType?: number; publishTime?: number; filterDuration?: string }
): Promise<SearchResult[]> {
  const python = await getPythonPath();
  const scriptDir = join(tmpdir(), 'lingji-douyin');
  await mkdir(scriptDir, { recursive: true });
  const scriptPath = join(scriptDir, 'search.py');

  const pyScript = `
import json, sys
from douyin_cli.douyin import Douyin

results = []
def collect(items, _type):
    for item in items:
        try:
            results.append({
                "id": item.get("aweme_id", ""),
                "desc": item.get("desc", "")[:200],
                "create_time": item.get("create_time", 0),
                "author": {
                    "nickname": (item.get("author") or {}).get("nickname", ""),
                    "unique_id": (item.get("author") or {}).get("unique_id", ""),
                },
                "statistics": {
                    "digg_count": (item.get("statistics") or {}).get("digg_count", 0),
                    "comment_count": (item.get("statistics") or {}).get("comment_count", 0),
                    "share_count": (item.get("statistics") or {}).get("share_count", 0),
                    "play_count": (item.get("statistics") or {}).get("play_count", 0),
                },
                "video": {
                    "duration": (item.get("video") or {}).get("duration", 0),
                    "cover": (item.get("video") or {}).get("cover", {}).get("url_list", [""])[0] if isinstance((item.get("video") or {}).get("cover", {}), dict) else "",
                },
            })
        except Exception:
            pass

douyin = Douyin(
    target=${JSON.stringify(keyword)},
    type="search",
    limit=${options.limit || 5},
    sort_type=${options.sortType || 0},
    publish_time=${options.publishTime || 0},
    filter_duration="${options.filterDuration || ''}",
    on_new_items=collect,
)
douyin.run()
json.dump({"success": True, "data": results, "total": len(results)}, sys.stdout, ensure_ascii=False)
`;

  await writeFile(scriptPath, pyScript);

  try {
    const { stdout, stderr } = await execAsync(
      `${python} "${scriptPath}"`,
      { timeout: 60000, maxBuffer: 1024 * 1024 }
    );

    if (stderr && !stdout) {
      throw new Error(stderr.substring(0, 500));
    }

    const parsed = JSON.parse(stdout);
    if (!parsed.success) {
      throw new Error(parsed.error || '搜索失败');
    }
    return parsed.data as SearchResult[];
  } finally {
    await rm(scriptDir, { recursive: true, force: true }).catch(() => {});
  }
}

export const douyinSearchTool: ToolDefinition = {
  name: 'douyin_search',
  description: `搜索抖音视频。支持关键词搜索，可筛选排序方式、发布时间、视频时长。
返回视频标题、作者、点赞/评论/分享/播放数、时长、封面等信息。
使用前需要先配置 Cookie：在 Chrome 登录 douyin.com 后，运行 douyin auth cookie-login 保存 Cookie。
如果搜索触发验证码，请在浏览器打开抖音并完成验证后重试。`,
  parameters: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '搜索关键词，如"咖啡教程"、"热门BGM"',
      },
      limit: {
        type: 'number',
        description: '返回结果数（默认 5，最大 20）',
      },
      sort_type: {
        type: 'number',
        enum: [0, 1, 2],
        description: '排序方式：0=综合（默认），1=最多点赞，2=最新发布',
      },
      publish_time: {
        type: 'number',
        enum: [0, 1, 7, 180],
        description: '发布时间：0=不限（默认），1=一天内，7=一周内，180=半年内',
      },
      filter_duration: {
        type: 'string',
        enum: ['', '0-1', '1-5', '5-10000'],
        description: '视频时长筛选：空=不限（默认），0-1=1分钟以下，1-5=1-5分钟，5-10000=5分钟以上',
      },
    },
    required: ['keyword'],
  },
  async handler(params, _ctx) {
    const keyword = params.keyword as string;
    const limit = Math.min((params.limit as number) || 5, 20);
    const sortType = (params.sort_type as number) ?? 0;
    const publishTime = (params.publish_time as number) ?? 0;
    const filterDuration = (params.filter_duration as string) || '';

    if (!keyword) {
      return { success: false, output: '', error: '请提供搜索关键词' };
    }

    try {
      const results = await douyinSearch(keyword, { limit, sortType, publishTime, filterDuration });

      if (results.length === 0) {
        return {
          success: true,
          output: `未找到与"${keyword}"相关的抖音视频。`,
          data: { results: [], total: 0 },
        };
      }

      const sortLabels = ['综合', '最多点赞', '最新发布'];
      const timeLabels: Record<number, string> = { 0: '不限', 1: '一天内', 7: '一周内', 180: '半年内' };

      const header = `抖音搜索"${keyword}"（${sortLabels[sortType]}排序 / ${timeLabels[publishTime] || '不限时间'}），共 ${results.length} 条结果：\n`;

      const items = results.map((r, i) => {
        const date = r.create_time
          ? new Date(r.create_time * 1000).toLocaleDateString('zh-CN')
          : '未知';
        const duration = r.video?.duration
          ? `${Math.floor(r.video.duration / 60)}:${String(Math.floor(r.video.duration % 60)).padStart(2, '0')}`
          : '?';
        const stats = r.statistics;
        const statStr = [
          stats.play_count ? `播放${_formatCount(stats.play_count)}` : '',
          stats.digg_count ? `👍${_formatCount(stats.digg_count)}` : '',
          stats.comment_count ? `💬${_formatCount(stats.comment_count)}` : '',
          stats.share_count ? `↗${_formatCount(stats.share_count)}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        const desc = (r.desc || '(无描述)').substring(0, 100);
        return `${i + 1}. ${desc}\n   @${r.author?.nickname || '未知'} | ⏱${duration} | ${date} | ${statStr}`;
      }).join('\n\n');

      return {
        success: true,
        output: `${header}\n${items}`,
        data: { results, total: results.length, keyword },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('验证码') || msg.includes('verify') || msg.includes('captcha')) {
        return {
          success: false,
          output: '',
          error: '抖音搜索触发验证码，请在浏览器中打开 www.douyin.com 完成验证后重试。',
        };
      }
      return {
        success: false,
        output: '',
        error: `抖音搜索失败: ${msg.substring(0, 300)}`,
      };
    }
  },
};

function _formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
