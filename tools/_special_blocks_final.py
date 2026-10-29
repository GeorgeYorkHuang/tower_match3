# -*- coding: utf-8 -*-
"""特殊方块最终批处理：7 款 -> body/mark 256px + 谱系图 + 染色矩阵 + 56px 混合棋盘"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from collections import deque
import os, sys
sys.path.insert(0, 'F:/workspace/towerdefence/tools')
from _special_blocks_batch_v2 import keyout, islands_clean, to256, make_mark, tint, TINTS

DIR = 'F:/workspace/towerdefence/art/special_blocks_v1'
V2 = os.path.join(DIR, 'v2')
CH2 = os.path.join(DIR, 'chroma2')

TINTED = [
    ('row',   '2D_game_tile_icon__a_neutral_U_2026-10-29T15-15-49.png', '行爆 扁横条'),
    ('col',   '2D_game_tile_icon__a_neutral_U_2026-10-29T15-16-10.png', '列爆 竖条'),
    ('rand',  '2D_game_tile_icon__a_neutral_U_2026-10-29T15-16-29.png', '乱数 菱形'),
]
RAINBOW = os.path.join(CH2, '2D_match_3_game_special_tile_i_2026-10-29T15-16-48.png')

for name, fn, label in TINTED:
    m = to256(islands_clean(keyout(os.path.join(V2, fn))))
    mk = make_mark(m)
    m.save(os.path.join(CH2, 'chip_%s_neutral.png' % name), optimize=True)
    mk.save(os.path.join(CH2, 'chip_%s_mark.png' % name), optimize=True)
    print(name, 'ok')

rb = to256(islands_clean(keyout(RAINBOW)))
rb.save(os.path.join(CH2, 'chip_rainbow.png'), optimize=True)
print('rainbow ok')

# ---- 全部款（body+mark 已备）----
FAMILY = [('cross', '十字爆'), ('split', '父雷'), ('sub', '子雷'),
          ('row', '行爆'), ('col', '列爆'), ('rand', '乱数'), ('rainbow', '彩虹')]
bodies, marks = {}, {}
for name, _ in FAMILY:
    if name == 'rainbow':
        bodies[name] = Image.open(os.path.join(CH2, 'chip_rainbow.png')).convert('RGBA')
        marks[name] = None
    else:
        bodies[name] = Image.open(os.path.join(CH2, 'chip_%s_neutral.png' % name)).convert('RGBA')
        marks[name] = Image.open(os.path.join(CH2, 'chip_%s_mark.png' % name)).convert('RGBA')

def composed(name, rgb=None, alpha=0.78):
    b = bodies[name]
    if rgb is None:
        return b
    t = tint(b, rgb, alpha)
    if marks[name] is not None:
        t.alpha_composite(marks[name])
    return t

try:
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 15)
except Exception:
    font = ImageFont.load_default()

# A) 母版谱系（灰度，验证轮廓可辨）
C = 132; G = 14
sheet = Image.new('RGBA', (7 * C + 8 * G, C + 3 * G + 26), (23, 18, 31, 255))
d = ImageDraw.Draw(sheet)
d.text((G, 6), '轮廓谱系（中性灰母版，灰度下也能分辨）', font=font, fill=(210, 200, 225, 255))
for i, (name, label) in enumerate(FAMILY):
    sheet.alpha_composite(bodies[name].resize((C, C), Image.LANCZOS), (G + i * (C + G), 26))
    d.text((G + i * (C + G) + 40, 26 + C + 2), label, font=font, fill=(190, 182, 205, 255))
sheet.save(os.path.join(CH2, 'family_silhouette.png'))
print('family_silhouette saved')

# B) 染色矩阵：7 款 x 6 色（彩虹重复展示自身）
CC = 104; GG = 10
sheet = Image.new('RGBA', (6 * CC + 7 * GG, 7 * CC + 8 * GG + 26), (23, 18, 31, 255))
d = ImageDraw.Draw(sheet)
d.text((GG, 6), '染色矩阵：7 款 x 6 来源色（α0.78，彩虹不染）', font=font, fill=(210, 200, 225, 255))
for ri, (name, label) in enumerate(FAMILY):
    for ci, (cn, rgb) in enumerate(TINTS):
        img = composed(name, None if name == 'rainbow' else rgb)
        x = GG + ci * (CC + GG); y = 26 + GG + ri * (CC + GG)
        sheet.alpha_composite(img.resize((CC, CC), Image.LANCZOS), (x, y))
sheet.save(os.path.join(CH2, 'tint_matrix_all.png'))
print('tint_matrix_all saved')

# C) 56px 同色混合棋盘（全款）
CELL = 56; P = 22
rows = [
    ['row', 'col', 'cross', 'split', 'sub', 'rand'],
    ['split', 'sub', 'rand', 'cross', 'rainbow', 'sub'],
    ['sub', 'cross', 'split', 'sub', 'cross', 'split'],
]
sim = Image.new('RGBA', (6 * CELL + 2 * P, 3 * CELL + 2 * P), (23, 18, 31, 255))
d = ImageDraw.Draw(sim)
d.rectangle([0, 0, sim.width - 1, sim.height - 1], outline=(38, 31, 48, 255))
for i in range(7):
    x = P + i * CELL
    d.line([(x, P), (x, P + 3 * CELL)], fill=(38, 31, 48, 255), width=1)
for j in range(4):
    y = P + j * CELL
    d.line([(P, y), (P + 6 * CELL, y)], fill=(38, 31, 48, 255), width=1)
for ri, row in enumerate(rows):
    for ci, name in enumerate(row):
        img = composed(name, None if name == 'rainbow' else (255, 107, 107))
        sim.alpha_composite(img.resize((CELL, CELL), Image.LANCZOS), (P + ci * CELL, P + ri * CELL))
# 右侧加一列：同款按 6 色排（检验一致性）
sim = sim.resize((sim.width * 2, sim.height * 2), Image.LANCZOS)
sim.save(os.path.join(CH2, 'board_sim_all.png'))
print('board_sim_all saved', sim.size)
