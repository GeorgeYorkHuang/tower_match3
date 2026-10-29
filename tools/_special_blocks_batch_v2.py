# -*- coding: utf-8 -*-
"""特殊方块 v2：符号对调 + 尖头十字子雷。keyout->256->切mark->染色->56px区分度"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from collections import deque
import os

DIR = 'F:/workspace/towerdefence/art/special_blocks_v1'
SRC = os.path.join(DIR, 'v2')
OUT = os.path.join(DIR, 'chroma2')
os.makedirs(OUT, exist_ok=True)
TOL = 45
DARK_KEEP = 45
TINTS = [('火', (255, 107, 107)), ('冰', (93, 173, 226)), ('毒', (88, 214, 141)),
         ('电', (244, 208, 63)), ('回旋', (175, 122, 197)), ('炮', (230, 126, 34))]
ALPHA = 0.78

JOBS = [
    ('cross', '2D_game_tile_icon__a_neutral_U_2026-10-29T15-12-08.png'),
    ('split', '2D_game_tile_icon__a_neutral_U_2026-10-29T15-12-28.png'),
    ('sub',   '2D_game_tile_icon__a_neutral_U_2026-10-29T15-12-51.png'),
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

def make_mark(im):
    m = im.copy()
    px = m.load()
    for y in range(m.height):
        for x in range(m.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            L = 0.299 * r + 0.587 * g + 0.114 * b
            if L >= DARK_KEEP:
                px[x, y] = (r, g, b, 0)
    return m

def tint(im, rgb, alpha=ALPHA):
    out = im.copy(); p = out.load()
    tr, tg, tb = rgb
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = p[x, y]
            if a == 0:
                continue
            p[x, y] = (int(tr * alpha + r * (1 - alpha)), int(tg * alpha + g * (1 - alpha)),
                       int(tb * alpha + b * (1 - alpha)), a)
    return out

masters = {}
for name, fn in JOBS:
    m = to256(islands_clean(keyout(os.path.join(SRC, fn))))
    mk = make_mark(m)
    m.save(os.path.join(OUT, 'chip_%s_neutral.png' % name), optimize=True)
    mk.save(os.path.join(OUT, 'chip_%s_mark.png' % name), optimize=True)
    masters[name] = (m, mk)
    print(name, 'ok')

# A：三款 x 6 色
CELL = 118; GAP = 12
W = 6 * CELL + 7 * GAP
H = 3 * CELL + 5 * GAP + 34
sheet = Image.new('RGBA', (W, H), (23, 18, 31, 255))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 14)
except Exception:
    font = ImageFont.load_default()
d.text((GAP, 6), 'v2 染色后：上=十字爆(方头+圆核裂纹) 中=父雷(八角+四角星) 下=子雷(尖头十字+菱形)', font=font, fill=(210, 200, 225, 255))
for ri, name in enumerate(['cross', 'split', 'sub']):
    body, mark = masters[name]
    for ci, (cn, rgb) in enumerate(TINTS):
        t = tint(body, rgb); t.alpha_composite(mark)
        sheet.alpha_composite(t.resize((CELL, CELL), Image.LANCZOS),
                              (GAP + ci * (CELL + GAP), 34 + GAP + ri * (CELL + GAP)))
sheet.save(os.path.join(OUT, 'tint_family_v2.png'))
print('tint_family_v2 saved')

# B：56px 同色棋盘（十字爆 / 父雷 / 子雷 混排）
C = 56; P = 24
rows = [['cross', 'sub', 'split', 'sub', 'cross', 'split'],
        ['sub', 'split', 'cross', 'split', 'sub', 'cross']]
tintall = {}
for name in ['cross', 'split', 'sub']:
    body, mark = masters[name]
    t = tint(body, (255, 107, 107)); t.alpha_composite(mark)
    tintall[name] = t

sim = Image.new('RGBA', (6 * C + 2 * P, 2 * C + 2 * P), (23, 18, 31, 255))
d = ImageDraw.Draw(sim)
d.rectangle([0, 0, sim.width - 1, sim.height - 1], outline=(38, 31, 48, 255))
for i in range(7):
    x = P + i * C
    d.line([(x, P), (x, P + 2 * C)], fill=(38, 31, 48, 255), width=1)
for j in range(3):
    y = P + j * C
    d.line([(P, y), (P + 6 * C, y)], fill=(38, 31, 48, 255), width=1)
for ri, row in enumerate(rows):
    for ci, name in enumerate(row):
        sim.alpha_composite(tintall[name].resize((C, C), Image.LANCZOS), (P + ci * C, P + ri * C))
sim = sim.resize((sim.width * 2, sim.height * 2), Image.LANCZOS)
sim.save(os.path.join(OUT, 'board_sim_v2.png'))
print('board_sim_v2 saved', sim.size)
