# -*- coding: utf-8 -*-
"""特殊方块 v1：灰白棋盘格假透明 -> flood-fill 抠图 + 去水印小岛 + 256 交付 + 棋盘模拟"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from collections import deque
import os

SRC = 'F:/workspace/towerdefence/art/special_blocks_v1'
OUT = 'F:/workspace/towerdefence/art/special_blocks_v1'
FILES = [
    ('chip_cross.png', os.path.join(SRC, '2D_match_3_game_special_tile_i_2026-10-29T14-30-49.png')),
    ('chip_rainbow.png', os.path.join(SRC, '2D_match_3_game_special_tile_i_2026-10-29T14-31-09.png')),
]
TOL = 45  # 欧氏容差：棋盘格两色 232/248 距离约 30，深描边远超

def keyout(src):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    px = im.load()
    # 种子色 = 四角平均
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
                bg[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not bg[y][x] and near(px[x, y]):
                bg[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx] and near(px[nx, ny]):
                bg[ny][nx] = True
                q.append((nx, ny))
    for y in range(h):
        row = bg[y]
        for x in range(w):
            if row[x]:
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, 0)
    return im

def islands_clean(im):
    """连通域：保留最大岛与其 1% 以上的岛，删小岛（水印残迹）"""
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
                            lab[ny][nx] = cur
                            q.append((nx, ny))
                sizes[cur] = cnt
    mx = max(sizes.values()) if sizes else 0
    dead = {k for k, v in sizes.items() if v < mx * 0.01}
    n = 0
    if dead:
        for y in range(h):
            for x in range(w):
                if lab[y][x] in dead:
                    px[x, y] = (0, 0, 0, 0)
                    n += 1
    return im, len(sizes), len(dead), n

def edge_feather(im, radius=1.2):
    a = im.split()[3].filter(ImageFilter.GaussianBlur(radius))
    im.putalpha(a)
    return im

def deliver(src, dst):
    im = keyout(src)
    im, n_isle, n_dead, n_px = islands_clean(im)
    bbox = im.getbbox()
    im2 = im.crop(bbox)
    side = max(im2.size)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im2, ((side - im2.width) // 2, (side - im2.height) // 2))
    target = int(256 * 0.88)
    s = target / side
    out = canvas.resize((int(canvas.width * s), int(canvas.height * s)), Image.LANCZOS)
    final = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    final.alpha_composite(edge_feather(out), ((256 - out.width) // 2, (256 - out.height) // 2))
    final.save(dst, optimize=True)
    print(os.path.basename(dst), 'islands', n_isle, 'removed', n_dead, f'({n_px}px)', 'bbox', bbox)

for name, src in FILES:
    deliver(src, os.path.join(OUT, name))

# ---------- 棋盘观感模拟 ----------
BG = (23, 18, 31, 255)
CELL = 56
PAD = 26
def board_row(tiles):
    row = Image.new('RGBA', (5 * CELL + 2 * PAD, CELL + 2 * PAD), BG)
    d = ImageDraw.Draw(row)
    d.rectangle([0, 0, row.width - 1, row.height - 1], outline=(38, 31, 48, 255))
    for i in range(6):
        x = PAD + i * CELL
        d.line([(x, PAD), (x, PAD + CELL)], fill=(38, 31, 48, 255), width=1)
    for j in range(2):
        y = PAD + j * CELL
        d.line([(PAD, y), (PAD + 5 * CELL, y)], fill=(38, 31, 48, 255), width=1)
    for i, t in enumerate(tiles):
        row.alpha_composite(t.resize((CELL, CELL), Image.LANCZOS), (PAD + i * CELL, PAD))
    return row

cross = Image.open(os.path.join(OUT, 'chip_cross.png')).convert('RGBA')
rainbow = Image.open(os.path.join(OUT, 'chip_rainbow.png')).convert('RGBA')
fire = Image.open('F:/workspace/towerdefence/assets/images/board/fire.png').convert('RGBA')
ice = Image.open('F:/workspace/towerdefence/assets/images/board/ice.png').convert('RGBA')

r1 = board_row([cross, fire, cross, fire, cross])
r2 = board_row([rainbow, ice, rainbow, ice, rainbow])
W = max(r1.width, r2.width)
sheet = Image.new('RGBA', (W, r1.height + r2.height + 78), BG)
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 15)
except Exception:
    font = ImageFont.load_default()
d.text((PAD, 6), '十字爆 (cross) × 普通火块 · 56px 实际显示尺寸', font=font, fill=(210, 200, 225, 255))
sheet.alpha_composite(r1, (0, 30))
y2 = r1.height + 40
d.text((PAD, y2 + 2), '彩虹 (rainbow) × 普通冰块 · 56px 实际显示尺寸', font=font, fill=(210, 200, 225, 255))
sheet.alpha_composite(r2, (0, y2 + 26))
sheet.save(os.path.join(OUT, 'board_sim.png'))
print('board_sim saved', sheet.size)
