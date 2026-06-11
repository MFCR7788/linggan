import type { ToolDefinition, EditPlan, EditOperation } from '../../types';
import { callDeepSeek } from '@/lib/ai-services';

export const generateEditPlanTool: ToolDefinition = {
  name: 'generate_edit_plan',
  description: `根据用户需求生成视频剪辑方案（纯本地执行，不消耗灵力）。用户可以用自然语言描述想怎么剪，比如"把前3秒删掉"、"把A和B拼起来"、"加上这段BGM"、"输出1080P竖版"等。工具会输出结构化的剪辑方案，由前端在用户浏览器中通过 ffmpeg.wasm 本地执行。支持：裁剪(trim)、拼接(merge)、转码(transcode)、BGM叠加(audio_overlay)、配音替换(audio_replace)、变速(speed)、字幕叠加(subtitle)。`,
  parameters: {
    type: 'object',
    properties: {
      request: { type: 'string', description: '用户的剪辑需求描述' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: '用户可用的视频/音频文件名列表（从对话中收集）',
      },
      platform: {
        type: 'string',
        description: '目标平台: 抖音(1080x1920 9:16)、B站(1920x1080 16:9)、小红书(1080x1440 3:4)、微信(1080x1080 1:1)',
      },
    },
    required: ['request'],
  },
  async handler(params, _ctx) {
    const request = params.request as string;
    const files = (params.files as string[]) || [];
    const platform = (params.platform as string) || '';

    const platformSpecs: Record<string, { width: number; height: number; label: string }> = {
      '抖音': { width: 1080, height: 1920, label: '抖音竖版 9:16' },
      'B站': { width: 1920, height: 1080, label: 'B站横版 16:9' },
      '小红书': { width: 1080, height: 1440, label: '小红书竖版 3:4' },
      '微信': { width: 1080, height: 1080, label: '微信方形 1:1' },
    };

    const spec = platformSpecs[platform];

    const prompt = `你是一个视频剪辑专家。根据用户的需求，生成一个结构化的剪辑方案 JSON。

用户需求: ${request}
${files.length > 0 ? `可用文件: ${files.join(', ')}` : ''}
${spec ? `目标平台: ${platform} (${spec.width}x${spec.height})` : ''}

输出一个 JSON 对象，格式如下（只输出 JSON，不要任何其他文字）：
{
  "goal": "方案目标的一句话描述",
  "inputs": [{ "name": "文件名", "description": "简短描述" }],
  "operations": [
    { "type": "trim", "source": "文件名", "start": 0, "end": 3, "label": "去掉开头3秒" }
    // ... 更多操作
  ],
  "output": {
    "format": "mp4",
    "label": "最终输出描述",
    "estimatedSeconds": 30
  }
}

操作类型说明：
- trim: 裁剪 { type: "trim", source: "文件名", start: 起始秒, end: 结束秒, label: "说明" }
- transcode: 转码/改分辨率 { type: "transcode", source: "文件名", width: 宽, height: 高, fps: 帧率(可选), label: "说明" }
- merge: 拼接 { type: "merge", sources: ["文件1","文件2"], label: "说明" }
- audio_overlay: 叠加BGM(保留原声) { type: "audio_overlay", source: "视频文件", audioUrl: "音频URL/文件", volume: 0.3(0-1), mix: true, label: "说明" }
- audio_replace: 替换音频 { type: "audio_replace", source: "视频文件", audioUrl: "新音频URL/文件", label: "说明" }
- speed: 变速 { type: "speed", source: "文件名", rate: 1.5(倍速), label: "说明" }
- subtitle: 字幕 { type: "subtitle", source: "文件名", subtitles: [{ text: "字幕文字", start: 起始秒, end: 结束秒 }], label: "说明" }

规则：
1. 操作按执行顺序排列，上一个操作的输出可以作为下一个操作的 source
2. 如果第一个操作是 trim，source 用用户提供的文件名
3. trim 之后的操作 source 填 "trimmed"
4. merge 的 sources 数组列出要拼接的文件或前置操作的结果
5. 合并同类操作（多次 trim 合并为一次如果可能）
6. start/end 单位是秒，如果用户说了具体时间点就精确填，否则合理估算
7. output.format 默认 "mp4"
8. ${spec ? `如果有 transcode 操作，width/height 设为 ${spec.width}x${spec.height}` : 'transcode 操作按用户描述设置分辨率'}

只输出 JSON，不要任何解释文字。`;

    try {
      const result = await callDeepSeek(prompt, { temperature: 0.3, maxTokens: 1500 });

      // 解析 JSON
      let plan: EditPlan;
      try {
        // 尝试直接解析
        const cleaned = result
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .trim();
        plan = JSON.parse(cleaned) as EditPlan;
      } catch {
        // 尝试提取 JSON 块
        const match = result.match(/\{[\s\S]*\}/);
        if (!match) {
          return {
            success: false,
            output: '',
            error: '无法解析剪辑方案 JSON',
          };
        }
        plan = JSON.parse(match[0]) as EditPlan;
      }

      // 验证必要字段
      if (!plan.goal || !Array.isArray(plan.operations)) {
        return {
          success: false,
          output: '',
          error: '剪辑方案格式不完整',
        };
      }

      const opLabels = plan.operations.map((op, i) =>
        `  ${i + 1}. ${op.label || `${op.type}: ${formatOp(op)}`}`
      ).join('\n');

      return {
        success: true,
        output: `剪辑方案已生成: ${plan.goal}\n\n操作步骤:\n${opLabels}\n\n输出: ${plan.output.label} (${plan.output.format}, 约${plan.output.estimatedSeconds}秒)\n\n该方案将在本地浏览器中执行，不消耗灵力。`,
        data: { editPlan: plan, platform: platform || undefined },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `剪辑方案生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

function formatOp(op: EditOperation): string {
  switch (op.type) {
    case 'trim': return `裁剪 ${op.start}s-${op.end}s`;
    case 'transcode': return `转码 ${op.width}x${op.height}${op.fps ? ` ${op.fps}fps` : ''}`;
    case 'merge': return `拼接 ${op.sources.length} 段`;
    case 'audio_overlay': return `叠加BGM (音量${Math.round((op.volume || 0.3) * 100)}%)`;
    case 'audio_replace': return '替换音频';
    case 'speed': return `${op.rate}x 变速`;
    case 'subtitle': return `添加 ${op.subtitles.length} 条字幕`;
  }
}
