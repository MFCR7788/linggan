// 功能分期开关 — 控制各版本功能的上线/隐藏
// 升级版本时只需修改 CURRENT_VERSION，所有入口自动生效

export type FeatureVersion = 'v1.0' | 'v1.1' | 'v2.0' | 'v2.1';

/** 当前上线版本 */
export const CURRENT_VERSION: FeatureVersion = 'v1.0';

const VERSION_ORDER: FeatureVersion[] = ['v1.0', 'v1.1', 'v2.0', 'v2.1'];

/** 功能是否在当前版本已上线 */
export function isFeatureEnabled(minVersion: FeatureVersion): boolean {
  return VERSION_ORDER.indexOf(CURRENT_VERSION) >= VERSION_ORDER.indexOf(minVersion);
}

// ── Agent Tool → 最低版本映射 ──

export const TOOL_MIN_VERSION: Record<string, FeatureVersion> = {
  // V1.0 — 基础创作
  web_search: 'v1.0',
  generate_image: 'v1.0',
  generate_video: 'v1.0',
  get_weather: 'v1.0',
  analyze_image: 'v1.0',
  read_document: 'v1.0',
  search_memory: 'v1.0',
  search_knowledge: 'v1.0',
  search_inspirations: 'v1.0',
  get_hotspot: 'v1.0',
  summarize: 'v1.0',
  synthesize_speech: 'v1.0',
  generate_copywriting: 'v1.0',
  extract_schedule: 'v1.0',
  analyze_link: 'v1.0',
  save_to_inspiration: 'v1.0',
  search_internet: 'v1.0',
  douyin_transcript: 'v1.0',
  douyin_search: 'v1.0',
  compose_video: 'v1.0',
  extract_content: 'v1.0',
  suggest_content_ideas: 'v1.0',
  generate_video_template: 'v1.0',

  // V1.1 — 增强创作 + 分发
  generate_digital_human: 'v1.1',
  edit_image: 'v1.1',
  generate_grid_images: 'v1.1',
  publish_content: 'v1.1',
  generate_avatar_video: 'v1.1',
  generate_animate_video: 'v1.1',
  title_optimizer: 'v1.1',

  // V2.0 — 智能视频编辑
  generate_edit_plan: 'v2.0',
  smart_clip: 'v2.0',
  smart_slice: 'v2.0',
  cover_generator: 'v2.0',
  auto_mashup: 'v2.0',

  // V2.1 — 高级 AI
  generate_agnes_video: 'v2.1',
  video_face_swap: 'v2.1',
  generate_hyperframes: 'v2.1',
  generate_product_video: 'v2.1',
};

// ── AI 创作中心工具 → 最低版本映射 ──

export const AI_TOOL_MIN_VERSION: Record<string, FeatureVersion> = {
  'ai-copywriting': 'v1.0',
  'ai-image': 'v1.0',
  'ai-video': 'v1.0',
  'ai-tts': 'v1.0',
  'ai-digital-human': 'v1.1',
  'ai-ads': 'v1.1',
  'ai-smart-clip': 'v2.0',
  'ai-mashup': 'v2.0',
  'ai-cover-generator': 'v2.0',
  'ai-title-optimizer': 'v1.1',
  'ai-video-mix': 'v2.0',
  'ai-image-editor': 'v1.1',
  hotspot: 'v1.0',
  publish: 'v1.1',
  insights: 'v1.1',
};

/** 获取未上线功能的提示文案 */
export function getComingSoonMessage(toolName: string): string {
  const version = TOOL_MIN_VERSION[toolName] || 'v1.1';
  const versionLabel: Record<FeatureVersion, string> = {
    'v1.0': 'V1.0',
    'v1.1': 'V1.1',
    'v2.0': 'V2.0',
    'v2.1': 'V2.1',
  };
  return `"${toolName}" 功能将在 ${versionLabel[version]} 上线，敬请期待！`;
}
