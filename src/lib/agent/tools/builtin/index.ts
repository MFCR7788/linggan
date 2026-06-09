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

export function registerAllBuiltinTools(registry: ToolRegistry): void {
  registry.registerAll([
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
  ]);
}

export { webSearchTool, generateImageTool, generateVideoTool, getWeatherTool, analyzeImageTool };
export { readDocumentTool, searchMemoryTool, searchKnowledgeTool, searchInspirationsTool };
export { getHotspotTool, summarizeTool, synthesizeSpeechTool };
