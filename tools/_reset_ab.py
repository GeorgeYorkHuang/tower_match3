# -*- coding: utf-8 -*-
"""底板 A/B 对比：密裂纹版 vs 稀疏裂纹版 vs 原版"""
import os
from PIL import Image, ImageDraw
import importlib.util
spec = importlib.util.spec_from_file_location('rc', 'F:/workspace/towerdefence/tools/_reset_compose.py')
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)

OUT = 'F:/workspace/towerdefence/art/blocks_reset'
BASE_DIR = os.path.join(OUT, 'base')
CUR = 'F:/workspace/towerdefence/assets/images/board'

FILES = [
    ('A 密裂纹', '2D_match_3_game_tile__a_single_2026-10-29T16-15-10.png'),
    ('B 稀疏裂纹', '2D_match_3_game_tile__a_single_2026-10-29T16-15-50.png'),
]

bases = []
for label, fn in FILES:
    im = rc.to_base(rc.keyout(os.path.join(BASE_DIR, fn)))
    im.save(os.path.join(OUT, 'base_fire_%s.png' % label[0]))
    bases.append((label, im))

glyph = Image.open(os.path.join(OUT, 'glyph_flame.png'))
cur = Image.open(os.path.join(CUR, 'fire.png')).convert('RGBA')

CELL, G, GAP = 128, 24, 14
W = G * 2 + CELL * 3 + GAP * 2
H = G + 18 + CELL + 20 + 56 + 30
sheet = Image.new('RGBA', (W, H), (23, 18, 31, 255))
d = ImageDraw.Draw(sheet)
d.text((G, 8), '原版  |  A 合成  |  B 合成   （上 128px，下 56px 实尺）', fill=(214, 205, 228, 255))

cols = [cur]
for _, b in bases:
    comp = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    comp.alpha_composite(b)
    comp.alpha_composite(glyph)
    cols.append(comp)

x = G
for i, im in enumerate(cols):
    sheet.alpha_composite(im, (x, G + 22))
    sheet.alpha_composite(im.resize((56, 56), Image.LANCZOS), (x + 36, G + CELL + 34))
    x += CELL + GAP

for i, (label, _) in enumerate(bases):
    d.text((G + (i + 1) * (CELL + GAP) + 30, G + CELL + 96), label, fill=(160, 152, 176, 255))

sheet.save(os.path.join(OUT, 'base_ab_test.png'))
print('OK ->', os.path.join(OUT, 'base_ab_test.png'))
