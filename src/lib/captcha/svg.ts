// 滑块验证码 - SVG 生成工具
// 纯函数, 不依赖外部库; 服务端调用

export interface SliderPuzzle {
  width: number;
  height: number;
  puzzleSize: number;
  puzzleX: number;
  puzzleY: number;
  bgSvg: string;       // 底图 SVG (含缺口)
  puzzleSvg: string;   // 拼图块 SVG
}

// 拼图形状 - 经典 P 字形, 50x50
// 凸起: 顶部右侧, 圆弧
// 凹陷: 底部左侧, 圆弧
const PUZZLE_PATH =
  "M 0 0 " +
  "H 30 " +
  "A 10 10 0 0 1 30 20 " +
  "H 50 " +
  "V 50 " +
  "H 20 " +
  "A 10 10 0 0 0 20 30 " +
  "H 0 " +
  "Z";

function hslColor(h: number, s: number, l: number, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

function genBackground(width: number, height: number, seed: number): string {
  // 随机渐变 + 装饰
  const hue1 = (seed * 137) % 360;
  const hue2 = (hue1 + 80 + (seed * 47) % 60) % 360;
  const sat = 60 + (seed % 30);
  const lite1 = 30 + (seed % 15);
  const lite2 = 50 + ((seed * 13) % 20);

  // 装饰圆位置 (用确定性伪随机)
  const dots: string[] = [];
  for (let i = 0; i < 8; i++) {
    const cx = ((seed * 53 + i * 97) % width);
    const cy = ((seed * 79 + i * 131) % height);
    const r = 8 + (i * 7) % 18;
    const dotHue = (hue1 + i * 23) % 360;
    dots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${hslColor(dotHue, sat, lite1 + 20, 0.4)}" />`);
  }

  // 装饰波浪线
  const waves: string[] = [];
  for (let i = 0; i < 3; i++) {
    const y = 40 + i * 60 + (seed * 11) % 20;
    const d = `M 0 ${y} Q ${width / 4} ${y - 20} ${width / 2} ${y} T ${width} ${y}`;
    waves.push(`<path d="${d}" stroke="${hslColor(hue2, sat, lite2, 0.5)}" stroke-width="2" fill="none" />`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg-${seed}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${hslColor(hue1, sat, lite1)}" />
        <stop offset="100%" stop-color="${hslColor(hue2, sat, lite2)}" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg-${seed})" />
    ${dots.join("")}
    ${waves.join("")}
  </svg>`;
}

function genPuzzlePiece(seed: number): string {
  // 拼图块填充: 用稍微亮一点, 让用户看清楚
  const hue = (seed * 173) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="50" height="50">
    <path d="${PUZZLE_PATH}" fill="${hslColor(hue, 70, 65, 0.95)}" stroke="${hslColor(hue, 80, 80)}" stroke-width="1.5" />
  </svg>`;
}

function genBackgroundWithHole(width: number, height: number, holeX: number, holeY: number, seed: number): string {
  // 在底图上挖一个拼图形状的洞 (白色半透明, 提示用户)
  const hue = (seed * 173) % 360;
  const holeFill = "rgba(255,255,255,0.85)";
  const holeStroke = hslColor(hue, 80, 50, 0.9);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
      <mask id="hole-${seed}">
        <rect width="${width}" height="${height}" fill="white" />
        <path d="${PUZZLE_PATH}" transform="translate(${holeX} ${holeY})" fill="black" />
      </mask>
      <linearGradient id="bg2-${seed}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${hslColor(seed * 137 % 360, 60 + seed % 30, 30 + seed % 15)}" />
        <stop offset="100%" stop-color="${hslColor((seed * 137 + 80) % 360, 60 + seed % 30, 50 + (seed * 13) % 20)}" />
      </linearGradient>
    </defs>
    <g mask="url(#hole-${seed})">
      <rect width="${width}" height="${height}" fill="url(#bg2-${seed})" />
      ${Array.from({ length: 8 }, (_, i) => {
        const cx = (seed * 53 + i * 97) % width;
        const cy = (seed * 79 + i * 131) % height;
        const r = 8 + (i * 7) % 18;
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${hslColor((seed * 137 + i * 23) % 360, 60, 50, 0.4)}" />`;
      }).join("")}
      ${Array.from({ length: 3 }, (_, i) => {
        const y = 40 + i * 60 + (seed * 11) % 20;
        const d = `M 0 ${y} Q ${width / 4} ${y - 20} ${width / 2} ${y} T ${width} ${y}`;
        return `<path d="${d}" stroke="${hslColor((seed * 137 + 80 + i * 23) % 360, 60, 60, 0.5)}" stroke-width="2" fill="none" />`;
      }).join("")}
    </g>
    <!-- 缺口描边 -->
    <path d="${PUZZLE_PATH}" transform="translate(${holeX} ${holeY})" fill="none" stroke="${holeStroke}" stroke-width="2" />
  </svg>`;
}

export function generatePuzzle(seed: number): SliderPuzzle {
  const width = 400;
  const height = 200;
  const puzzleSize = 50;
  // 缺口位置: 距离左右两边各留 60px (避免太边缘)
  const puzzleX = 60 + (seed * 17) % (width - puzzleSize - 120);
  const puzzleY = 20 + (seed * 23) % (height - puzzleSize - 40);

  return {
    width,
    height,
    puzzleSize,
    puzzleX,
    puzzleY,
    bgSvg: genBackgroundWithHole(width, height, puzzleX, puzzleY, seed),
    puzzleSvg: genPuzzlePiece(seed),
  };
}

export function svgToDataUrl(svg: string): string {
  // 标准化空白
  const compact = svg.replace(/\s+/g, " ").trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(compact)}`;
}
