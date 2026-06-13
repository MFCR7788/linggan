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
import { composeVideoTool } from './compose-video';
import { extractContentTool } from './extract-content';
import { generateAgnesVideoTool } from './generate-agnes-video';
import { videoFaceSwapTool } from './video-face-swap';
import { generateHyperFramesTool } from './generate-hyperframes';
import { suggestContentIdeasTool } from './suggest-content-ideas';
import { generateProductVideoTool } from './generate-product-video';

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
    // 视频合成（图片+BGM+字幕）
    composeVideoTool,
    // 多平台内容提取（抖音/小红书/B站/头条/腾讯新闻 等）
    extractContentTool,
    // 换人复刻：照片+文案 → Agnes 口播视频（原生口型同步+配音）
    generateAgnesVideoTool,
    // 视频换人：原视频场景不变，仅替换出镜人物（wan2.2-animate-mix）
    videoFaceSwapTool,
    // 动态图形：脚本 → HTML+GSAP 动画 → 竖屏视频
    generateHyperFramesTool,
    // 今日创作提案：热点+账号类型+偏好 → 选题建议
    suggestContentIdeasTool,
    // 一张图出片：产品图 → 识图→文案→场景图→合成→入库
    generateProductVideoTool,
  ]);
}

export { webSearchTool, generateImageTool, generateVideoTool, getWeatherTool, analyzeImageTool };
export { readDocumentTool, searchMemoryTool, searchKnowledgeTool, searchInspirationsTool };
export { getHotspotTool, summarizeTool, synthesizeSpeechTool };
export { generateCopywritingTool, extractScheduleTool, analyzeLinkTool, saveToInspirationTool };
export { generateDigitalHumanTool, editImageTool, generateGridImagesTool, publishContentTool, generateAvatarVideoTool, generateAnimateVideoTool, generateEditPlanTool, generateVideoTemplateTool };
export { searchInternetTool, douyinTranscriptTool, douyinSearchTool, composeVideoTool, extractContentTool, generateAgnesVideoTool, videoFaceSwapTool, generateHyperFramesTool, suggestContentIdeasTool, generateProductVideoTool };
