// TTS Provider 统一抽象 — 类型定义

/** TTS 合成请求 */
export interface TtsSynthesizeOptions {
  /** 文本内容 */
  text: string;
  /** 音色 ID */
  voice: string;
  /** 语速 (0.5-2.0, 默认 1.0) */
  speed?: number;
  /** 音调 (-20 ~ +20, 默认 0) */
  pitch?: number;
  /** 输出格式 */
  format?: 'mp3' | 'wav';
}

/** TTS 合成结果 */
export interface TtsSynthesizeResult {
  /** 音频 Buffer */
  audioBuffer: Buffer;
  /** MIME 类型 */
  mimeType: string;
  /** 实际使用的 provider */
  provider: string;
  /** 音频时长(秒) */
  duration?: number;
}

/** 音色信息 */
export interface TtsVoice {
  /** 音色 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 语言 */
  language: string;
  /** 性别 */
  gender?: 'male' | 'female' | 'neutral';
  /** 描述 */
  description?: string;
}

/** TTS Provider 接口 */
export interface TtsProvider {
  /** Provider 唯一 ID */
  readonly id: string;
  /** 显示名称 */
  readonly name: string;
  /** 是本地服务（不需要外部 API Key） */
  readonly isLocal: boolean;
  /** 健康检查 URL */
  readonly healthCheckUrl?: string;

  /** 获取可用音色列表 */
  getVoices(): Promise<TtsVoice[]>;

  /** 合成语音 */
  synthesize(options: TtsSynthesizeOptions): Promise<TtsSynthesizeResult>;

  /** 健康检查 */
  healthCheck(): Promise<boolean>;
}

/** 降级链结果 */
export interface FallbackResult {
  result: TtsSynthesizeResult;
  /** 实际使用的 provider ID */
  usedProvider: string;
  /** 是否经过降级 */
  degraded: boolean;
  /** 尝试过的 provider 列表 */
  attemptedProviders: string[];
}
