# -*- coding: utf-8 -*-
"""底板×图案分离：全量后处理 + 验收图
产出 art/blocks_reset/out/base_<color>.png(128) / glyph_<name>.png(128)
"""
import os
import importlib.util
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('rc', 'F:/workspace/towerdefence/tools/_reset_compose.py')
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)

ROOT = 'F:/workspace/towerdefence/art/blocks_reset'
BASE_SRC = os.path.join(ROOT, 'base')
GLYPH_SRC = os.path.join(ROOT, 'glyph')
OUT = os.path.join(ROOT, 'out')
CUR = 'F:/workspace/towerdefence/assets/images/board'
os.makedirs(OUT, exist_ok=True)

BASE = [
    ('red', 'Remove_the_central_flame_emble_2026-10-29T16-16-56.png'),
    ('blue', 'Remove_the_central_snowflake_e_2026-10-29T16-18-32.png'),
    ('green', 'Remove_the_central_potion_flas_2026-10-29T16-18-40.png'),
    ('yellow', 'Remove_the_central_lightning_b_2026-10-29T16-18-50.png'),
    ('purple', 'Erase_the_central_boomerang_em_2026-10-29T16-24-32.png'),
    ('orange', 'Remove_the_central_bomb_emblem_2026-10-29T16-19-12.png'),
]

# (name, file, ratio)  普通符号=图生图从原版块提取；特殊符号=文生图
GLYPH = [
    ('flame',    'Extract_ONLY_the_central_flame_2026-10-29T16-24-41.png', 0.68),
    ('snow',     'Extract_ONLY_the_central_snowf_2026-10-29T16-25-21.png', 0.68),
    ('flask',    'Extract_ONLY_the_central_green_2026-10-29T16-25-28.png', 0.68),
    ('bolt',     'Extract_ONLY_the_central_light_2026-10-29T16-25-38.png', 0.68),
    ('blade',    'Extract_ONLY_the_central_purpl_2026-10-29T16-25-46.png', 0.68),
    ('bomb',     'Extract_ONLY_the_central_brown_2026-10-29T16-25-53.png', 0.68),
    ('row',      'a_single_game_icon_emblem__a_b_2026-10-29T16-21-14.png', 0.82),
    ('col',      'a_single_game_icon_emblem__a_b_2026-10-29T16-21-26.png', 0.82),
    ('cross',    'a_single_game_icon_emblem__a_b_2026-10-29T16-20-50.png', 0.78),
    ('split',    'a_single_game_icon_emblem__one_2026-10-29T16-21-35.png', 0.80),
    ('rand',     'a_single_game_icon_emblem__a_b_2026-10-29T16-22-33.png', 0.74),
    ('rainbow',  'a_single_game_icon_emblem_of_a_2026-10-29T16-22-48.png', 0.78),
    ('sub',      'a_single_game_icon_emblem_of_a_2026-10-29T16-23-04.png', 0.80),
]

COLOR_ORDER = ['red', 'blue', 'green', 'yellow', 'purple', 'orange']
NORMAL_GLYPH = {'red': 'flame', 'blue': 'snow', 'green': 'flask',
                'yellow': 'bolt', 'purple': 'blade', 'orange': 'bomb'}
CUR_FILE = {'red': 'fire', 'blue': 'ice', 'green': 'poison',
            'yellow': 'electric', 'purple': 'boomerang', 'orange': 'cannon'}

BG = (23, 18, 31, 255)
TXT = (214, 205, 228, 255)
DIM = (150, 142, 168, 255)


def load_all():
    bases, glyphs = {}, {}
    for key, fn in BASE:
        im = rc.to_base(rc.keyout(os.path.join(BASE_SRC, fn)))
        im.save(os.path.join(OUT, 'base_%s.png' % key))
        bases[key] = im
    for name, fn, ratio in GLYPH:
        im = rc.to_glyph(rc.keyout(os.path.join(GLYPH_SRC, fn)), ratio=ratio)
        im.save(os.path.join(OUT, 'glyph_%s.png' % name))
        glyphs[name] = im
    return bases, glyphs


def compose(base, glyph):
    im = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    im.alpha_composite(base)
    if glyph is not None:
        im.alpha_composite(glyph)
    return im


def sheet_bases(bases):
    CELL, GAP, G = 128, 12, 20
    W, H = G * 2 + CELL * 6 + GAP * 5, G + 20 + CELL * 2 + GAP + 18 + 56 + 24
    s = Image.new('RGBA', (W, H), BG)
    d = ImageDraw.Draw(s)
    d.text((G, 8), 'A  底板 6 色（上：新底板去掉符号 / 下：原版整块）', fill=TXT)
    for i, k in enumerate(COLOR_ORDER):
        x = G + i * (CELL + GAP)
        s.alpha_composite(bases[k], (x, G + 20))
        cur = Image.open(os.path.join(CUR, CUR_FILE[k] + '.png')).convert('RGBA')
        s.alpha_composite(cur.resize((128, 128), Image.LANCZOS), (x, G + 20 + CELL + GAP))
        s.alpha_composite(bases[k].resize((56, 56), Image.LANCZOS), (x + 36, G + 20 + CELL * 2 + GAP + 18))
    return s


