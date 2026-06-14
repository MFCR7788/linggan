// BGM 引擎 — 背景音乐管理 + 智能推荐

import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';

/** BGM 风格定义 */
export interface BGMStyle {
  /** 风格标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 适用场景 */
  suitableFor: string[];
  /** 默认音量 */
  defaultVolume: number;
  /** 是否支持闪避 */
  supportsDucking: boolean;
}

/** 所有 BGM 风格 */
export const BGM_STYLES: BGMStyle[] = [
  {
    id: 'tech', name: '科技感', description: '电子合成，适合科技/数码/产品展示',
    suitableFor: ['科技', '数码', '产品展示', '开箱'], defaultVolume: 0.25, supportsDucking: true,
  },
  {
    id: 'chill', name: '轻松休闲', description: '轻柔舒缓，适合Vlog/日常/旅行',
    suitableFor: ['Vlog', '日常', '旅行', '治愈'], defaultVolume: 0.3, supportsDucking: true,
  },
  {
    id: 'hype', name: '激情动感', description: '节奏强劲，适合运动/电竞/快节奏',
    suitableFor: ['运动', '电竞', '快节奏', '混剪'], defaultVolume: 0.2, supportsDucking: false,
  },
  {
    id: 'elegant', name: '优雅典雅', description: '古典/爵士，适合品牌/时尚/高端',
    suitableFor: ['品牌', '时尚', '高端', '婚礼'], defaultVolume: 0.22, supportsDucking: true,
  },
  {
    id: 'energetic', name: '活力阳光', description: '明快活泼，适合美食/种草/娱乐',
    suitableFor: ['美食', '种草', '娱乐', '探店'], defaultVolume: 0.25, supportsDucking: true,
  },
  {
    id: 'cinematic', name: '电影感', description: '史诗/管弦，适合大片/宣传片',
    suitableFor: ['宣传片', '品牌故事', '旅行大片'], defaultVolume: 0.28, supportsDucking: true,
  },
  {
    id: 'lofi', name: 'Lo-Fi 放松', description: 'Lo-Fi Hip Hop，适合学习/阅读/知识',
    suitableFor: ['学习', '阅读', '知识', '播客'], defaultVolume: 0.25, supportsDucking: true,
  },
  {
    id: 'corporate', name: '商务专业', description: '干净利落，适合企业/B2B/财经',
    suitableFor: ['企业', 'B2B', '财经', '新闻'], defaultVolume: 0.2, supportsDucking: true,
  },
];

/** 获取 BGM 文件路径 */
export function getBGMPath(styleId: string, customPath?: string): string | null {
  if (customPath && existsSync(customPath)) {
    return customPath;
  }
  const path = join(process.cwd(), 'public', 'bgm', `${styleId}.mp3`);
  return existsSync(path) ? path : null;
}

/** 智能推荐 BGM（基于视频主题/关键词） */
export function recommendBGM(keywords: string[]): BGMStyle[] {
  const scores: Array<{ style: BGMStyle; score: number }> = [];

  for (const style of BGM_STYLES) {
    let score = 0;
    for (const kw of keywords) {
      for (const suitable of style.suitableFor) {
        if (kw.includes(suitable) || suitable.includes(kw)) {
          score += 2;
        }
      }
      if (style.name.includes(kw) || style.description.includes(kw)) {
        score += 1;
      }
    }
    if (score > 0) scores.push({ style, score });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 3).map(s => s.style);
}

/** 获取所有可用的 BGM 文件 */
export function getAvailableBGMFiles(): string[] {
  const bgmDir = join(process.cwd(), 'public', 'bgm');
  try {
    const { readdirSync } = require('fs');
    return readdirSync(bgmDir).filter((f: string) => f.endsWith('.mp3')).map((f: string) => f.replace('.mp3', ''));
  } catch {
    return [];
  }
}
