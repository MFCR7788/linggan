import { ToolRegistry } from '../registry';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { webSearchTool } from './web-search';
import { generateImageTool } from './generate-image';
import { generateVideoTool } from './generate-video';
import { getWeatherTool } from './get-weather';
import { analyzeImageTool } from './analyze-image';
import { readDocumentTool } from './read-document';
import { searchMemoryTool } from './search-memory';
import { searchKnowledgeTool } from './search-knowledge';
import { searchInspirationsTool } from './search-inspirations';
import { getHotspotTool } from './get-hotspot';
import { summarizeTool } from './summarize';
import { synthesizeSpeechTool } from './synthesize-speech';
import { generateCopywritingTool } from './copywriting';
import { extractScheduleTool } from './extract-schedule';
import { searchScheduleTool } from './search-schedule';
import { createScheduleTool } from './create-schedule';
import { analyzeLinkTool } from './analyze-link';
import { saveToInspirationTool } from './save-inspiration';
import { generateDigitalHumanTool } from './digital-human';
import { editImageTool } from './edit-image';
import { generateGridImagesTool } from './grid-images';
import { publishContentTool } from './publish';
import { generateAvatarVideoTool } from './avatar-video';
import { generateAnimateVideoTool } from './animate';
import { generateEditPlanTool } from './generate-edit-plan';
import { generateVideoTemplateTool } from './generate-video-template';
import { searchInternetTool } from './search-internet';
import { douyinTranscriptTool } from './douyin-transcript';
import { douyinSearchTool } from './douyin-search';
import { composeVideoTool } from './compose-video';
import { extractContentTool } from './extract-content';
import { generateAgnesVideoTool } from './generate-agnes-video';
import { videoFaceSwapTool } from './video-face-swap';
import { generateHyperFramesTool } from './generate-hyperframes';
import { suggestContentIdeasTool } from './suggest-content-ideas';
import { generateProductVideoTool } from './generate-product-video';
import { smartClipTool } from './smart-clip';
import { smartSliceTool } from './smart-slice';
import { titleOptimizerTool } from './title-optimizer';
import { coverGeneratorTool } from './cover-generator';
import { autoMashupTool } from './auto-mashup';
import { optimizePromptTool } from './optimize-prompt';
import type { ToolDefinition } from '../../types';

// ── 所有工具（按版本分组） ──

/** V1.0 基础创作工具 */
const V1_0_TOOLS: ToolDefinition[] = [
  webSearchTool,
  generateImageTool,
  generateVideoTool,
  getWeatherTool,
  analyzeImageTool,
  readDocumentTool,
  searchMemoryTool,
  searchKnowledgeTool,
  searchInspirationsTool,
  getHotspotTool,
  summarizeTool,
  synthesizeSpeechTool,
  generateCopywritingTool,
  extractScheduleTool,
  searchScheduleTool,
  createScheduleTool,
  analyzeLinkTool,
  saveToInspirationTool,
  searchInternetTool,
  douyinTranscriptTool,
  douyinSearchTool,
  composeVideoTool,
  extractContentTool,
  suggestContentIdeasTool,
  generateVideoTemplateTool,
  optimizePromptTool,
];

/** V1.1 增强创作 + 分发工具 */
const V1_1_TOOLS: ToolDefinition[] = [
  generateDigitalHumanTool,
  editImageTool,
  generateGridImagesTool,
  publishContentTool,
  generateAvatarVideoTool,
  generateAnimateVideoTool,
  titleOptimizerTool,
];

/** V2.0 智能视频编辑工具 */
const V2_0_TOOLS: ToolDefinition[] = [
  generateEditPlanTool,
  smartClipTool,
  smartSliceTool,
  coverGeneratorTool,
  autoMashupTool,
];

/** V2.1 高级 AI 工具 */
const V2_1_TOOLS: ToolDefinition[] = [
  generateAgnesVideoTool,
  videoFaceSwapTool,
  generateHyperFramesTool,
  generateProductVideoTool,
];

const ALL_TOOLS: ToolDefinition[] = [
  ...V1_0_TOOLS,
  ...V1_1_TOOLS,
  ...V2_0_TOOLS,
  ...V2_1_TOOLS,
];

// ── 注册函数 ──

export function registerAllBuiltinTools(registry: ToolRegistry): void {
  // 注册全部工具定义给 LLM 感知（description 不变）
  // 但非 V1.0 工具的 handler 替换为"即将上线"提示
  const enabledTools = ALL_TOOLS.map((tool) => {
    if (isFeatureEnabled('v1.0') && V1_0_TOOLS.includes(tool)) return tool;
    if (isFeatureEnabled('v1.1') && V1_1_TOOLS.includes(tool)) return tool;
    if (isFeatureEnabled('v2.0') && V2_0_TOOLS.includes(tool)) return tool;
    if (isFeatureEnabled('v2.1') && V2_1_TOOLS.includes(tool)) return tool;
    // 未上线工具：注册但 handler 返回提示
    return {
      ...tool,
      handler: async () => ({
        success: true,
        output: `"${tool.name}" 功能即将在后续版本上线，敬请期待！如需使用请告诉我您的具体需求。`,
      }),
    };
  });

  registry.registerAll(enabledTools);
}

export { webSearchTool, generateImageTool, generateVideoTool, getWeatherTool, analyzeImageTool };
export { readDocumentTool, searchMemoryTool, searchKnowledgeTool, searchInspirationsTool };
export { getHotspotTool, summarizeTool, synthesizeSpeechTool };
export { generateCopywritingTool, extractScheduleTool, searchScheduleTool, analyzeLinkTool, saveToInspirationTool };
export { generateDigitalHumanTool, editImageTool, generateGridImagesTool, publishContentTool, generateAvatarVideoTool, generateAnimateVideoTool, generateEditPlanTool, generateVideoTemplateTool };
export { searchInternetTool, douyinTranscriptTool, douyinSearchTool, composeVideoTool, extractContentTool, generateAgnesVideoTool, videoFaceSwapTool, generateHyperFramesTool, suggestContentIdeasTool, generateProductVideoTool, smartClipTool, smartSliceTool, titleOptimizerTool, coverGeneratorTool, autoMashupTool };
