// TTS 智能降级引擎
// 优先级: 本地 Kokoro → ChatTTS → GPT-SoVITS → CosyVoice Local → CosyVoice Cloud
// 本地全部失败才用云端，保证零成本优先

import type {
  TtsProvider,
  TtsSynthesizeOptions,
  TtsSynthesizeResult,
  FallbackResult,
} from './types';
import { ttsRegistry } from './registry';

/** 降级链优先级（本地优先，最后云端兜底） */
const FALLBACK_CHAIN = [
  'kokoro',            // Kokoro-82M 本地
  'cosyvoice-local',   // CosyVoice 本地部署
  'chattts',           // ChatTTS 本地
  'gptsovits',         // GPT-SoVITS 本地
  'cosyvoice-cloud',   // CosyVoice 云 API
] as const;

/**
 * 智能合成 — 按降级链尝试
 *
 * @param options 合成选项
 * @param preferredVoice 偏好的音色（可选，会自动匹配 provider）
 * @returns FallbackResult（包含实际使用的 provider 和降级信息）
 */
export async function synthesizeWithFallback(
  options: TtsSynthesizeOptions,
  preferredVoice?: string
): Promise<FallbackResult> {
  const attemptedProviders: string[] = [];

  // 如果指定了音色，尝试查找对应的 provider
  if (preferredVoice) {
    const providers = ttsRegistry.getAll();
    for (const provider of providers) {
      try {
        const voices = await provider.getVoices();
        if (voices.some(v => v.id === preferredVoice)) {
          const healthy = await ttsRegistry.isHealthy(provider.id);
          if (healthy) {
            try {
              const result = await provider.synthesize({
                ...options,
                voice: preferredVoice,
              });
              return { result, usedProvider: provider.id, degraded: false, attemptedProviders: [provider.id] };
            } catch {
              attemptedProviders.push(provider.id);
            }
          }
        }
      } catch { /* skip */ }
    }
  }

  // 按降级链尝试
  for (const providerId of FALLBACK_CHAIN) {
    const provider = ttsRegistry.get(providerId);
    if (!provider) continue;

    const healthy = await ttsRegistry.isHealthy(providerId);
    if (!healthy) {
      attemptedProviders.push(`${providerId}(unhealthy)`);
      continue;
    }

    try {
      // 尝试获取音色：优先用指定的，不行就用第一个
      let voice = options.voice;
      if (preferredVoice) {
        const voices = await provider.getVoices();
        // 不同 provider 的音色 ID 不同，用第一个匹配或默认第一个
        if (!voices.some(v => v.id === voice)) {
          voice = voices[0]?.id || voice;
        }
      }

      const result = await provider.synthesize({ ...options, voice });
      return {
        result,
        usedProvider: providerId,
        degraded: attemptedProviders.length > 0,
        attemptedProviders: [...attemptedProviders, providerId],
      };
    } catch (e) {
      attemptedProviders.push(`${providerId}(${e instanceof Error ? e.message.slice(0, 40) : 'unknown'})`);
      console.warn(`[tts-fallback] ${providerId} 合成失败，尝试下一级`);
    }
  }

  throw new Error(
    `所有 TTS Provider 均不可用。尝试过: ${attemptedProviders.join(' → ')}`
  );
}

/**
 * 快速合成（忽略降级链，仅用指定或默认 provider）
 */
export async function synthesizeSimple(
  options: TtsSynthesizeOptions,
  providerId?: string
): Promise<TtsSynthesizeResult> {
  if (providerId) {
    const provider = ttsRegistry.get(providerId);
    if (provider) {
      const healthy = await ttsRegistry.isHealthy(providerId);
      if (healthy) {
        return provider.synthesize(options);
      }
      throw new Error(`TTS Provider "${providerId}" 不可用`);
    }
    throw new Error(`未找到 TTS Provider: ${providerId}`);
  }

  // 默认：第一个健康的 provider
  const healthy = await ttsRegistry.getHealthyProviders();
  if (healthy.length === 0) {
    throw new Error('没有可用的 TTS Provider');
  }
  return healthy[0].synthesize(options);
}
