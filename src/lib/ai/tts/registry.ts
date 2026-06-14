// TTS Provider 注册中心 — 统一管理和自动降级

import type { TtsProvider, TtsVoice } from './types';
import { kokoroProvider } from './providers/kokoro';
import { cosyvoiceCloudProvider } from './providers/cosyvoice-cloud';
import { cosyvoiceLocalProvider } from './providers/cosyvoice-local';
import { chatttsProvider } from './providers/chattts';
import { gptsovitsProvider } from './providers/gptsovits';

export class TtsRegistry {
  private providers = new Map<string, TtsProvider>();
  private healthStatus = new Map<string, boolean>();
  private lastHealthCheck = new Map<string, number>();
  private healthCheckTTL = 30_000; // 30 秒缓存

  constructor() {
    // 注册所有 provider
    this.register(kokoroProvider);
    this.register(cosyvoiceCloudProvider);
    this.register(cosyvoiceLocalProvider);
    this.register(chatttsProvider);
    this.register(gptsovitsProvider);
  }

  /** 注册 provider */
  register(provider: TtsProvider): void {
    this.providers.set(provider.id, provider);
  }

  /** 获取 provider */
  get(id: string): TtsProvider | undefined {
    return this.providers.get(id);
  }

  /** 获取所有 provider */
  getAll(): TtsProvider[] {
    return Array.from(this.providers.values());
  }

  /** 获取本地 provider（免费） */
  getLocals(): TtsProvider[] {
    return this.getAll().filter(p => p.isLocal);
  }

  /** 获取云端 provider */
  getRemotes(): TtsProvider[] {
    return this.getAll().filter(p => !p.isLocal);
  }

  /** 获取所有可用音色 */
  async getAllVoices(): Promise<Array<{ voice: TtsVoice; providerId: string; isLocal: boolean }>> {
    const result: Array<{ voice: TtsVoice; providerId: string; isLocal: boolean }> = [];
    for (const p of this.providers.values()) {
      try {
        const voices = await p.getVoices();
        for (const v of voices) {
          result.push({ voice: v, providerId: p.id, isLocal: p.isLocal });
        }
      } catch { /* skip unavailable */ }
    }
    return result;
  }

  /** 健康检查（带缓存） */
  async isHealthy(providerId: string): Promise<boolean> {
    const now = Date.now();
    const last = this.lastHealthCheck.get(providerId);
    if (last && (now - last) < this.healthCheckTTL) {
      return this.healthStatus.get(providerId) || false;
    }

    const provider = this.providers.get(providerId);
    if (!provider) return false;

    try {
      const healthy = await provider.healthCheck();
      this.healthStatus.set(providerId, healthy);
      this.lastHealthCheck.set(providerId, now);
      return healthy;
    } catch {
      this.healthStatus.set(providerId, false);
      this.lastHealthCheck.set(providerId, now);
      return false;
    }
  }

  /** 获取所有健康的 provider（本地优先） */
  async getHealthyProviders(): Promise<TtsProvider[]> {
    const results: TtsProvider[] = [];
    // 本地优先
    for (const p of this.getLocals()) {
      if (await this.isHealthy(p.id)) results.push(p);
    }
    // 再云端
    for (const p of this.getRemotes()) {
      if (await this.isHealthy(p.id)) results.push(p);
    }
    return results;
  }

  /** 重置健康检查缓存 */
  resetHealthCache(): void {
    this.healthStatus.clear();
    this.lastHealthCheck.clear();
  }
}

/** 全局单例 */
export const ttsRegistry = new TtsRegistry();
