import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '@/lib/agent/tools/registry';
import type { ToolDefinition } from '@/lib/agent/types';
import { ToolPermissionManager } from '@/lib/agent/tools/permissions';

function makeTool(name: string, handler?: ToolDefinition['handler']): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    parameters: { type: 'object', properties: {} },
    handler: handler ?? (async () => ({ success: true, output: `${name} result` })),
  };
}

describe('ToolRegistry (enhanced)', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('deregister', () => {
    it('注销后返回 undefined', () => {
      registry.register(makeTool('search'));
      expect(registry.get('search')).toBeDefined();
      registry.deregister('search');
      expect(registry.get('search')).toBeUndefined();
    });

    it('注销不存在的工具返回 false', () => {
      expect(registry.deregister('nonexistent')).toBe(false);
    });
  });

  describe('deregisterByToolset', () => {
    it('按 toolset 批量注销', () => {
      registry.register(makeTool('a'), { toolset: 'mcp-github' });
      registry.register(makeTool('b'), { toolset: 'mcp-github' });
      registry.register(makeTool('c'), { toolset: 'builtin' });

      const count = registry.deregisterByToolset('mcp-github');
      expect(count).toBe(2);
      expect(registry.get('a')).toBeUndefined();
      expect(registry.get('b')).toBeUndefined();
      expect(registry.get('c')).toBeDefined();
    });
  });

  describe('getByToolset', () => {
    it('返回指定 toolset 的工具', () => {
      registry.register(makeTool('a'), { toolset: 'mcp-github' });
      registry.register(makeTool('b'), { toolset: 'builtin' });

      const mcpTools = registry.getByToolset('mcp-github');
      expect(mcpTools).toHaveLength(1);
      expect(mcpTools[0].name).toBe('a');
    });
  });

  describe('isToolsetAvailable', () => {
    it('有工具时返回 true', () => {
      registry.register(makeTool('a'), { toolset: 'mcp-github' });
      expect(registry.isToolsetAvailable('mcp-github')).toBe(true);
    });

    it('无工具时返回 false', () => {
      expect(registry.isToolsetAvailable('nonexistent')).toBe(false);
    });
  });

  describe('getAvailableForUser', () => {
    it('权限过滤后只返回允许的工具', () => {
      const permManager = new ToolPermissionManager();
      permManager.setPermission('admin_tool', { allowedRoles: ['admin'] });

      registry.register(makeTool('search'), { toolset: 'builtin' });
      registry.register(makeTool('admin_tool'), { toolset: 'builtin' });

      const available = registry.getAvailableForUser({ userRole: 'free' }, permManager);
      expect(available).toHaveLength(1);
      expect(available[0].name).toBe('search');
    });

    it('无权限管理器时返回全部', () => {
      registry.register(makeTool('a'));
      registry.register(makeTool('b'));
      expect(registry.getAvailableForUser({})).toHaveLength(2);
    });
  });

  describe('executeParallel', () => {
    it('并行执行多个工具', async () => {
      const results: string[] = [];
      registry.register(makeTool('a', async () => {
        results.push('a-start');
        await new Promise((r) => setTimeout(r, 20));
        results.push('a-end');
        return { success: true, output: 'a' };
      }));
      registry.register(makeTool('b', async () => {
        results.push('b-start');
        await new Promise((r) => setTimeout(r, 10));
        results.push('b-end');
        return { success: true, output: 'b' };
      }));

      const execResults = await registry.executeParallel(
        [
          { name: 'a', params: {} },
          { name: 'b', params: {} },
        ],
        { userId: 'user-1' }
      );

      expect(execResults.get('a')?.output).toBe('a');
      expect(execResults.get('b')?.output).toBe('b');
      // b 先完成（超时更短）
      expect(results.indexOf('b-end')).toBeLessThan(results.indexOf('a-end'));
    });
  });

  describe('register override', () => {
    it('override: true 允许覆盖', () => {
      registry.register(makeTool('search'));
      registry.register({ ...makeTool('search'), description: 'updated' }, { override: true });
      expect(registry.get('search')?.description).toBe('updated');
    });
  });
});
