# -*- coding: utf-8 -*-
"""v2 作图方案 · 火色 6 款样板验收图（自带抠底，无 import 副作用）"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from collections import deque

SRC = 'F:/workspace/towerdefence/art/special_blocks_v2/red'
OUT = 'F:/workspace/towerdefence/art/special_blocks_v2'
TOL = 45

JOBS = [
    ('row',   '2D_match_3_game_special_tile___2026-10-29T15-44-34.png', '行爆'),
    ('col',   '2D_match_3_game_special_tile___2026-10-29T15-44-46.png', '列爆'),
    ('cross', '2D_match_3_game_special_tile___2026-10-29T15-45-01.png', '十字爆'),
    ('split', '2D_match_3_game_special_tile___2026-10-29T15-49-40.png', '父雷'),
    ('sub',   '2D_match_3_game_special_tile___2026-10-29T15-48-02.png', '子雷'),
    ('rand',  '2D_match_3_game_special_tile___2026-10-29T15-50-40.png', '乱数'),
]


def keyout(src):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    px = im.load()
    seeds = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    sr = sum(s[0] for s in seeds) / 4
    sg = sum(s[1] for s in seeds) / 4
    sb = sum(s[2] for s in seeds) / 4
    bg = [[False] * w for _ in range(h)]
    q = deque()

    def near(c):
        return (c[0] - sr) ** 2 + (c[1] - sg) ** 2 + (c[2] - sb) ** 2 < TOL ** 2

    for x in range(w):
        for y in (0, h - 1):
            if not bg[y][x] and near(px[x, y]):
                bg[y][x] = True; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not bg[y][x] and near(px[x, y]):
                bg[y][x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx] and near(px[nx, ny]):
                bg[ny][nx] = True; q.append((nx, ny))
    for y in range(h):
        for x in range(w):
            if bg[y][x]:
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, 0)
    return im


def islands_clean(im):
    w, h = im.size
    px = im.load()
    lab = [[0] * w for _ in range(h)]
    sizes = {}
    cur = 0
    for y0 in range(h):
        for x0 in range(w):
            if lab[y0][x0] == 0 and px[x0, y0][3] > 0:
                cur += 1
                q = deque([(x0, y0)])
                lab[y0][x0] = cur
                cnt = 0
                while q:
                    x, y = q.popleft()
                    cnt += 1
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and lab[ny][nx] == 0 and px[nx, ny][3] > 0:
                            lab[ny][nx] = cur; q.append((nx, ny))
                sizes[cur] = cnt
    mx = max(sizes.values()) if sizes else 0
    dead = {k for k, v in sizes.items() if v < mx * 0.03}   # 3%：清角落水印，骰面点(>3%)保留
    if dead:
        for y in range(h):
            for x in range(w):
                if lab[y][x] in dead:
                    px[x, y] = (0, 0, 0, 0)
    return im


def crop_main(im):
    """保留最大连通域，其 bbox 外全部清零（清掉角落水印/残渣）"""
    w, h = im.size
    px = im.load()
    lab = [[0] * w for _ in range(h)]
    sizes = {}
    cur = 0
    for y0 in range(h):
        for x0 in range(w):
            if lab[y0][x0] == 0 and px[x0, y0][3] > 0:
                cur += 1
                q = deque([(x0, y0)])
                lab[y0][x0] = cur
                cnt = 0
                x_min = x_max = x0
                y_min = y_max = y0
                while q:
                    x, y = q.popleft()
                    cnt += 1
                    x_min = min(x_min, x); x_max = max(x_max, x)
                    y_min = min(y_min, y); y_max = max(y_max, y)
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and lab[ny][nx] == 0 and px[nx, ny][3] > 0:
                            lab[ny][nx] = cur; q.append((nx, ny))
                sizes[cur] = (cnt, x_min, y_min, x_max, y_max)
    if not sizes:
        return im
    main = max(sizes.values(), key=lambda t: t[0])
    for y in range(h):
        for x in range(w):
            if not (main[1] <= x <= main[3] and main[2] <= y <= main[4]):
                if px[x, y][3] > 0:
                    px[x, y] = (0, 0, 0, 0)
    return im


def to256(im):
    bbox = im.getbbox()
    im2 = im.crop(bbox)
    side = max(im2.size)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im2, ((side - im2.width) // 2, (side - im2.height) // 2))
    target = int(256 * 0.88)
    s = target / side
    out = canvas.resize((int(canvas.width * s), int(canvas.height * s)), Image.LANCZOS)
    a = out.split()[3].filter(ImageFilter.GaussianBlur(1.2))
    out.putalpha(a)
    final = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    final.alpha_composite(out, ((256 - out.width) // 2, (256 - out.height) // 2))
    return final


try:
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 15)
    font_s = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 12)
except Exception:
    font = font_s = ImageFont.load_default()

chips = {}
print('%-6s %-10s %s' % ('shape', 'corners', 'bbox256'))
for name, fn, label in JOBS:
    m = to256(crop_main(islands_clean(keyout(os.path.join(SRC, fn)))))
    chips[name] = m
    print('%-6s ok          %s' % (name, m.getbbox()))
    m.save(os.path.join(OUT, 'chip2_%s_red.png' % name), optimize=True)

C = 200; G = 12
sheet = Image.new('RGBA', (6 * C + 7 * G, C + 3 * G + 26), (23, 18, 31, 255))
d = ImageDraw.Draw(sheet)
d.text((G, 6), 'v2 作图方案 · 火色 6 款（抠底后 256，深底 #17121f 上）', font=font, fill=(214, 205, 228, 255))
for i, (name, _, label) in enumerate(JOBS):
    sheet.alpha_composite(chips[name].resize((C, C), Image.LANCZOS), (G + i * (C + G), 26))
    d.text((G + i * (C + G) + C // 2 - 14, 26 + C + 2), label, font=font, fill=(196, 186, 210, 255))

row = Image.new('RGBA', (6 * 56 + 7 * 10, 56 + 2 * 10 + 18), (23, 18, 31, 255))
d2 = ImageDraw.Draw(row)
d2.text((10, 2), '56px 实尺（棋盘等比）', font=font_s, fill=(160, 152, 176, 255))
for i, (name, _, label) in enumerate(JOBS):
    row.alpha_composite(chips[name].resize((56, 56), Image.LANCZOS), (10 + i * 66, 20))

final = Image.new('RGBA', (max(sheet.width, row.width * 3), sheet.height + row.height * 3 + 10), (23, 18, 31, 255))
final.alpha_composite(sheet, (0, 0))
final.alpha_composite(row.resize((row.width * 3, row.height * 3), Image.NEAREST), (0, sheet.height + 10))
final.save(os.path.join(OUT, 'red_sheet.png'))
print('saved red_sheet.png', final.size)
