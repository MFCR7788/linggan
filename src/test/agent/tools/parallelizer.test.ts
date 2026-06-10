import { describe, it, expect } from 'vitest';
import { shouldParallelizeBatch, groupToolCallsForExecution } from '@/lib/agent/tools/parallelizer';
import type { ToolCallRequest } from '@/lib/agent/types';

function makeTC(name: string, id = 'call_1', args = '{}'): ToolCallRequest {
  return {
    id,
    type: 'function',
    function: { name, arguments: args },
  };
}

describe('shouldParallelizeBatch', () => {
  it('单个工具调用不并行', () => {
    expect(shouldParallelizeBatch([makeTC('web_search')])).toBe(false);
  });

  it('两个 PARALLEL_SAFE 工具可并行', () => {
    expect(shouldParallelizeBatch([
      makeTC('web_search'),
      makeTC('get_weather'),
    ])).toBe(true);
  });

  it('包含非安全工具不可并行', () => {
    expect(shouldParallelizeBatch([
      makeTC('web_search'),
      makeTC('generate_image', 'call_2'),
    ])).toBe(false);
  });

  it('包含 NEVER_PARALLEL 工具不可并行', () => {
    expect(shouldParallelizeBatch([
      makeTC('web_search'),
      makeTC('clarify', 'call_2'),
    ])).toBe(false);
  });

  it('不重叠路径的 PATH_SCOPED 工具可并行', () => {
    expect(shouldParallelizeBatch([
      makeTC('write_file', 'call_1', '{"path":"/a.ts"}'),
      makeTC('write_file', 'call_2', '{"path":"/b.ts"}'),
    ])).toBe(true);
  });

  it('重叠路径的 PATH_SCOPED 工具不可并行', () => {
    expect(shouldParallelizeBatch([
      makeTC('write_file', 'call_1', '{"path":"/a.ts"}'),
      makeTC('write_file', 'call_2', '{"path":"/a.ts"}'),
    ])).toBe(false);
  });
});

describe('groupToolCallsForExecution', () => {
  it('混合工具正确分组', () => {
    const result = groupToolCallsForExecution([
      makeTC('web_search', 'c1'),
      makeTC('get_weather', 'c2'),
      makeTC('generate_image', 'c3'),
      makeTC('search_memory', 'c4'),
    ]);

    expect(result.parallel).toHaveLength(1);       // web_search + get_weather + search_memory
    expect(result.parallel[0]).toHaveLength(3);    // 3 tools in parallel group
    expect(result.serial).toHaveLength(1);          // generate_image alone
    expect(result.serial[0].function.name).toBe('generate_image');
  });

  it('单个 PARALLEL_SAFE 工具进入 serial', () => {
    const result = groupToolCallsForExecution([
      makeTC('web_search', 'c1'),
      makeTC('generate_image', 'c2'),
    ]);
    // web_search alone → goes to serial (single tool in group)
    expect(result.serial).toHaveLength(2);
    expect(result.parallel).toHaveLength(0);
  });

  it('NEVER_PARALLEL 工具打断并行组', () => {
    const result = groupToolCallsForExecution([
      makeTC('web_search', 'c1'),
      makeTC('get_weather', 'c2'),
      makeTC('clarify', 'c3'),
      makeTC('search_memory', 'c4'),
    ]);

    // 所有 PARALLEL_SAFE 工具在一个组（clarify 在 serial）
    expect(result.parallel).toHaveLength(1);
    expect(result.parallel[0]).toHaveLength(3); // web_search + get_weather + search_memory
    expect(result.serial).toHaveLength(1);       // clarify only
    expect(result.serial[0].function.name).toBe('clarify');
  });
});
