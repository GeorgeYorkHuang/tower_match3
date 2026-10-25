# -*- coding: utf-8 -*-
"""v2：relic 80px/32色 + 保留 PNG optimize + JPG quality78，控制最终包 <4MB"""
import os, io
from PIL import Image

ROOT = r'F:\workspace\towerdefence'

def compress_png(path, maxdim=None, colors=None):
    im = Image.open(path)
    if im.mode != 'RGBA':
        im = im.convert('RGBA')
    w, h = im.size
    if maxdim:
        sc = min(1.0, maxdim / max(w, h))
        if sc < 1.0:
            im = im.resize((max(1, int(w * sc)), max(1, int(h * sc))), Image.LANCZOS)
    if colors:
        q = im.quantize(colors, method=Image.Quantize.FASTOCTREE).convert('RGBA')
        b1, b2 = io.BytesIO(), io.BytesIO()
        im.save(b1, 'PNG', optimize=True)
        q.save(b2, 'PNG', optimize=True)
        if b2.tell() < b1.tell():
            im = q
    im.save(path, 'PNG', optimize=True)
    return os.path.getsize(path)

def compress_jpg(path, quality=78):
    im = Image.open(path)
    if im.mode != 'RGB':
        im = im.convert('RGB')
    im.save(path, 'JPEG', quality=quality, optimize=True)
    return os.path.getsize(path)

# 1) relic 单图 80px/32 色
t = 0
for root, dirs, files in os.walk(os.path.join(ROOT, 'images', 'relic')):
    for f in files:
        if f.startswith('sheet_') or f == 'mapping.json':
            continue
        p = os.path.join(root, f)
        t += compress_png(p, 80, 32)
print('relic: %.2f MB' % (t / 1048576))

# 2) 保留 PNG optimize（anims 雪碧图 / skillicons / board / enemies / towers / burn / icebloom / poisonstick / turret / menubg / coin / chest 已压）
t = 0
for sub in ['anims', 'board', 'enemies', 'towers', 'menubg', 'skillicons', 'burn', 'icebloom', 'poisonstick', 'turret']:
    d = os.path.join(ROOT, 'images', sub)
    if not os.path.isdir(d):
        continue
    for root, dirs, files in os.walk(d):
        for f in files:
            if f.endswith('.png'):
                p = os.path.join(root, f)
                if 'debuff' in f or '_raw' in f:
                    continue
                t += compress_png(p)
print('other png: %.2f MB' % (t / 1048576))

# 3) jpg 重压（运行时保留的几张）
t = 0
for f in ['action_area_edges.jpg', 'wall.jpg', 'tower_row_dark.jpg', 'board_bg_dark_1.jpg']:
    p = os.path.join(ROOT, 'images', 'ui', f)
    if os.path.exists(p):
        t += compress_jpg(p, 78)
print('jpg: %.2f MB' % (t / 1048576))
print('done')
