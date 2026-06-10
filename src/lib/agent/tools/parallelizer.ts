// Parallelizer — 工具并行执行安全判断
// 参考 Hermes tool_dispatch_helpers.py 的安全分类模式

import type { ToolCallRequest } from '../types';

/** 绝对不能并行的工具（需要用户交互） */
const NEVER_PARALLEL = new Set<string>([
  'clarify',
  'interrupt',
  'confirm',
]);

/** 可以安全并行的工具（纯读取/无副作用） */
const PARALLEL_SAFE = new Set<string>([
  'web_search',
  'get_weather',
  'search_memory',
  'search_knowledge',
  'search_inspirations',
  'get_hotspot',
  'analyze_image',
  'read_document',
  'summarize',
]);

/** 路径作用域工具（操作不同路径时可并行） */
const PATH_SCOPED = new Set<string>([
  'write_file',
  'patch',
  'read_file',
]);

/**
 * 判断一组工具调用是否可以并行执行
 */
export function shouldParallelizeBatch(toolCalls: ToolCallRequest[]): boolean {
  if (toolCalls.length <= 1) return false;

  const names = toolCalls.map((tc) => tc.function.name);

  // 有任何 NEVER_PARALLEL 工具 → 不可并行
  if (names.some((n) => NEVER_PARALLEL.has(n))) return false;

  // 全部是 PARALLEL_SAFE → 可并行
  if (names.every((n) => PARALLEL_SAFE.has(n))) return true;

  // 混合了 PATH_SCOPED 工具 → 检查路径是否重叠
  const pathTools = toolCalls.filter((tc) => PATH_SCOPED.has(tc.function.name));
  const nonPathTools = toolCalls.filter(
    (tc) => !PATH_SCOPED.has(tc.function.name) && !PARALLEL_SAFE.has(tc.function.name)
  );

  // 如果有既不是 PATH_SCOPED 也不是 PARALLEL_SAFE 的工具 → 不可并行
  if (nonPathTools.length > 0) return false;

  // 路径工具检查路径是否重叠
  if (pathTools.length > 1) {
    const paths = pathTools.map((tc) => extractPath(tc.function.arguments));
    if (pathsOverlap(paths)) return false;
  }

  return true;
}

/** 从工具参数中提取文件路径 */
function extractPath(argsJson: string): string | undefined {
  try {
    const args = JSON.parse(argsJson);
    return args.path || args.file_path || args.filePath || args.file || undefined;
  } catch {
    return undefined;
  }
}

/** 检查路径列表是否有重叠 */
function pathsOverlap(paths: Array<string | undefined>): boolean {
  const validPaths = paths.filter((p): p is string => p !== undefined);
  if (validPaths.length <= 1) return false;
  // 有任何路径匹配 → 不可并行
  return new Set(validPaths).size !== validPaths.length;
}

/**
 * 按并行安全性分组
 * 返回：可并行的组 + 必须串行的列表
 */
export function groupToolCallsForExecution(
  toolCalls: ToolCallRequest[]
): { parallel: ToolCallRequest[][]; serial: ToolCallRequest[] } {
  const safeTools: ToolCallRequest[] = [];
  const serial: ToolCallRequest[] = [];

  for (const tc of toolCalls) {
    if (NEVER_PARALLEL.has(tc.function.name)) {
      serial.push(tc);
    } else if (PARALLEL_SAFE.has(tc.function.name)) {
      safeTools.push(tc);
    } else if (PATH_SCOPED.has(tc.function.name)) {
      safeTools.push(tc);
    } else {
      serial.push(tc);
    }
  }

  // 将 PARALLEL_SAFE 工具分组（检查 PATH_SCOPED 路径冲突）
  const parallelGroups: ToolCallRequest[][] = [];

  if (safeTools.length > 1) {
    // 分离 PATH_SCOPED 工具（需要路径检查）
    const pathScoped = safeTools.filter((t) => PATH_SCOPED.has(t.function.name));
    const trulySafe = safeTools.filter((t) => !PATH_SCOPED.has(t.function.name));

    // 全部 PARALLEL_SAFE 工具在一个组
    if (trulySafe.length > 0) {
      parallelGroups.push(trulySafe);
    }

    // PATH_SCOPED 工具检查路径重叠
    if (pathScoped.length > 1) {
      const paths = pathScoped.map((tc) => extractPath(tc.function.arguments));
      if (!pathsOverlap(paths)) {
        parallelGroups.push(pathScoped);
      } else {
        // 路径重叠的单独串行
        for (const tc of pathScoped) {
          serial.push(tc);
        }
      }
    } else if (pathScoped.length === 1) {
      // 单个 PATH_SCOPED 可以和 PARALLEL_SAFE 一起
      if (trulySafe.length > 0) {
        parallelGroups[0].push(pathScoped[0]);
      } else {
        serial.push(pathScoped[0]);
      }
    }
  } else if (safeTools.length === 1) {
    serial.push(safeTools[0]);
  }

  return { parallel: parallelGroups, serial };
}
