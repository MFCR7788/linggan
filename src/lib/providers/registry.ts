// ProviderRegistry — 注册/查找 AI provider，支持别名

import type { ProviderProfile } from './types';
import { getEnv } from '@/lib/runtime-config';

export class ProviderRegistry {
  private providers = new Map<string, ProviderProfile>();
  private aliasMap = new Map<string, string>(); // alias → canonical name
  private initialized = false;

  /** 注册一个 provider，同时注册其所有别名 */
  register(profile: ProviderProfile): void {
    if (this.providers.has(profile.name)) {
      throw new Error(`Provider "${profile.name}" is already registered`);
    }
    this.providers.set(profile.name, profile);
    for (const alias of profile.aliases) {
      if (this.aliasMap.has(alias)) {
        throw new Error(`Alias "${alias}" is already taken`);
      }
      this.aliasMap.set(alias, profile.name);
    }
  }

  /** 通过名称或别名查找 provider */
  get(name: string): ProviderProfile | undefined {
    const canonical = this.aliasMap.get(name) || name;
    return this.providers.get(canonical);
  }

  /** 列出所有已注册 provider */
  list(): ProviderProfile[] {
    return Array.from(this.providers.values());
  }

  /** 列出当前有可用 API key 的 provider */
  listAvailable(): ProviderProfile[] {
    return this.list().filter((p) => this.hasApiKey(p));
  }

  /** 检查 provider 是否配置了 API key */
  hasApiKey(profile: ProviderProfile): boolean {
    return profile.envVars.every((envVar) => {
      const val = getEnv(envVar);
      return val !== undefined && val !== '';
    });
  }

  /** 获取 provider 的 API key（取第一个环境变量） */
  getApiKey(profile: ProviderProfile): string {
    const val = getEnv(profile.envVars[0]);
    if (!val) throw new Error(`${profile.envVars[0]} is not configured`);
    return val;
  }

  /** 标记初始化完成 */
  markInitialized(): void {
    this.initialized = true;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  /** 单例 */
  private static _instance: ProviderRegistry | null = null;
  static get instance(): ProviderRegistry {
    if (!ProviderRegistry._instance) {
      ProviderRegistry._instance = new ProviderRegistry();
    }
    return ProviderRegistry._instance;
  }
}
