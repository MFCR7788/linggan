// BGM 引擎 — 背景音乐管理 + 智能推荐

import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';
import { BGM_STYLES } from './types';
import type { BGMStyle } from './types';
export type { BGMStyle } from './types';

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
