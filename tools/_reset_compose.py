# -*- coding: utf-8 -*-
"""底板×图案分离方案：基准图后处理与合成对比
用法: python _reset_compose.py
"""
import os
from PIL import Image, ImageFilter, ImageDraw

BASE_DIR = 'F:/workspace/towerdefence/art/blocks_reset/base'
GLYPH_DIR = 'F:/workspace/towerdefence/art/blocks_reset/glyph'
OUT = 'F:/workspace/towerdefence/art/blocks_reset'
CUR = 'F:/workspace/towerdefence/assets/images/board'

TOL = 45


def keyout(path):
    """flood-fill 抠掉四角连通的假透明背景"""
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    px = im.load()

    def bg_seed(x, y):
        return True  # 四角全部视为背景种子

    from collections import deque
    seen = bytearray(w * h)
    q = deque()
    for x0, y0 in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        q.append((x0, y0))
    seeds = []
    for x in range(0, w, 7):
        seeds.append((x, 0)); seeds.append((x, h - 1))
    for y in range(0, h, 7):
        seeds.append((0, y)); seeds.append((w - 1, y))
    q.extend(seeds)
    r0, g0, b0, _ = px[q[0][0], q[0][1]]
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
            continue
        r, g, b, a = px[x, y]
        if abs(r - r0) + abs(g - g0) + abs(b - b0) > TOL * 3:
            continue
        seen[y * w + x] = 1
        px[x, y] = (r, g, b, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    # 清小岛
    alpha = im.split()[3]
    from PIL import ImageOps
    # 简化：按 alpha 连通域面积清理（复用 v2 管线思路）
    return im


def bbox_crop(im):
    a = im.split()[3]
    box = a.getbbox()
    return im.crop(box) if box else im


def to_base(im, size=128):
    """底板：等比缩放后铺到 size×size（玻璃砖应近满幅）"""
    im = bbox_crop(im)
    w, h = im.size
    s = size / max(w, h)
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    return canvas


def to_glyph(im, ratio=0.72, size=128):
    """图案：主符号缩放到占底板 ratio，居中"""
    im = bbox_crop(im)
    w, h = im.size
    target = size * ratio
    s = target / max(w, h)
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    return canvas


def main():
    base_png = os.path.join(BASE_DIR, '2D_match_3_game_tile__a_single_2026-10-29T16-15-10.png')
    glyph_png = os.path.join(GLYPH_DIR, 'a_single_game_icon_emblem_of_a_2026-10-29T16-14-13.png')

    base = to_base(keyout(base_png))
    glyph = to_glyph(keyout(glyph_png), ratio=0.72)
    base.save(os.path.join(OUT, 'base_fire.png'))
    glyph.save(os.path.join(OUT, 'glyph_flame.png'))

    composed = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    composed.alpha_composite(base)
    composed.alpha_composite(glyph)

    cur = Image.open(os.path.join(CUR, 'fire.png')).convert('RGBA')

    G, CELL = 20, 128
    W = G * 2 + CELL * 3 + 40
    H = G * 2 + CELL + 56 + 46
    sheet = Image.new('RGBA', (W, H), (23, 18, 31, 255))
    d = ImageDraw.Draw(sheet)
    d.text((G, 6), '左：原版整图   中：分离后合成（底板+图案72%）   右：底板 alone / 56px 实尺行', fill=(214, 205, 228, 255))
    sheet.alpha_composite(cur, (G, G + 18))
    sheet.alpha_composite(composed, (G + CELL + 10, G + 18))
    sheet.alpha_composite(base, (G + CELL * 2 + 20, G + 18))
    for i, im in enumerate((cur, composed, base)):
        sheet.alpha_composite(im.resize((56, 56), Image.LANCZOS), (G + i * (CELL + 10) + 36, G + CELL + 30))
    sheet.save(os.path.join(OUT, 'compose_test.png'))
    print('OK ->', os.path.join(OUT, 'compose_test.png'))


if __name__ == '__main__':
    main()
