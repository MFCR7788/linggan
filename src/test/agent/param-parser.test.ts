import { describe, it, expect } from 'vitest';
import { parseParamCards, formatParamValues } from '@/lib/agent/param-parser';
import type { ParamCardSchema } from '@/lib/agent/param-parser';

const VIDEO_SCHEMA: ParamCardSchema = {
  title: '确认视频参数',
  description: '请确认以下参数后开始生成',
  fields: [
    {
      name: 'style',
      label: '视频风格',
      type: 'select',
      options: [
        { value: 'douyin_hot', label: '🔥 抖音爆款' },
        { value: 'product_show', label: '✨ 产品展示' },
      ],
    },
    {
      name: 'duration',
      label: '时长',
      type: 'slider',
      min: 5,
      max: 60,
      step: 5,
      default: 15,
      unit: '秒',
    },
    {
      name: 'subtitles',
      label: '添加字幕',
      type: 'toggle',
      default: true,
    },
  ],
};

function wrap(schema: ParamCardSchema): string {
  return `<param_card>\n${JSON.stringify(schema)}\n</param_card>`;
}

describe('parseParamCards', () => {
  it('解析单个 param_card 块', () => {
    const text = `好的，先确认一下参数：\n\n${wrap(VIDEO_SCHEMA)}\n\n请选择后继续。`;
    const result = parseParamCards(text);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].title).toBe('确认视频参数');
    expect(result.cards[0].fields).toHaveLength(3);
    expect(result.cards[0].fields[0].type).toBe('select');
    expect(result.cards[0].fields[1].type).toBe('slider');
    expect(result.cards[0].fields[2].type).toBe('toggle');
  });

  it('清理后文本移除 param_card 块', () => {
    const text = `前置文字\n${wrap(VIDEO_SCHEMA)}\n后置文字`;
    const result = parseParamCards(text);

    expect(result.cleanedText).toContain('前置文字');
    expect(result.cleanedText).toContain('后置文字');
    expect(result.cleanedText).not.toContain('<param_card>');
    expect(result.cleanedText).not.toContain('</param_card>');
  });

  it('无 param_card 时返回空数组', () => {
    const result = parseParamCards('这是一段普通文本，没有参数卡片');
    expect(result.cards).toHaveLength(0);
    expect(result.cleanedText).toBe('这是一段普通文本，没有参数卡片');
  });

  it('非法 JSON 跳过该块', () => {
    const text = '前置\n<param_card>{invalid json!!!}</param_card>\n后置';
    const result = parseParamCards(text);

    expect(result.cards).toHaveLength(0);
    expect(result.cleanedText).toBe('前置\n\n后置');
  });

  it('缺少 title 的 schema 被跳过', () => {
    const bad = { fields: [{ name: 'x', label: 'X', type: 'select' }] };
    const text = `<param_card>${JSON.stringify(bad)}</param_card>`;
    const result = parseParamCards(text);
    expect(result.cards).toHaveLength(0);
  });

  it('空 fields 的 schema 被跳过', () => {
    const bad = { title: '空', fields: [] };
    const text = `<param_card>${JSON.stringify(bad)}</param_card>`;
    const result = parseParamCards(text);
    expect(result.cards).toHaveLength(0);
  });

  it('多个 param_card 块全部解析', () => {
    const schema2: ParamCardSchema = {
      title: '第二个卡片',
      fields: [{ name: 'platform', label: '平台', type: 'select', options: [{ value: 'douyin', label: '抖音' }] }],
    };
    const text = `${wrap(VIDEO_SCHEMA)}\n中间文字\n${wrap(schema2)}`;
    const result = parseParamCards(text);

    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].title).toBe('确认视频参数');
    expect(result.cards[1].title).toBe('第二个卡片');
  });

  it('混合 param_card 和 choices 的文本 — 各自独立', () => {
    const text = `${wrap(VIDEO_SCHEMA)}\n<choices multi="false">选项A: 描述|选项B: 描述</choices>`;
    const result = parseParamCards(text);

    expect(result.cards).toHaveLength(1);
    // choices 不会被 param parser 处理（留给 choice-parser）
    expect(result.cleanedText).toContain('<choices');
  });
});

describe('formatParamValues', () => {
  it('将参数值格式化为列表文本', () => {
    const values = { style: 'douyin_hot', duration: 15, subtitles: true };
    const result = formatParamValues(VIDEO_SCHEMA, values);

    expect(result).toContain('视频风格：🔥 抖音爆款');
    expect(result).toContain('时长：15秒');
    expect(result).toContain('添加字幕：是');
  });

  it('toggle 为 false 时显示"否"', () => {
    const values = { subtitles: false };
    const result = formatParamValues(VIDEO_SCHEMA, values);

    expect(result).toContain('添加字幕：否');
  });

  it('跳过未填写的字段', () => {
    const values = { style: 'product_show' };
    const result = formatParamValues(VIDEO_SCHEMA, values);

    expect(result).toContain('视频风格：✨ 产品展示');
    expect(result).not.toContain('时长');
    expect(result).not.toContain('添加字幕');
  });

  it('select 值无匹配时显示原始值', () => {
    const values = { style: 'unknown_style' };
    const result = formatParamValues(VIDEO_SCHEMA, values);

    expect(result).toContain('视频风格：unknown_style');
  });
});
