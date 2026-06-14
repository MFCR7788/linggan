// TTS 模块 — 统一导出

export type {
  TtsProvider,
  TtsSynthesizeOptions,
  TtsSynthesizeResult,
  TtsVoice,
  FallbackResult,
} from './types';

export { TtsRegistry, ttsRegistry } from './registry';
export { synthesizeWithFallback, synthesizeSimple } from './fallback-engine';

// 直接导出各 provider 以便单独使用
export { kokoroProvider } from './providers/kokoro';
export { cosyvoiceCloudProvider } from './providers/cosyvoice-cloud';
export { cosyvoiceLocalProvider } from './providers/cosyvoice-local';
export { chatttsProvider } from './providers/chattts';
export { gptsovitsProvider } from './providers/gptsovits';
