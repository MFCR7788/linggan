// 共享工具：抖音 CLI Python 路径检测
// 消除 douyin-search / douyin-transcript / extract-content 中重复的路径查找逻辑

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let _pythonPath: string | null = null;

/** 获取 douyin-cli 关联的 Python 解释器路径（缓存） */
export async function getDouyinPythonPath(): Promise<string> {
  if (_pythonPath) return _pythonPath;

  try {
    // 1. 找到 douyin 命令位置
    const { stdout } = await execAsync('which douyin');
    const douyinBin = stdout.trim();
    if (!douyinBin) throw new Error('douyin not found');

    // 2. 在 douyin-cli 的 venv 中查找 python
    const { stdout: pyOut } = await execAsync(
      `find "$(dirname "${douyinBin}")/.." -path "*/bin/python*" -type f 2>/dev/null | head -1 || echo ""`
    );

    if (pyOut.trim()) {
      _pythonPath = pyOut.trim();
      return _pythonPath;
    }

    // 3. Fallback: uv tool venv
    const { stdout: uvOut } = await execAsync(
      `find ~/.local/share/uv/tools/douyin-cli/bin -name 'python*' -type f 2>/dev/null | head -1 || echo ""`
    );
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
