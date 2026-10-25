# -*- coding: utf-8 -*-
"""v3：anim 雪碧图缩到 1280px 宽、敌人/塔/板块图缩到 128px、jpg 重压"""
import os
from PIL import Image

ROOT = r'F:\workspace\towerdefence'

def shrink_png(path, maxdim):
    im = Image.open(path)
    w, h = im.size
    if im.mode == 'P':
        im = im.convert('RGBA')
    sc = min(1.0, maxdim / max(w, h))
    if sc < 1.0:
        im = im.resize((max(1, int(w * sc)), max(1, int(h * sc))), Image.LANCZOS)
        im.save(path, 'PNG', optimize=True)
        return os.path.getsize(path)
    return os.path.getsize(path)

# anim 爆炸雪碧图（10 帧横条 2560 宽 → 1280，帧切分按比例仍正确）
for f in ['anim_explosion_blue.png', 'anim_explosion_green.png', 'anim_explosion_orange.png']:
    p = os.path.join(ROOT, 'images', 'anims', f)
    if os.path.exists(p):
        s = shrink_png(p, 1280)
        print('%s -> %.0fKB' % (f, s / 1024))

# 敌人 / 塔 / 板块图 128px
for sub, files in [
    ('enemies', ['tank.png', 'runner.png']),
    ('towers', ['poison.png', 'cannon.png']),
    ('board', ['ice.png', 'electric.png', 'fire.png', 'poison.png']),
]:
    for f in files:
        p = os.path.join(ROOT, 'images', sub, f)
        if os.path.exists(p):
            s = shrink_png(p, 128)
            print('%s/%s -> %.0fKB' % (sub, f, s / 1024))
print('done')
