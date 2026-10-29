# -*- coding: utf-8 -*-
"""方案 B 验证：中性灰底 cross -> 模拟 canvas source-atop 染色（6 色 x 3 档 α）+ 56px 棋盘模拟"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from collections import deque
import os

DIR = 'F:/workspace/towerdefence/art/special_blocks_v1'
SRC = os.path.join(DIR, 'chroma/2D_game_tile_icon__a_neutral_U_2026-10-29T15-01-15.png')
TOL = 45
TINTS = [('火', (255, 107, 107)), ('冰', (93, 173, 226)), ('毒', (88, 214, 141)),
         ('电', (244, 208, 63)), ('回旋', (175, 122, 197)), ('炮', (230, 126, 34))]
ALPHAS = [0.70, 0.78, 0.86]

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
    dead = {k for k, v in sizes.items() if v < mx * 0.01}
    if dead:
        for y in range(h):
            for x in range(w):
                if lab[y][x] in dead:
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

master = to256(islands_clean(keyout(SRC)))
master.save(os.path.join(DIR, 'chroma/chip_cross_neutral.png'), optimize=True)
print('neutral master saved')

# ---- 染色模拟：c' = tint*a + c*(1-a)，对 alpha>0 像素 ----
def tint(im, rgb, alpha):
    out = im.copy()
    px = out.load()
    tr, tg, tb = rgb
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (int(tr * alpha + r * (1 - alpha)),
                        int(tg * alpha + g * (1 - alpha)),
                        int(tb * alpha + b * (1 - alpha)), a)
    return out

# 对照大图：6 列 x 3 行
CELLPX = 128
GAP = 14
W = 6 * CELLPX + 7 * GAP
H = 3 * CELLPX + 5 * GAP + 30
sheet = Image.new('RGBA', (W, H), (23, 18, 31, 255))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 15)
except Exception:
    font = ImageFont.load_default()
d.text((GAP, 6), '染色模拟（上α0.70 / 中α0.78 / 下α0.86）', font=font, fill=(210, 200, 225, 255))
for ci, (name, rgb) in enumerate(TINTS):
    for ri, al in enumerate(ALPHAS):
        t = tint(master, rgb, al).resize((CELLPX, CELLPX), Image.LANCZOS)
        x = GAP + ci * (CELLPX + GAP)
        y = 30 + GAP + ri * (CELLPX + GAP)
        sheet.alpha_composite(t, (x, y))
    d.text((GAP + ci * (CELLPX + GAP) + 40, 30 + GAP + 3 * (CELLPX + GAP) + 2),
           name, font=font, fill=(210, 200, 225, 255))
sheet.save(os.path.join(DIR, 'chroma/tint_matrix.png'))
print('tint_matrix saved', sheet.size)

# ---- 56px 棋盘模拟：α=0.78 全 6 色 ----
CELL = 56
PAD = 26
row = Image.new('RGBA', (6 * CELL + 2 * PAD, CELL + 2 * PAD), (23, 18, 31, 255))
d = ImageDraw.Draw(row)
d.rectangle([0, 0, row.width - 1, row.height - 1], outline=(38, 31, 48, 255))
for i in range(7):
    x = PAD + i * CELL
    d.line([(x, PAD), (x, PAD + CELL)], fill=(38, 31, 48, 255), width=1)
for j in range(2):
    y = PAD + j * CELL
    d.line([(PAD, y), (PAD + 6 * CELL, y)], fill=(38, 31, 48, 255), width=1)
for i, (name, rgb) in enumerate(TINTS):
    t = tint(master, rgb, 0.78).resize((CELL, CELL), Image.LANCZOS)
    row.alpha_composite(t, (PAD + i * CELL, PAD))
row.save(os.path.join(DIR, 'chroma/board_sim_tint.png'))
print('board_sim_tint saved')
