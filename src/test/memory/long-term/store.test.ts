// LongTermMemoryStore 测试

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LongTermMemoryStore } from '@/lib/memory/long-term/store';

describe('LongTermMemoryStore', () => {
  let store: LongTermMemoryStore;

  beforeEach(() => {
    store = new LongTermMemoryStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('插入并搜索记忆', () => {
    store.insert('user1', 'preference', '喜欢小红书风格文案', 8);
    store.insert('user1', 'fact', '拥有3年新媒体运营经验', 6);
    store.insert('user1', 'style', '偏好温暖治愈风格', 7);

    const results = store.search({ userId: 'user1', query: '小红书' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.content.includes('小红书'))).toBe(true);
  });

  it('低重要性记忆不参与检索', () => {
    store.insert('user1', 'preference', '重要偏好', 8);
    store.insert('user1', 'fact', '不重要信息', 2);

    const results = store.search({ userId: 'user1', query: '偏好 信息', minImportance: 3 });
    expect(results.every((r) => r.importance >= 3)).toBe(true);
  });

  it('getByUser 返回按重要性排序的记忆', () => {
    store.insert('user1', 'fact', '中等', 5);
    store.insert('user1', 'preference', '最高', 10);
    store.insert('user1', 'style', '较低', 3);

    const results = store.getByUser('user1');
    expect(results[0].importance).toBe(10);
    expect(results[0].content).toBe('最高');
  });

  it('删除记忆', () => {
    const entry = store.insert('user1', 'fact', '测试删除', 5);
    expect(entry).not.toBeNull();
    if (!entry) return;
    const deleted = store.delete(entry.id, 'user1');
    expect(deleted).toBe(true);

    const results = store.getByUser('user1');
    expect(results.some((r) => r.id === entry.id)).toBe(false);
  });

  it('更新重要性', () => {
    const entry = store.insert('user1', 'fact', '可更新', 3);
    expect(entry).not.toBeNull();
    if (!entry) return;
    store.updateImportance(entry.id, 'user1', 7);

    const results = store.getByUser('user1');
    const updated = results.find((r) => r.id === entry.id);
    expect(updated?.importance).toBe(7);
  });

  it('按类型筛选', () => {
    store.insert('user1', 'preference', '偏好A', 5);
    store.insert('user1', 'fact', '事实A', 5);

    const results = store.search({ userId: 'user1', query: '', type: 'preference' });
    expect(results.every((r) => r.type === 'preference')).toBe(true);
  });
});
