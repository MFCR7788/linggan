import type { ToolDefinition } from '../../types';
import { callDeepSeek } from '@/lib/ai-services';

/** 修复 LLM 返回 JSON 的常见语法问题（尾部逗号、未转义换行等） */
function repairJson(raw: string): string {
  let s = raw.trim();
  // 去掉尾部逗号（最常见的 LLM JSON 错误）: ,] 和 ,}
  s = s.replace(/,(\s*[\]}])/g, '$1');
  // 去掉字符串值内的未转义换行
  s = s.replace(/(?<=": ")([^"]*?)\n([^"]*?)(?=")/g, '$1\\n$2');
  // 去掉 JSON 前的非 [ 字符
  const start = s.indexOf('[');
  if (start > 0) s = s.substring(start);
  // 找到匹配的 ]
  let depth = 0;
  let end = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '[') depth++;
    else if (s[i] === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end > 0 && end < s.length) s = s.substring(0, end);
  return s;
}

export const generateGridImagesTool: ToolDefinition = {
  name: 'generate_grid_images',
  description: '生成朋友圈九宫格配图。适用于产品展示、活动宣传、品牌推广等场景，自动生成9张风格统一的配图。',
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: '九宫格主题（如产品名称、活动名称）' },
      scene: { type: 'string', description: '场景类型: product(产品展示), event(活动宣传), brand(品牌推广), lifestyle(生活方式), education(知识分享), food(美食)。默认 product' },
      keywords: { type: 'string', description: '补充关键词，用逗号分隔（可选）' },
    },
    required: ['topic'],
  },
  async handler(params, _ctx) {
    const topic = params.topic as string;
    const scene = (params.scene as string) || 'product';
    const keywords = params.keywords as string | undefined;

    const sceneLabels: Record<string, string> = {
      product: '产品展示', event: '活动宣传', brand: '品牌推广',
      lifestyle: '生活方式', education: '知识分享', food: '美食',
    };

    try {
      // Step 1: 用 AI 生成 9 张图的描述
      const prompt = `请为"${topic}"设计一套朋友圈九宫格配图（共9张）。

场景类型：${sceneLabels[scene] || scene}
${keywords ? `补充关键词：${keywords}` : ''}

要求：
1. 9张图风格统一，色调协调，适合朋友圈展示
2. 每张图有独立的视觉主题但整体构成一个系列
3. 适合手机屏幕查看，竖版构图

请以 JSON 数组格式输出 9 个图片描述（prompt），每个包含：
- position: 1-9（九宫格位置）
- title: 该格的简短标题
- prompt: 详细的图片生成描述（中文，50-100字）
- role: 该格在九宫格中的角色（如"主视觉""细节特写""氛围营造"等）

只返回 JSON 数组：`;

      const result = await callDeepSeek(prompt, { temperature: 0.9, maxTokens: 2500 });
      const jsonMatch = result.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        let cells: unknown[];
        try {
          cells = JSON.parse(jsonMatch[0]);
        } catch {
          // LLM 返回的 JSON 常有尾部逗号等问题，尝试修复后再解析
          try {
            const repaired = repairJson(jsonMatch[0]);
            cells = JSON.parse(repaired);
          } catch (e2) {
            return {
              success: false,
              output: '',
              error: `九宫格 JSON 解析失败: ${e2 instanceof Error ? e2.message : String(e2)}`,
            };
          }
        }

        if (!Array.isArray(cells) || cells.length === 0) {
          return { success: false, output: '九宫格方案生成失败，请重试。' };
        }

        const plan = cells.map((c: any, i: number) =>
          `${i + 1}. ${c.title} — ${c.prompt?.substring(0, 60)}...`
        ).join('\n');

        return {
          success: true,
          output: `已生成九宫格方案「${topic}」(${sceneLabels[scene] || scene})：\n\n${plan}\n\n⚠️ 逐张生成图片需要较长时间，请在 AI 创作→9宫格页面批量生成。`,
          data: { cells, topic, scene },
        };
      }

      return { success: false, output: '九宫格方案解析失败，请重试。' };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `九宫格生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
