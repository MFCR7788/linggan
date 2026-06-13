// 共享工具：抖音 CLI Python 路径检测
// 消除 douyin-search / douyin-transcript / extract-content 中重复的路径查找逻辑
// 安全：所有子进程调用使用 execFile（参数数组，不经 shell）

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

let _pythonPath: string | null = null;

/** 校验路径不含 shell 元字符 */
function isSafePath(p: string): boolean {
  return /^[a-zA-Z0-9_\-.\/\s]+$/.test(p);
}

/** 获取 douyin-cli 关联的 Python 解释器路径（缓存） */
export async function getDouyinPythonPath(): Promise<string> {
  if (_pythonPath) return _pythonPath;

  try {
    // 1. 找到 douyin 命令位置（execFile 不经过 shell）
    const { stdout } = await execFileAsync('which', ['douyin'], { timeout: 5000 });
    const douyinBin = stdout.trim();
    if (!douyinBin || !isSafePath(douyinBin)) throw new Error('douyin path invalid');

    // 2. 在 douyin-cli 的 venv 中查找 python（execFile 不经过 shell）
    const searchRoot = douyinBin.replace(/\/bin\/douyin$/, '');
    const { stdout: pyOut } = await execFileAsync('find', [
      searchRoot, '-path', '*/bin/python*', '-type', 'f',
      '-maxdepth', '4',
    ], { timeout: 5000, maxBuffer: 1024 * 1024 });

    if (pyOut.trim()) {
      _pythonPath = pyOut.trim().split('\n')[0];
      return _pythonPath;
    }

    // 3. Fallback: uv tool venv
    const { stdout: uvOut } = await execFileAsync('find', [
      process.env.HOME + '/.local/share/uv/tools/douyin-cli/bin',
      '-name', 'python*', '-type', 'f', '-maxdepth', '1',
    ], { timeout: 5000 });
    _pythonPath = uvOut.trim() || 'python3';
    return _pythonPath;
  } catch {
    _pythonPath = 'python3';
    return _pythonPath;
  }
}

/** 重置缓存（用于测试） */
export function resetPythonPathCache(): void {
  _pythonPath = null;
}
