# -*- coding: utf-8 -*-
"""v1.17.35 特殊方块资源构建：chroma2 定稿图(256) -> assets 分包(128, 压体积)

输入（art/special_blocks_v1/chroma2/，v1.17.34 已定稿验收）：
  chip_<shape>_neutral.png   中性灰玻璃体（body，运行时按来源色 source-atop 染色）
  chip_<shape>_mark.png      深色描边 + 中心刻印（mark，不染色，恒深）
  chip_rainbow.png           彩虹整图（自带六色环，不染、无 mark）
输出（assets/images/board/special/）：
  body_<shape>.png / mark_<shape>.png / body_rainbow.png

体量：显示端 56 逻辑 px（cell-4），最高 DPR 场景约 150 物理 px；128px 为
「清晰度 / 内存（每张 128² × 4B ≈ 64KB）」平衡点。离屏合成缓存按需生成。
"""
from PIL import Image
import os

DIR = 'F:/workspace/towerdefence/art/special_blocks_v1/chroma2'
OUT = 'F:/workspace/towerdefence/assets/images/board/special'
RES = 128                      # 输出边长
SHAPES = ['cross', 'split', 'sub', 'row', 'col', 'rand']
RAINBOW = 'rainbow'

os.makedirs(OUT, exist_ok=True)


def shrink(path):
    im = Image.open(path).convert('RGBA')
    if im.size != (RES, RES):
        im = im.resize((RES, RES), Image.LANCZOS)     # 与 body 同法缩放，保证叠加对齐
    return im


def clip_to_body(mark, body):
    """mark 的外缘抗锯齿像素会落到 body 透明区外（约 100px/图），按 body alpha 轻度膨胀后裁剪，
    避免运行时描边毛边浮在方块轮廓之外。"""
    from PIL import ImageFilter
    mask = body.split()[3].point(lambda a: 255 if a > 0 else 0)
    out = mark.copy()
    a = out.split()[3]
    a = Image.composite(a, Image.new('L', a.size, 0), mask)   # 只保留 mask 内
    out.putalpha(Image.eval(a, lambda v: v))
    return out


def save(im, name):
    p = os.path.join(OUT, name)
    im.save(p, optimize=True)
    return p, os.path.getsize(p)


total = 0
report = []
for s in SHAPES:
    b = shrink(os.path.join(DIR, 'chip_%s_neutral.png' % s))
    m = clip_to_body(shrink(os.path.join(DIR, 'chip_%s_mark.png' % s)), b)
    p1, n1 = save(b, 'body_%s.png' % s)
    p2, n2 = save(m, 'mark_%s.png' % s)
    total += n1 + n2
    report.append('%-6s body %6.1fKB  mark %6.1fKB' % (s, n1 / 1024, n2 / 1024))

rb = shrink(os.path.join(DIR, 'chip_rainbow.png'))
p3, n3 = save(rb, 'body_rainbow.png')
total += n3
report.append('%-6s body %6.1fKB' % (RAINBOW, n3 / 1024))

print('\n'.join(report))
print('files: %d  total: %.1fKB' % (len(SHAPES) * 2 + 1, total / 1024))

# 自检：mark 必须与 body 同尺寸且其不透明像素是 body 不透明像素的子集（叠加不会外溢）
bad = []
for s in SHAPES:
    b = Image.open(os.path.join(OUT, 'body_%s.png' % s)).convert('RGBA')
    m = Image.open(os.path.join(OUT, 'mark_%s.png' % s)).convert('RGBA')
    if b.size != m.size:
        bad.append('%s size mismatch' % s)
        continue
    bp, mp = b.load(), m.load()
    out = 0
    for y in range(RES):
        for x in range(RES):
            if mp[x, y][3] > 0 and bp[x, y][3] == 0:
                out += 1
    if out > 0:
        bad.append('%s mark 外溢 %d px' % (s, out))
print('selfcheck:', 'PASS' if not bad else 'FAIL ' + '; '.join(bad))
