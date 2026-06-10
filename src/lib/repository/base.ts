// Repository<T> — 通用持久化接口
// 仅用于新功能（MCP 配置、Hook 配置等），旧代码不迁移

export interface Repository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  findMany(query?: Record<string, unknown>): Promise<T[]>;
  create(data: Omit<T, 'id'> & { id?: string }): Promise<T>;
  update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T>;
  upsert(data: T): Promise<T>;
  delete(id: string): Promise<void>;
  count(query?: Record<string, unknown>): Promise<number>;
}
