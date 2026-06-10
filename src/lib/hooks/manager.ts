// HookManager — Agent 生命周期事件管理器
// 注册钩子，在关键节点触发

import type { HookEvent, HookHandler, HookContext, HookDefinition } from './types';

export class HookManager {
  private handlers = new Map<HookEvent, Array<{ name: string; handler: HookHandler }>>();

  /** 注册单个钩子 */
  register(def: HookDefinition): void {
    for (const event of def.events) {
      const list = this.handlers.get(event) || [];
      list.push({ name: def.name, handler: def.handler });
      this.handlers.set(event, list);
    }
  }

  /** 批量注册 */
  registerAll(defs: HookDefinition[]): void {
    for (const def of defs) {
      this.register(def);
    }
  }

  /** 触发事件（所有 handler 并行执行，异常被捕获） */
  async emit(event: HookEvent, ctx: HookContext): Promise<void> {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;

    const fullCtx = { ...ctx, event };
    const results = await Promise.allSettled(
      list.map(({ handler }) => Promise.resolve(handler(fullCtx)))
    );

    // 记录失败（不抛异常）
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        console.warn(`[Hook] "${list[i].name}" on "${event}" failed:`, result.reason);
      }
    }
  }

  /** 触发事件并收集返回值 */
  async emitCollect(event: HookEvent, ctx: HookContext): Promise<unknown[]> {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return [];

    const fullCtx = { ...ctx, event };
    const results = await Promise.allSettled(
      list.map(async ({ name, handler }) => {
        // 如果 handler 返回 undefined，说明它没有返回值
        const result = await Promise.resolve(handler(fullCtx));
        return { name, value: result };
      })
    );

    const collected: unknown[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.value !== undefined) {
        collected.push(result.value.value);
      } else if (result.status === 'rejected') {
        console.warn(`[Hook] emitCollect failed:`, result.reason);
      }
    }
    return collected;
  }

  /** 移除指定事件的所有 handler */
  clearEvent(event: HookEvent): void {
    this.handlers.delete(event);
  }

  /** 清除所有 handler */
  clearAll(): void {
    this.handlers.clear();
  }

  /** 获取指定事件的 handler 数量 */
  count(event: HookEvent): number {
    return this.handlers.get(event)?.length ?? 0;
  }
}
