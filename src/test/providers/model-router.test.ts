import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelRouter } from '@/lib/providers/model-router';
import { ProviderRegistry } from '@/lib/providers/registry';
import type { ProviderProfile } from '@/lib/providers/types';

function makeProfile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    name: 'test-provider',
    displayName: 'Test',
    description: 'Test provider',
    apiMode: 'chat_completions',
    aliases: [],
    envVars: ['TEST_API_KEY'],
    baseUrl: 'https://test.api.com/v1/chat/completions',
    defaultHeaders: { 'Content-Type': 'application/json' },
    defaultMaxTokens: 4096,
    defaultAuxModel: 'test-small',
    fallbackModels: ['fallback-1'],
    models: [
      {
        id: 'test-model',
        name: 'Test Model',
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
      },
    ],
    ...overrides,
  };
}

describe('ModelRouter', () => {
  let registry: ProviderRegistry;
  let router: ModelRouter;

  beforeEach(() => {
    registry = new ProviderRegistry();
    // 确保 env var 被 mock
    process.env.TEST_API_KEY = 'test-key-123';
    registry.register(makeProfile());
    router = new ModelRouter(registry, 'test-provider');
  });

  describe('resolveModel', () => {
    it('解析默认模型', () => {
      const resolved = router.resolveModel();
      expect(resolved.provider.name).toBe('test-provider');
      expect(resolved.model).toBe('test-model');
      expect(resolved.apiKey).toBe('test-key-123');
      expect(resolved.baseUrl).toBe('https://test.api.com/v1/chat/completions');
    });

    it('解析指定模型', () => {
      const resolved = router.resolveModel('test-model');
      expect(resolved.model).toBe('test-model');
    });

    it('未注册 provider 抛异常', () => {
      const empty = new ProviderRegistry();
      const r = new ModelRouter(empty);
      expect(() => r.resolveModel()).toThrow('not registered');
    });
  });

  describe('prepareMessages hook', () => {
    it('provider 有 prepareMessages 时自动调用', () => {
      registry.register(makeProfile({
        name: 'with-prepare',
        prepareMessages: (msgs) => {
          return [{ role: 'system', content: 'prepended' }, ...msgs];
        },
      }));
      const r = new ModelRouter(registry, 'with-prepare');
      const resolved = r.resolveModel();
      expect(resolved.provider.prepareMessages).toBeDefined();
    });
  });
});
