// HookManager 测试 — register / emit / emitCollect / 错误隔离

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookManager } from '@/lib/hooks/manager';
import type { HookDefinition } from '@/lib/hooks/types';

describe('HookManager', () => {
  let manager: HookManager;

  beforeEach(() => {
    manager = new HookManager();
  });

  describe('register', () => {
    it('注册单个 hook 到指定事件', () => {
      const handler = vi.fn();
      manager.register({
        name: 'test-hook',
        description: '测试钩子',
        events: ['agent:start'],
        handler,
      });

      expect(manager.count('agent:start')).toBe(1);
      expect(manager.count('agent:end')).toBe(0);
    });

    it('一个 hook 可监听多个事件', () => {
      const handler = vi.fn();
      manager.register({
        name: 'multi-event',
        description: '多事件钩子',
        events: ['pre_llm_call', 'pre_tool_call'],
        handler,
      });

      expect(manager.count('pre_llm_call')).toBe(1);
      expect(manager.count('pre_tool_call')).toBe(1);
    });

    it('多个 hook 监听同一事件', () => {
      manager.register({ name: 'a', description: '', events: ['agent:start'], handler: vi.fn() });
      manager.register({ name: 'b', description: '', events: ['agent:start'], handler: vi.fn() });

      expect(manager.count('agent:start')).toBe(2);
    });

    it('registerAll 批量注册', () => {
      const defs: HookDefinition[] = [
        { name: 'a', description: '', events: ['agent:start'], handler: vi.fn() },
        { name: 'b', description: '', events: ['agent:end'], handler: vi.fn() },
      ];
      manager.registerAll(defs);

      expect(manager.count('agent:start')).toBe(1);
      expect(manager.count('agent:end')).toBe(1);
    });
  });

  describe('emit', () => {
    it('触发事件时调用所有 handler', async () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      manager.register({ name: 'h1', description: '', events: ['pre_llm_call'], handler: h1 });
      manager.register({ name: 'h2', description: '', events: ['pre_llm_call'], handler: h2 });

      const ctx = { userId: 'u1', sessionId: 's1' };
      await manager.emit('pre_llm_call', ctx);

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('handler 收到完整 context（含 event）', async () => {
      const handler = vi.fn();
      manager.register({ name: 'test', description: '', events: ['pre_tool_call'], handler });

      const ctx = { userId: 'u1', toolName: 'search', toolArgs: { q: 'hello' } };
      await manager.emit('pre_tool_call', ctx);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'pre_tool_call',
          userId: 'u1',
          toolName: 'search',
          toolArgs: { q: 'hello' },
        })
      );
    });

    it('handler 抛出异常时不影响其他 handler', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const h1 = vi.fn().mockRejectedValue(new Error('boom'));
      const h2 = vi.fn();

      manager.register({ name: 'bad', description: '', events: ['agent:start'], handler: h1 });
      manager.register({ name: 'good', description: '', events: ['agent:start'], handler: h2 });

      await manager.emit('agent:start', { userId: 'u1' });

      expect(h1).toHaveBeenCalled();
      expect(h2).toHaveBeenCalled(); // 不应被 h1 异常影响
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error)
      );
      consoleWarn.mockRestore();
    });

    it('无 handler 注册时 emit 不报错', async () => {
      await expect(manager.emit('agent:start', { userId: 'u1' })).resolves.toBeUndefined();
    });

    it('handler 可接收 messages 并修改', async () => {
      const messages = [{ role: 'user', content: 'hello' }] as any[];
      const handler = vi.fn().mockImplementation(async (ctx: any) => {
        if (ctx.messages) {
          ctx.messages[0].content = 'modified';
        }
      });

      manager.register({ name: 'modifier', description: '', events: ['pre_llm_call'], handler });
      await manager.emit('pre_llm_call', { userId: 'u1', messages });

      expect(messages[0].content).toBe('modified');
    });
  });

  describe('emitCollect', () => {
    it('收集所有 handler 的返回值', async () => {
      manager.register({
        name: 'returns-value',
        description: '',
        events: ['pre_llm_call'],
        handler: async () => ({ blocked: true }),
      });

      const results = await manager.emitCollect('pre_llm_call', { userId: 'u1' });
      expect(results).toEqual([{ blocked: true }]);
    });

    it('handler 返回 undefined 时不计入结果', async () => {
      manager.register({
        name: 'returns-void',
        description: '',
        events: ['agent:start'],
        handler: async () => { /* void */ },
      });

      const results = await manager.emitCollect('agent:start', { userId: 'u1' });
      expect(results).toEqual([]);
    });

    it('某个 handler 失败时其他 handler 返回值仍被收集', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      manager.register({ name: 'bad', description: '', events: ['agent:end'], handler: async () => { throw new Error('fail'); } });
      manager.register({ name: 'good', description: '', events: ['agent:end'], handler: async () => 'ok' });

      const results = await manager.emitCollect('agent:end', { userId: 'u1' });
      expect(results).toEqual(['ok']);
      consoleWarn.mockRestore();
    });

    it('无 handler 注册时返回空数组', async () => {
      const results = await manager.emitCollect('post_tool_call', { userId: 'u1' });
      expect(results).toEqual([]);
    });
  });

  describe('clearEvent / clearAll', () => {
    it('clearEvent 清除指定事件的所有 handler', () => {
      manager.register({ name: 'a', description: '', events: ['agent:start', 'agent:end'], handler: vi.fn() });
      manager.clearEvent('agent:start');

      expect(manager.count('agent:start')).toBe(0);
      expect(manager.count('agent:end')).toBe(1); // 不受影响
    });

    it('clearAll 清除全部 handler', () => {
      manager.register({ name: 'a', description: '', events: ['agent:start'], handler: vi.fn() });
      manager.register({ name: 'b', description: '', events: ['agent:end'], handler: vi.fn() });
      manager.clearAll();

      expect(manager.count('agent:start')).toBe(0);
      expect(manager.count('agent:end')).toBe(0);
    });
  });

  describe('count', () => {
    it('返回指定事件的 handler 数量', () => {
      expect(manager.count('agent:start')).toBe(0);

      manager.register({ name: 'a', description: '', events: ['agent:start'], handler: vi.fn() });
      expect(manager.count('agent:start')).toBe(1);

      manager.register({ name: 'b', description: '', events: ['agent:start'], handler: vi.fn() });
      expect(manager.count('agent:start')).toBe(2);
    });
  });

  describe('credit-check builtin', () => {
    it('creditCheckHook 在点数余额存在时注入系统提示', async () => {
      const { creditCheckHook } = await import('@/lib/hooks/builtin/credit-check');
      const messages = [{ role: 'system', content: '你是一个助手。' }] as any[];

      await creditCheckHook.handler({
        event: 'pre_llm_call',
        userId: 'u1',
        messages,
        custom: { creditsBalance: 500 },
      });

      expect(messages[0].content).toContain('灵力余额: 500');
    });

    it('creditCheckHook 在无点数时跳过', async () => {
      const { creditCheckHook } = await import('@/lib/hooks/builtin/credit-check');
      const messages = [{ role: 'system', content: '你是一个助手。' }] as any[];

      await creditCheckHook.handler({
        event: 'pre_llm_call',
        userId: 'u1',
        messages,
      });

      expect(messages[0].content).toBe('你是一个助手。');
    });
  });
});
