import { describe, it, expect, beforeEach } from 'vitest';
import { ToolPermissionManager } from '@/lib/agent/tools/permissions';

describe('ToolPermissionManager', () => {
  let manager: ToolPermissionManager;

  beforeEach(() => {
    manager = new ToolPermissionManager();
  });

  describe('setPermission', () => {
    it('设置工具权限', () => {
      manager.setPermission('search', {
        requiresConfirmation: true,
        allowedRoles: ['admin'],
      });

      const perm = manager.getPermission('search');
      expect(perm?.requiresConfirmation).toBe(true);
      expect(perm?.allowedRoles).toEqual(['admin']);
    });
  });

  describe('checkPermission', () => {
    it('无配置默认允许', () => {
      const result = manager.checkPermission('unknown_tool', {});
      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
    });

    it('角色不匹配拒绝访问', () => {
      manager.setPermission('admin_tool', { allowedRoles: ['admin'] });
      const result = manager.checkPermission('admin_tool', { userRole: 'free' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('admin');
    });

    it('角色匹配允许访问', () => {
      manager.setPermission('admin_tool', { allowedRoles: ['admin'] });
      const result = manager.checkPermission('admin_tool', { userRole: 'admin' });
      expect(result.allowed).toBe(true);
    });

    it('超出调用次数限制', () => {
      manager.setPermission('expensive', { maxCallsPerSession: 2 });
      const ctx = { sessionId: 'sess-1' };

      // 前 2 次 OK
      expect(manager.checkPermission('expensive', ctx).allowed).toBe(true);
      manager.recordCall('expensive', 'sess-1');
      expect(manager.checkPermission('expensive', ctx).allowed).toBe(true);
      manager.recordCall('expensive', 'sess-1');
      // 第 3 次拒绝
      expect(manager.checkPermission('expensive', ctx).allowed).toBe(false);
    });
  });

  describe('recordCall', () => {
    it('正确记录调用次数', () => {
      manager.recordCall('search', 'sess-1');
      manager.recordCall('search', 'sess-1');
      expect(manager.getCallCount('search', 'sess-1')).toBe(2);
      expect(manager.getCallCount('search', 'sess-2')).toBe(0);
    });
  });

  describe('resetSession', () => {
    it('重置指定 session', () => {
      manager.recordCall('search', 'sess-1');
      manager.recordCall('search', 'sess-2');
      manager.resetSession('sess-1');
      expect(manager.getCallCount('search', 'sess-1')).toBe(0);
      expect(manager.getCallCount('search', 'sess-2')).toBe(1);
    });
  });
});
