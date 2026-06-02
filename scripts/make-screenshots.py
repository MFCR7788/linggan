#!/usr/bin/env python3
"""
灵集 App Store 截图生成脚本
从设计稿 assets/design/lingji-ui-design-v1.png 裁出 4 张手机截图，叠加标题文字，输出 iPhone 6.7" 尺寸（1290×2796）。

设计稿结构（实际验证过）：
  - 设计稿 2600×1200 横向
  - 4 张手机从左到右顺序：第 4 张(AI创作) → 第 2 张(随手收集) → 第 3 张(灵感详情) → 第 1 张(首页)
  - 第 1 张和第 2 张手机之间穿插了"主功能图标区"（也是首页"快捷入口"区域）

用法：
    python3 scripts/make-screenshots.py

输出：
    build/screenshots/screenshot-1-home.png        # 首页 - 随手记录灵感
    build/screenshots/screenshot-2-detail.png       # 灵感详情 - AI 自动总结
    build/screenshots/screenshot-3-create.png       # AI 创作 - AI 文案生成
    build/screenshots/screenshot-4-collect.png      # 随手收集 - 多元输入方式

如截图不对，编辑下方 PHONES 列表的 bbox 后重跑。
需要 Pillow：pip3 install Pillow
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

# ─── 配置 ──────────────────────────────────────────────────────

DESIGN_PATH = 'assets/design/lingji-ui-design-v1.png'
OUTPUT_DIR = 'build/screenshots'

# App Store iPhone 6.7" 截图尺寸（iPhone 15 Pro Max）
OUT_W, OUT_H = 1290, 2796

# 4 张手机在设计稿中的位置（基于实际验证）
# 设计稿里的顺序是倒序：4、2、3、1（从左到右）
PHONES = [
    {
        'name': '1-home',
        'title': '随手记录灵感',
        'subtitle': '文字·图片·链接·视频·语音 一切尽在掌握',
        'bbox': (1950, 130, 2600, 1130),  # 第 1 张手机 - 完整
    },
    {
        'name': '2-detail',
        'title': 'AI 自动总结',
        'subtitle': '一键提取关键要点和核心摘要',
        'bbox': (1450, 130, 1900, 1130),  # 第 3 张手机 - 完整（向右收紧避免切到第 2 张）
    },
    {
        'name': '3-create',
        'title': 'AI 文案生成',
        'subtitle': '小红书·公众号·短视频 一键搞定',
        'bbox': (0, 130, 650, 1130),  # 第 4 张手机 - 完整
    },
    {
        'name': '4-collect',
        'title': '多元输入方式',
        'subtitle': '5 种快捷入口，灵感不再流失',
        'bbox': (870, 130, 1290, 1130),  # 第 2 张手机 - 完整
    },
]

# 品牌色（来自应用主题）
BRAND_BG_TOP = (0x0A, 0x16, 0x29)      # #0A1629
BRAND_BG_BOTTOM = (0x1A, 0x36, 0x5D)   # #1A365D
TEXT_PRIMARY = '#FFFFFF'
TEXT_SECONDARY = '#9CA3AF'
ACCENT = (0x3B, 0x82, 0xF6)            # #3B82F6

# 字体路径（macOS 系统字体）
FONT_PATHS = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/Library/Fonts/Songti.ttc',
]


# ─── 工具函数 ──────────────────────────────────────────────────

def find_chinese_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_PATHS:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    print('⚠️  未找到中文字体')
    return ImageFont.load_default()


def make_gradient_bg(width: int, height: int) -> Image.Image:
    img = Image.new('RGB', (width, height), BRAND_BG_TOP)
    draw = ImageDraw.Draw(img)
    for y in range(height):
        ratio = y / height
        r = int(BRAND_BG_TOP[0] + (BRAND_BG_BOTTOM[0] - BRAND_BG_TOP[0]) * ratio)
        g = int(BRAND_BG_TOP[1] + (BRAND_BG_BOTTOM[1] - BRAND_BG_TOP[1]) * ratio)
        b = int(BRAND_BG_TOP[2] + (BRAND_BG_BOTTOM[2] - BRAND_BG_TOP[2]) * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    return img


def measure_text(draw: ImageDraw.ImageDraw, text: str, font) -> tuple:
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        return bbox[2] - bbox[0], bbox[3] - bbox[1]
    except AttributeError:
        return font.getsize(text)


# ─── 主流程 ──────────────────────────────────────────────────

def main():
    if not os.path.exists(DESIGN_PATH):
        print(f'❌ 找不到设计稿：{DESIGN_PATH}')
        sys.exit(1)

    design = Image.open(DESIGN_PATH).convert('RGB')
    print(f'✓ 加载设计稿：{design.size[0]}×{design.size[1]}')

    title_font = find_chinese_font(108)
    subtitle_font = find_chinese_font(54)
    brand_font = find_chinese_font(42)
    small_font = find_chinese_font(36)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for idx, phone in enumerate(PHONES, start=1):
        bbox = phone['bbox']
        phone_img = design.crop(bbox)
        pw, ph = phone_img.size
        print(f'  → 截图 {idx}：{phone["name"]} 抠图 {pw}×{ph}')

        # 等比缩放手机截图到目标宽度
        scale = OUT_W / pw
        new_h = int(ph * scale)
        # 限制最大高度，留出顶部 600px 标题区 + 底部 200px 品牌区
        max_h = OUT_H - 800
        if new_h > max_h:
            new_h = max_h
            # 按高度等比缩放
            new_w = int(pw * (new_h / ph))
            phone_img = phone_img.resize((new_w, new_h), Image.LANCZOS)
            # 居中放置（左右留白用渐变填充）
            paste_x = (OUT_W - new_w) // 2
        else:
            phone_img = phone_img.resize((OUT_W, new_h), Image.LANCZOS)
            paste_x = 0

        # 创建画布
        canvas = make_gradient_bg(OUT_W, OUT_H)

        # 手机截图垂直居中偏下
        paste_y = 600 + (max_h - new_h) // 2
        if paste_y + new_h > OUT_H - 200:
            paste_y = OUT_H - new_h - 200
        canvas.paste(phone_img, (paste_x, paste_y))

        # 顶部品牌条
        draw = ImageDraw.Draw(canvas)
        draw.text((80, 90), '灵 集', font=brand_font, fill=TEXT_PRIMARY)
        tw, _ = measure_text(draw, 'AI 创作助手', small_font)
        draw.text((OUT_W - tw - 80, 105), 'AI 创作助手', font=small_font, fill=TEXT_SECONDARY)

        # 主标题
        title_text = phone['title']
        tw, th = measure_text(draw, title_text, title_font)
        title_y = 280
        draw.text(
            ((OUT_W - tw) // 2, title_y),
            title_text,
            font=title_font,
            fill=TEXT_PRIMARY,
        )

        # 装饰条
        draw.rectangle(
            [(OUT_W - 200) // 2, title_y + th + 30, (OUT_W + 200) // 2, title_y + th + 38],
            fill=ACCENT
        )

        # 副标题
        sub_text = phone['subtitle']
        tw, th = measure_text(draw, sub_text, subtitle_font)
        draw.text(
            ((OUT_W - tw) // 2, title_y + 130),
            sub_text,
            font=subtitle_font,
            fill=TEXT_SECONDARY,
        )

        # 底部品牌水印
        watermark = '灵集 · 让灵感不再流失'
        tw, _ = measure_text(draw, watermark, small_font)
        draw.text(
            ((OUT_W - tw) // 2, OUT_H - 120),
            watermark,
            font=small_font,
            fill=TEXT_SECONDARY,
        )

        # 保存
        out_path = os.path.join(OUTPUT_DIR, f'screenshot-{phone["name"]}.png')
        canvas.save(out_path, 'PNG', optimize=True)
        print(f'  ✓ 已保存 {out_path}')

    print(f'\n🎉 全部完成！共 {len(PHONES)} 张截图')
    print(f'\n下一步：')
    print(f'  1. 用 Preview 打开 {OUTPUT_DIR}/ 下的 4 张图检查')
    print(f'  2. 如某张手机位置不对，编辑本脚本 PHONES 的 bbox 后重跑')
    print(f'  3. 在 Xcode 模拟器跑 App 截 1 张"AI 数字人/AI 视频"页（1290×2796）')
    print(f'  4. 把 5 张图上传到 App Store Connect')


if __name__ == '__main__':
    main()
