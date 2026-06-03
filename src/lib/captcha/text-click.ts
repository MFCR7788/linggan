// 点击文字验证码 - SVG 生成
// 服务端生成一张带 6 个汉字的图, 返回 3 个目标字+位置 (位置用于服务端验证, 客户端只拿到提示字)

export interface CharBox {
  char: string;
  x: number;       // 字符中心 X
  y: number;       // 字符中心 Y
  rotate: number;  // 旋转角度
}

export interface ClickChallenge {
  width: number;
  height: number;
  bgImage: string;        // dataURL
  expected: string[];     // 用户按顺序需要点击的字 (3 个)
  positions: CharBox[];   // 全 6 个字 + 位置 (服务端验证用, 不发给客户端)
  hitRadius: number;      // 点击容差半径 (px)
}

// 笔画清晰、辨识度高的常用汉字 (单字, 避免相似)
const CHAR_POOL = [
  '春', '夏', '秋', '冬', '风', '雨', '雪', '月',
  '山', '水', '火', '木', '金', '土', '日', '云',
  '红', '蓝', '绿', '黄', '黑', '白', '紫', '青',
  '上', '下', '左', '右', '中', '大', '小', '多',
  '东', '西', '南', '北', '长', '短', '高', '低',
  '天', '地', '人', '心', '手', '足', '目', '口',
  '猫', '狗', '鱼', '鸟', '马', '牛', '羊', '虎',
  '花', '草', '树', '叶', '果', '种', '林', '森',
];

// 字符颜色池 (高对比度, 在浅色背景上可见)
const COLOR_POOL = [
  '#1F2937', '#7C2D12', '#581C87', '#1E3A8A',
  '#064E3B', '#7F1D1D', '#374151', '#312E81',
];

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextRand(seed: number, idx: number): number {
  const s = (seed * (idx + 1) * 9301 + 49297) % 233280;
  return s / 233280;
}

export function generateChallenge(seed: number): ClickChallenge {
  const width = 320;
  const height = 180;
  const charCount = 6;
  const targetCount = 3;
  const fontSize = 30;
  const padding = 28;          // 字符不能靠太边缘
  const minDist = 62;          // 字符之间最小距离, 防重叠
  const hitRadius = 32;        // 点击容差

  // 随机抽 6 个不同的汉字
  const chars = shuffle(CHAR_POOL, seed).slice(0, charCount);

  // 给 6 个字找不重叠的随机位置
  const positions: CharBox[] = [];
  for (let i = 0; i < charCount; i++) {
    let placed = false;
    for (let attempts = 0; attempts < 80; attempts++) {
      const r1 = nextRand(seed, i * 7 + attempts);
      const r2 = nextRand(seed, i * 11 + attempts + 1);
      const x = padding + r1 * (width - 2 * padding);
      const y = padding + r2 * (height - 2 * padding);
      const ok = positions.every(p => Math.hypot(p.x - x, p.y - y) >= minDist);
      if (ok) {
        const rot = (nextRand(seed, i * 13) - 0.5) * 30; // ±15°
        positions.push({ char: chars[i], x, y, rotate: rot });
        placed = true;
        break;
      }
    }
    // fallback: 网格位置
    if (!placed) {
      positions.push({
        char: chars[i],
        x: padding + (i % 3) * 100 + 40,
        y: padding + Math.floor(i / 3) * 70 + 30,
        rotate: 0,
      });
    }
  }

  // 从 6 个里挑 3 个作为目标 (按抽中顺序定义点击顺序)
  const targetIdx = shuffle([0, 1, 2, 3, 4, 5], seed * 31 + 1).slice(0, targetCount);
  const expected = targetIdx.map(i => positions[i].char);

  // 生成 SVG
  const bgHue = (seed * 17) % 360;
  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  lines.push(`<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">`);
  lines.push(`<stop offset="0%" stop-color="hsl(${bgHue}, 50%, 92%)"/>`);
  lines.push(`<stop offset="100%" stop-color="hsl(${(bgHue + 40) % 360}, 60%, 86%)"/>`);
  lines.push(`</linearGradient></defs>`);
  lines.push(`<rect width="${width}" height="${height}" fill="url(#bg)"/>`);

  // 干扰短线条
  for (let i = 0; i < 14; i++) {
    const r1 = nextRand(seed, i * 41);
    const r2 = nextRand(seed, i * 43);
    const r3 = nextRand(seed, i * 47);
    const r4 = nextRand(seed, i * 53);
    const x1 = r1 * width;
    const y1 = r2 * height;
    const x2 = x1 + (r3 - 0.5) * 60;
    const y2 = y1 + (r4 - 0.5) * 60;
    const hue = (bgHue + i * 30) % 360;
    lines.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="hsla(${hue}, 50%, 60%, 0.3)" stroke-width="1.5"/>`);
  }

  // 干扰小圆点
  for (let i = 0; i < 18; i++) {
    const r1 = nextRand(seed, i * 59);
    const r2 = nextRand(seed, i * 61);
    const r3 = nextRand(seed, i * 67);
    const cx = r1 * width;
    const cy = r2 * height;
    const rr = 1 + r3 * 3;
    const hue = (bgHue + i * 17) % 360;
    lines.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="hsla(${hue}, 60%, 50%, 0.35)"/>`);
  }

  // 6 个汉字 (位置已确定, 大小+颜色+旋转)
  positions.forEach((p, i) => {
    const color = COLOR_POOL[(seed + i) % COLOR_POOL.length];
    lines.push(
      `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" font-size="${fontSize}" font-family="'PingFang SC','Microsoft YaHei',sans-serif" font-weight="700" fill="${color}" text-anchor="middle" dominant-baseline="central" transform="rotate(${p.rotate.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)})">${p.char}</text>`
    );
  });

  lines.push(`</svg>`);
  const svg = lines.join('');

  return {
    width,
    height,
    bgImage: svgToDataUrl(svg),
    expected,
    positions,
    hitRadius,
  };
}

export function svgToDataUrl(svg: string): string {
  const compact = svg.replace(/\s+/g, ' ').trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(compact)}`;
}
