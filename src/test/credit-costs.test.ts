import { describe, it, expect } from 'vitest';
import {
  CREDIT_COSTS,
  calcAiVideoCost,
  calcAiTtsCost,
  calcDigitalHumanCost,
  calcAdsCost,
} from '@/lib/credit-costs';

describe('CREDIT_COSTS', () => {
  it('所有功能类别都有扣点配置', () => {
    const categories = [
      'ai_copywriting', 'ai_image', 'ai_digital_human', 'ai_video',
      'ai_tts', 'ai_ads', 'ai_extract', 'voice_clone', 'digital_twin',
    ];
    for (const cat of categories) {
      expect(CREDIT_COSTS).toHaveProperty(cat);
    }
  });

  it('扣点配置值都为正数', () => {
    const check = (obj: unknown, path = ''): void => {
      if (typeof obj === 'number') {
        expect(obj, `${path} 应为正数`).toBeGreaterThan(0);
      } else if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          check(v, path ? `${path}.${k}` : k);
        }
      }
    };
    check(CREDIT_COSTS);
  });
});

describe('calcAiVideoCost', () => {
  it('5 秒 fast = 8 credits (ceil(5×1.5)=8)', () => {
    expect(calcAiVideoCost(5, 'fast')).toBe(8);
  });

  it('5 秒 standard = 25 credits (ceil(5×5)=25)', () => {
    expect(calcAiVideoCost(5, 'standard')).toBe(25);
  });

  it('5 秒 premium = 100 credits (ceil(5×20)=100)', () => {
    expect(calcAiVideoCost(5, 'premium')).toBe(100);
  });

  it('最短视频也至少 1 credit', () => {
    expect(calcAiVideoCost(0.1, 'fast')).toBe(1);
  });

  it('1 秒 fast = ceil(1.5) = 2', () => {
    expect(calcAiVideoCost(1, 'fast')).toBe(2);
  });

  it('10 秒 standard = 50', () => {
    expect(calcAiVideoCost(10, 'standard')).toBe(50);
  });
});

describe('calcAiTtsCost', () => {
  it('100 字 = 1 credit', () => {
    expect(calcAiTtsCost(100)).toBe(1);
  });

  it('50 字 = 1 credit（最低）', () => {
    expect(calcAiTtsCost(50)).toBe(1);
  });

  it('250 字 = 3 credits (ceil(250/100)=3)', () => {
    expect(calcAiTtsCost(250)).toBe(3);
  });

  it('0 字 = 1 credit（最低）', () => {
    expect(calcAiTtsCost(0)).toBe(1);
  });

  it('1000 字 = 10 credits', () => {
    expect(calcAiTtsCost(1000)).toBe(10);
  });
});

describe('calcDigitalHumanCost', () => {
  it('480P = 10 credits', () => {
    expect(calcDigitalHumanCost('480P')).toBe(10);
  });

  it('720P = 20 credits', () => {
    expect(calcDigitalHumanCost('720P')).toBe(20);
  });

  it('默认（无参数）= 720P = 20', () => {
    expect(calcDigitalHumanCost()).toBe(20);
  });
});

describe('calcAdsCost', () => {
  it('9 宫格全部成功 = 18 credits', () => {
    expect(calcAdsCost(9)).toBe(18);
  });

  it('5 宫格 = 10 credits', () => {
    expect(calcAdsCost(5)).toBe(10);
  });

  it('0 宫格 = 0 credits', () => {
    expect(calcAdsCost(0)).toBe(0);
  });
});
