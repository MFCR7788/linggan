// Provider 抽象层类型 — ProviderProfile / ModelCapability / ResolvedModel

export type ApiMode = 'chat_completions';

export interface ModelCapability {
  id: string;                    // e.g. "deepseek-v3", "qwen-max"
  name: string;                  // display name
  contextWindow: number;         // max context tokens
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  costPer1kInput?: number;       // 可选成本元数据
  costPer1kOutput?: number;
}

export interface ProviderProfile {
  /** 规范 ID，如 "dashscope" */
  name: string;
  /** 展示名 */
  displayName: string;
  /** 简要描述 */
  description: string;
  /** API 模式（目前仅 chat_completions） */
  apiMode: ApiMode;
  /** 别名，如 ["bailian", "alibaba"] */
  aliases: string[];
  /** 依赖的环境变量名 */
  envVars: string[];
  /** API 基础 URL */
  baseUrl: string;
  /** 模型列表端点（可选） */
  modelsUrl?: string;
  /** 默认请求头 */
  defaultHeaders: Record<string, string>;
  /** 固定温度（如有） */
  fixedTemperature?: number | null;
  /** 默认最大输出 token */
  defaultMaxTokens?: number;
  /** 默认辅助模型（压缩/标题生成等轻量任务） */
  defaultAuxModel: string;
  /** 支持的模型列表 */
  models: ModelCapability[];
  /** 故障转移候选模型 ID 列表（按优先级） */
  fallbackModels: string[];

  /** 消息预处理（provider 特定格式转换） */
  prepareMessages?: (messages: Array<{ role: string; content: unknown }>) => Array<{ role: string; content: unknown }>;
  /** 构建额外请求体字段 */
  buildExtraBody?: (ctx: ExtraBodyContext) => Record<string, unknown>;
  /** 拉取模型列表 */
  fetchModels?: (apiKey: string) => Promise<ModelCapability[]>;
}

export interface ExtraBodyContext {
  model: string;
  temperature: number;
  maxTokens: number;
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  enableSearch?: boolean;
  stream?: boolean;
}

export interface ResolvedModel {
  provider: ProviderProfile;
  model: string;
  apiKey: string;
  baseUrl: string;
  headers: Record<string, string>;
}
