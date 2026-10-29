# -*- coding: utf-8 -*-
"""特殊图案按底板色系染色（duotone：深描边 → 同色亮调 → 白高光）
输出 art/blocks_reset/tint/<color>/<shape>.png 以及 6×6 染色矩阵验收图
"""
import os
from PIL import Image, ImageDraw, ImageChops

ROOT = 'F:/workspace/towerdefence/art/blocks_reset'
GLYPH_OUT = os.path.join(ROOT, 'out')
BASE_OUT = os.path.join(ROOT, 'out')
TINT_OUT = os.path.join(ROOT, 'tint')

BG = (23, 18, 31, 255)
TXT = (214, 205, 228, 255)
DIM = (150, 142, 168, 255)
COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange']

# 每色：(中间亮调, 高光色, 暗描边色)  —— tint/hi 均带色，保证「染色感」明显
PALETTE = {
    'red':    ((255, 168, 168), (255, 226, 226), (46, 12, 18)),
    'blue':   ((166, 214, 255), (226, 241, 255), (10, 26, 44)),
    'green':  ((166, 240, 195), (222, 250, 235), (10, 36, 22)),
    'yellow': ((255, 224, 122), (255, 245, 200), (44, 34, 8)),
    'purple': ((213, 172, 255), (238, 222, 255), (30, 12, 44)),
    'orange': ((255, 188, 122), (255, 231, 200), (44, 24, 8)),
}

SHAPES = ['row', 'col', 'cross', 'split', 'rand']   # 全染；sub 红叉单独处理
SPLIT_GOLD_KEEP = True   # 父雷是否保留金色（True=不参与染色）


def lerp(a, b, f):
    return (round(a[0] + (b[0] - a[0]) * f),
            round(a[1] + (b[1] - a[1]) * f),
            round(a[2] + (b[2] - a[2]) * f))


def duotone(im, tint, hi, dark, mid_stop=0.62, hi_stop=0.88):
    """明度重映射：L<mid_stop → dark..tint；mid_stop..hi_stop → tint..hi；>hi_stop → hi"""
    im = im.convert('RGBA')
    w, h = im.size
    src = im.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            L = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            if L < mid_stop:
                c = lerp(dark, tint, L / mid_stop)
            elif L < hi_stop:
                c = lerp(tint, hi, (L - mid_stop) / (hi_stop - mid_stop))
            else:
                c = hi
            dst[x, y] = (c[0], c[1], c[2], a)
    return out


def tint_all():
    made = {}
    for color in COLORS:
        tint, hi, dark = PALETTE[color]
        d = os.path.join(TINT_OUT, color)
        os.makedirs(d, exist_ok=True)
        for shape in SHAPES:
            src = Image.open(os.path.join(GLYPH_OUT, 'glyph_%s.png' % shape))
            im = duotone(src, tint, hi, dark)
            im.save(os.path.join(d, '%s.png' % shape))
            made[(color, shape)] = im
        # 父雷：可选保留金色
        src = Image.open(os.path.join(GLYPH_OUT, 'glyph_split.png'))
        made[(color, 'split')] = src if SPLIT_GOLD_KEEP else made[(color, 'split')]
        # 子雷：三角主体染色，红叉保留
        src = Image.open(os.path.join(GLYPH_OUT, 'glyph_sub.png'))
        made[(color, 'sub')] = tint_sub(src, tint, hi, dark)
        made[(color, 'sub')].save(os.path.join(d, 'sub.png'))
        # rainbow 不染
        sh = Image.open(os.path.join(GLYPH_OUT, 'glyph_rainbow.png'))
        sh.save(os.path.join(d, 'rainbow.png'))
        made[(color, 'rainbow')] = sh
    return made


def tint_sub(im, tint, hi, dark):
    """子雷：白色部分（三角+内点）染色；红色 X 保持红"""
    im = im.convert('RGBA')
    w, h = im.size
    src = im.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            # 判红：R 明显大于 G/B
            if r > 120 and r > g * 1.6 and r > b * 1.6:
                dst[x, y] = (r, g, b, a)
                continue
            L = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            if L < 0.62:
                c = lerp(dark, tint, L / 0.62)
            elif L < 0.88:
                c = lerp(tint, hi, (L - 0.62) / 0.26)
            else:
                c = hi
            dst[x, y] = (c[0], c[1], c[2], a)
    return out


def compose(base, glyph, size=128):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    im.alpha_composite(base)
    if glyph is not None:
        im.alpha_composite(glyph)
    return im


def main():
    made = tint_all()
    bases = {c: Image.open(os.path.join(BASE_OUT, 'base_%s.png' % c)) for c in COLORS}
    shapes = ['row', 'col', 'cross', 'split', 'sub', 'rand']

    S, GAP, G, LW = 76, 8, 20, 96
    W = G + LW + len(COLORS) * (S + GAP) + 90
    H = G + 22 + len(shapes) * (S + GAP) + 8
    s = Image.new('RGBA', (W, H), BG)
    d = ImageDraw.Draw(s)
    d.text((G, 8), 'E  图案随底板染色（父雷保留金色 / 子雷 X 保留红色）', fill=TXT)
    for r, sh in enumerate(shapes):
        y = G + 24 + r * (S + GAP)
        d.text((G, y + S // 2 - 6), sh, fill=DIM)
        for cix, color in enumerate(COLORS):
            x = G + LW + cix * (S + GAP)
            im = compose(bases[color], made[(color, sh)]).resize((S, S), Image.LANCZOS)
            s.alpha_composite(im, (x, y))
    # rainbow
    x = G + LW + len(COLORS) * (S + GAP) + 20
    d.text((x, 10), 'rainbow', fill=DIM)
    s.alpha_composite(compose(bases['red'], made[('red', 'rainbow')]).resize((S, S), Image.LANCZOS), (x, G + 24))
    s.save(os.path.join(ROOT, 'accept_E_tint.png'))

    # 56px 同色三款十字类可辨性检查（row/col/cross/split 同色并排）
    S2 = 56
    W2 = 20 * 2 + 4 * (S2 + 6) + 40
    H2 = 20 + 24 + 2 * (S2 + 6) + 26
    s2 = Image.new('RGBA', (W2, H2), BG)
    d2 = ImageDraw.Draw(s2)
    d2.text((20, 6), 'F  56px 同色四款并排（检验十字类是否可辨）', fill=TXT)
    for row, color in enumerate(['red', 'blue']):
        for i, sh in enumerate(['row', 'col', 'cross', 'split']):
            im = compose(bases[color], made[(color, sh)]).resize((S2, S2), Image.LANCZOS)
            s2.alpha_composite(im, (20 + i * (S2 + 6), 26 + row * (S2 + 6)))
    s2.save(os.path.join(ROOT, 'accept_F_56px.png'))
    print('OK tint -> ', TINT_OUT)


if __name__ == '__main__':
    main()
