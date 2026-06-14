// ParamCard 解析器 — 从 LLM 输出中解析 <param_card> JSON 块
// 格式: <param_card>{ JSON schema }</param_card>
// 与 choice-parser.ts 并存，不替换

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface ParamField {
  name: string;
  label: string;
  type: 'select' | 'slider' | 'toggle' | 'text';
  required?: boolean;
  /** select 类型的选项 */
  options?: SelectOption[];
  /** slider 类型的范围 */
  min?: number;
  max?: number;
  step?: number;
  /** 默认值 */
  default?: unknown;
  /** slider 的单位标签 */
  unit?: string;
  /** text 类型的占位文字 */
  placeholder?: string;
  /** text 类型的最大长度 */
  maxLength?: number;
}

export interface ParamCardSchema {
  title: string;
  description?: string;
  fields: ParamField[];
}

export interface ParseResult {
  cards: ParamCardSchema[];
  cleanedText: string;
}

/**
 * 从文本中解析 <param_card> 块
 * 内部 JSON 需遵守 ParamCardSchema 格式
 */
export function parseParamCards(text: string): ParseResult {
  const cards: ParamCardSchema[] = [];
  const regex = /<param_card>\s*([\s\S]*?)\s*<\/param_card>/gi;

  let cleanedText = text;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawJson = match[1].trim();
    // 先清理文本（无论解析是否成功都移除块）
    cleanedText = cleanedText.replace(match[0], '');
    try {
      const schema = JSON.parse(rawJson) as ParamCardSchema;
      if (schema.title && Array.isArray(schema.fields) && schema.fields.length > 0) {
        cards.push(schema);
      }
    } catch {
      // JSON 解析失败，跳过但不保留在文本中
    }
  }

  return { cards, cleanedText: cleanedText.trim() };
}

/**
 * 将用户填写的参数值格式化为提交文本
 */
export function formatParamValues(
  schema: ParamCardSchema,
  values: Record<string, unknown>
): string {
  const lines: string[] = [];

  for (const field of schema.fields) {
    const value = values[field.name];
    if (value === undefined || value === null) continue;

    let display: string;
    if (field.type === 'toggle') {
      display = value ? '是' : '否';
    } else if (field.type === 'slider' && field.unit) {
      display = `${value}${field.unit}`;
    } else if (field.type === 'select' && field.options) {
      const opt = field.options.find((o) => o.value === value);
      display = opt?.label || String(value);
    } else {
      display = String(value);
    }

    lines.push(`- ${field.label}：${display}`);
  }

  return lines.join('\n');
}
