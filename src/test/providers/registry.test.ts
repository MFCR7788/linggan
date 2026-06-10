import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry } from '@/lib/providers/registry';
import type { ProviderProfile } from '@/lib/providers/types';

function makeProfile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    name: 'test-provider',
    displayName: 'Test Provider',
    description: 'A test provider',
    apiMode: 'chat_completions',
    aliases: [],
    envVars: ['TEST_API_KEY'],
    baseUrl: 'https://test.api.com/v1/chat/completions',
    defaultHeaders: { 'Content-Type': 'application/json' },
    defaultMaxTokens: 4096,
    defaultAuxModel: 'test-small',
    fallbackModels: [],
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

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe('register', () => {
    it('注册一个 provider', () => {
      const profile = makeProfile();
      registry.register(profile);
      expect(registry.get('test-provider')).toBe(profile);
    });

    it('重复注册同名 provider 会抛出错误', () => {
      registry.register(makeProfile());
      expect(() => registry.register(makeProfile())).toThrow('already registered');
    });

    it('注册时自动注册别名', () => {
      registry.register(makeProfile({ aliases: ['alias1', 'alias2'] }));
      expect(registry.get('alias1')).toBe(registry.get('test-provider'));
      expect(registry.get('alias2')).toBe(registry.get('test-provider'));
    });

    it('重复别名会抛出错误', () => {
      registry.register(makeProfile({ name: 'p1', aliases: ['shared'] }));
      expect(() => registry.register(makeProfile({ name: 'p2', aliases: ['shared'] }))).toThrow('already taken');
    });
  });

  describe('get', () => {
    it('返回 undefined 对于未注册的 provider', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('通过别名查找返回正确 provider', () => {
      registry.register(makeProfile({ aliases: ['myalias'] }));
      expect(registry.get('myalias')?.name).toBe('test-provider');
    });
  });

  describe('list', () => {
    it('列出所有注册的 provider', () => {
      registry.register(makeProfile({ name: 'p1' }));
      registry.register(makeProfile({ name: 'p2' }));
      expect(registry.list()).toHaveLength(2);
    });
  });

  describe('hasApiKey', () => {
    it('环境变量未设置时返回 false', () => {
      const profile = makeProfile({ envVars: ['NONEXISTENT_VAR_XYZ'] });
      expect(registry.hasApiKey(profile)).toBe(false);
    });
  });

  describe('单例', () => {
    it('ProviderRegistry.instance 返回同一实例', () => {
      const a = ProviderRegistry.instance;
      const b = ProviderRegistry.instance;
      expect(a).toBe(b);
    });
  });
});