def sheet_normal(bases, glyphs):
    CELL, GAP, G = 128, 12, 20
    W, H = G * 2 + CELL * 6 + GAP * 5, G + 20 + CELL + GAP + CELL + 18 + 56 + 22
    s = Image.new('RGBA', (W, H), BG)
    d = ImageDraw.Draw(s)
    d.text((G, 8), 'B  普通块：新合成（上）vs 原版（下），最底行 56px 实尺', fill=TXT)
    for i, k in enumerate(COLOR_ORDER):
        x = G + i * (CELL + GAP)
        comp = compose(bases[k], glyphs[NORMAL_GLYPH[k]])
        s.alpha_composite(comp, (x, G + 20))
        cur = Image.open(os.path.join(CUR, CUR_FILE[k] + '.png')).convert('RGBA')
        s.alpha_composite(cur.resize((128, 128), Image.LANCZOS), (x, G + 20 + CELL + GAP))
        s.alpha_composite(comp.resize((56, 56), Image.LANCZOS), (x + 36, G + 20 + CELL * 2 + GAP + 18))
    return s


def sheet_special(bases, glyphs):
    shapes = ['row', 'col', 'cross', 'split', 'sub', 'rand']
    S, GAP, G = 72, 8, 20
    LW = 104
    W = G + LW + len(COLOR_ORDER) * (S + GAP) + 60
    H = G + 20 + len(shapes) * (S + GAP)
    s = Image.new('RGBA', (W, H), BG)
    d = ImageDraw.Draw(s)
    d.text((G, 8), 'C  特殊块矩阵：6 形 × 6 色（底板复用同色）+ 彩虹独立', fill=TXT)
    for r, sh in enumerate(shapes):
        y = G + 22 + r * (S + GAP)
        d.text((G, y + S // 2 - 6), sh, fill=DIM)
        for cix, k in enumerate(COLOR_ORDER):
            x = G + LW + cix * (S + GAP)
            im = compose(bases[k], glyphs[sh]).resize((S, S), Image.LANCZOS)
            s.alpha_composite(im, (x, y))
    # 彩虹行
    y = G + 22
    x = G + LW + len(COLOR_ORDER) * (S + GAP) + 24
    d.text((x, y - 14), 'rainbow', fill=DIM)
    s.alpha_composite(compose(bases['red'], glyphs['rainbow']).resize((S, S), Image.LANCZOS), (x, y))
    s.alpha_composite(glyphs['rainbow'].resize((S, S), Image.LANCZOS), (x, y + S + GAP))
    return s


def sheet_board58(bases, glyphs):
    """56px 棋盘混排：6 普通 + 6 特殊 + 彩虹，同色相邻检验可辨性"""
    S, PAD, G = 56, 6, 20
    GAPX = 4
    layout = [
        ['flame', 'snow', 'flask', 'bolt', 'blade', 'bomb', 'rainbow'],
        ['row', 'split', 'cross', 'rand', 'sub', 'col', 'flame'],
        ['split', 'cross', 'rand', 'sub', 'row', 'col', 'snow'],
    ]
    W = G * 2 + len(layout[0]) * (S + GAPX)
    H = G + 22 + len(layout) * (S + GAPX) + 10
    s = Image.new('RGBA', (W, H), BG)
    d = ImageDraw.Draw(s)
    d.text((G, 8), 'D  56px 棋盘实尺混排', fill=TXT)
    for r, row in enumerate(layout):
        for cix, name in enumerate(row):
            col = COLOR_ORDER[(r + cix) % 6]
            im = compose(bases[col], glyphs[name]).resize((S, S), Image.LANCZOS)
            s.alpha_composite(im, (G + cix * (S + GAPX), G + 22 + r * (S + GAPX)))
    return s


def main():
    bases, glyphs = load_all()
    outs = [sheet_bases(bases), sheet_normal(bases, glyphs),
            sheet_special(bases, glyphs), sheet_board58(bases, glyphs)]
    for im, nm in zip(outs, ('A_bases', 'B_normal', 'C_special', 'D_board')):
        im.save(os.path.join(ROOT, 'accept_%s.png' % nm))
    total_h = sum(o.height for o in outs) + 3 * 14
    max_w = max(o.width for o in outs)
    final = Image.new('RGBA', (max_w, total_h), BG)
    y = 0
    for o in outs:
        final.alpha_composite(o, (0, y))
        y += o.height + 14
    final.save(os.path.join(ROOT, 'accept_all.png'))
    print('OK  base=%d glyph=%d  %dx%d' % (len(bases), len(glyphs), final.width, final.height))
    for k in COLOR_ORDER:
        print(' ', k, os.path.getsize(os.path.join(OUT, 'base_%s.png' % k)))
    for n in glyphs:
        print(' ', n, os.path.getsize(os.path.join(OUT, 'glyph_%s.png' % n)))


if __name__ == '__main__':
    main()
