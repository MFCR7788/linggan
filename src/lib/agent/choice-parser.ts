// 选项解析器 — 从 LLM 输出中解析 <choices> 标签
// 纯函数，可在服务端/测试中使用

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
}

export interface ChoiceBlock {
  /** 是否多选 */
  multi: boolean;
  /** 选项列表 */
  options: ChoiceOption[];
  /** 原始标签文本（用于从消息中移除） */
  rawText: string;
}

/**
 * 从文本中解析 <choices> 标签
 * 格式: <choices multi="true|false">选项1: 描述|选项2: 描述|...</choices>
 */
export function parseChoices(text: string): { choices: ChoiceBlock[]; cleanedText: string } {
  const choices: ChoiceBlock[] = [];
  const regex = /<choices\s*(multi\s*=\s*"(true|false)")?\s*>([\s\S]*?)<\/choices>/gi;

  let cleanedText = text;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const multi = match[2] !== 'false'; // 默认多选
    const raw = match[3].trim();

    // 按 | 或换行分割选项
    const optionTexts = raw.split(/[|\n]/).map(s => s.trim()).filter(Boolean);

    const options: ChoiceOption[] = optionTexts.map((opt, i) => {
      // 检查是否有冒号分隔的描述 (label: description)
      const colonIdx = opt.indexOf(':');
      if (colonIdx > 0) {
        return {
          id: `opt_${i}`,
          label: opt.substring(0, colonIdx).trim(),
          description: opt.substring(colonIdx + 1).trim(),
        };
      }
      return {
        id: `opt_${i}`,
        label: opt,
      };
    });

    if (options.length > 0) {
      choices.push({ multi, options, rawText: match[0] });
    }

    // 从此副本中移除 choices 标签
    cleanedText = cleanedText.replace(match[0], '');
  }

  return { choices, cleanedText: cleanedText.trim() };
}
