import type { ToolDefinition } from '../../types';
import { callDeepSeek } from '@/lib/ai-services';
import { generateImage } from '@/lib/ai/image';

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
  description: `生成朋友圈九宫格配图方案 + 首图预览。
流程：AI 设计 9 张统一风格的图片方案 → 自动生成第 1 张作为风格预览 → 返回完整方案。
用户确认首图风格后，可前往「AI 创作 → 9宫格」页面批量生成剩余 8 张。
适用场景：产品展示、活动宣传、品牌推广、生活方式、知识分享、美食。`,
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: '九宫格主题（如产品名称、活动名称）' },
      scene: {
        type: 'string',
        description: '场景类型: product(产品展示), event(活动宣传), brand(品牌推广), lifestyle(生活方式), education(知识分享), food(美食)。默认 product',
      },
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
          try {
            const repaired = repairJson(jsonMatch[0]);
            cells = JSON.parse(repaired);
          } catch (e2) {
            return {
              success: false,
              output: '',
              error: `九宫格 JSON 解析失败: ${e2 instanceof Error ? e2.message : String(e2)}。可前往「AI 创作 → 9宫格」页面手动生成。`,
            };
          }
        }

        if (!Array.isArray(cells) || cells.length === 0) {
          return { success: false, output: '九宫格方案生成失败，请重试。' };
        }

        // Step 2: 生成第 1 张作为风格预览
        let previewUrl: string | null = null;
        const firstCell = cells[0] as { prompt?: string; title?: string };
        if (firstCell?.prompt) {
          try {
            const imgResult = await generateImage(firstCell.prompt, { ratio: '1:1', n: 1 });
            const single = Array.isArray(imgResult) ? imgResult[0] : imgResult;
            previewUrl = single?.imageUrl || null;
          } catch {
            // 预览生成失败不影响方案输出
          }
        }

        const plan = cells.map((c: any, i: number) =>
          `${i + 1}. ${c.title || `图${i + 1}`} — ${(c.prompt || '').substring(0, 60)}...`
        ).join('\n');

        const previewNote = previewUrl
          ? `\n\n🖼️ 首图预览已生成：\n![预览](${previewUrl})\n\n风格已确认？前往「AI 创作 → 9宫格」页面一键生成剩余 8 张。`
          : `\n\n⚠️ 首图预览生成失败，可前往「AI 创作 → 9宫格」页面手动逐张生成。`;

        return {
          success: true,
          output: `已生成九宫格方案「${topic}」(${sceneLabels[scene] || scene})：\n\n${plan}${previewNote}`,
          data: { cells, topic, scene, previewUrl },
        };
      }

      return { success: false, output: '九宫格方案解析失败，请重试。' };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `九宫格生成失败: ${e instanceof Error ? e.message : String(e)}。可前往「AI 创作 → 9宫格」页面手动生成。`,
      };
    }
  },
};
