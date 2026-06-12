import { ToolRegistry } from '../registry';
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

export function registerAllBuiltinTools(registry: ToolRegistry): void {
  registry.registerAll([
    // 原有 12 个工具
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
    // 新增 9 个工具
    generateCopywritingTool,
    extractScheduleTool,
    analyzeLinkTool,
    saveToInspirationTool,
    generateDigitalHumanTool,
    editImageTool,
    generateGridImagesTool,
    publishContentTool,
    generateAvatarVideoTool,
    generateAnimateVideoTool,
    generateEditPlanTool,
    generateVideoTemplateTool,
    // Agent Reach 多平台搜索
    searchInternetTool,
    // 抖音文案提取
    douyinTranscriptTool,
    // 抖音搜索
    douyinSearchTool,
  ]);
}

export { webSearchTool, generateImageTool, generateVideoTool, getWeatherTool, analyzeImageTool };
export { readDocumentTool, searchMemoryTool, searchKnowledgeTool, searchInspirationsTool };
export { getHotspotTool, summarizeTool, synthesizeSpeechTool };
export { generateCopywritingTool, extractScheduleTool, analyzeLinkTool, saveToInspirationTool };
export { generateDigitalHumanTool, editImageTool, generateGridImagesTool, publishContentTool, generateAvatarVideoTool, generateAnimateVideoTool, generateEditPlanTool, generateVideoTemplateTool };
export { searchInternetTool, douyinTranscriptTool, douyinSearchTool };
