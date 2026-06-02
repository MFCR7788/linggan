#!/usr/bin/env python3
"""
预览脚本：从设计稿抠出 4 张手机区域（不带文字），方便用户确认 bbox 是否正确。

用法：
    python3 scripts/preview-phones.py

输出：
    build/screenshots/preview-1.png
    build/screenshots/preview-2.png
    build/screenshots/preview-3.png
    build/screenshots/preview-4.png
"""

import os
from PIL import Image

DESIGN_PATH = 'assets/design/lingji-ui-design-v1.png'
OUTPUT_DIR = 'build/screenshots/preview'

# 4 张手机 bbox（基于自动检测 + 视觉估算）
# 如果你打开 design 文件看了实际位置，可以直接改这里
BBOXES = [
    (200, 130, 580, 1130),
    (610, 130, 990, 1130),
    (1020, 130, 1400, 1130),
    (1430, 130, 1810, 1130),
]


def main():
    design = Image.open(DESIGN_PATH).convert('RGB')
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for i, bbox in enumerate(BBOXES, start=1):
        cropped = design.crop(bbox)
        out = os.path.join(OUTPUT_DIR, f'preview-{i}.png')
        cropped.save(out)
        w, h = cropped.size
        print(f'预览 {i}: bbox={bbox} → {w}×{h} → {out}')
    print(f'\n请打开 {OUTPUT_DIR}/ 下的 4 张图确认是否正确。')
    print('如不正确，编辑本脚本的 BBOXES 列表后重跑。')


if __name__ == '__main__':
    main()
