# -*- coding: utf-8 -*-
"""v1.16.75 包体治理：压缩运行时素材（圣遗物图标 128px、宝箱帧 256px、雪碧图 optimize），保留 raw 原图"""
import os
from PIL import Image

ROOT = r'F:\workspace\towerdefence'
report = []

def rel(p):
    return os.path.relpath(p, ROOT)

def compress(path, maxdim, quant=False, colors=256):
    """等比缩放到 maxdim 内并重存 PNG；quant=True 时尝试 colors 色调色板"""
    try:
        im = Image.open(path)
        if im.mode != 'RGBA':
            im = im.convert('RGBA')
        w, h = im.size
        scale = min(1.0, maxdim / max(w, h))
        if scale < 1.0:
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
        if quant:
            q = im.quantize(colors, method=Image.Quantize.FASTOCTREE).convert('RGBA')
            if q.size == im.size:
                # 量化后体积更小才采用
                import io
                b1, b2 = io.BytesIO(), io.BytesIO()
                im.save(b1, 'PNG', optimize=True)
                q.save(b2, 'PNG', optimize=True)
                if b2.tell() < b1.tell():
                    im = q
        im.save(path, 'PNG', optimize=True)
        new = os.path.getsize(path)
        report.append((rel(path), new))
        return new
    except Exception as e:
        print('ERR', rel(path), e)
        return None

# 1) 圣遗物单图（112 张）→ 96px 内 + 48 色量化（运行时仅 100px 圆内显示）
relic_total = 0
for root, dirs, files in os.walk(os.path.join(ROOT, 'images', 'relic')):
    for f in files:
        if f.startswith('sheet_') or f == 'mapping.json':
            continue  # sheet/mapping 不打包，跳过压缩
        p = os.path.join(root, f)
        s = compress(p, 96, quant=True, colors=48)
        if s:
            relic_total += s
print('relic singles new total: %.2f MB' % (relic_total / 1048576))

# 2) 宝箱 512 帧 → 256px 内（保留 RGBA 不量化保光泽）
chest_total = 0
for f in ['chest_closed.png', 'chest_quarter.png', 'chest_half.png', 'chest_fast.png', 'chest_open.png']:
    p = os.path.join(ROOT, 'images', 'ui', f)
    if os.path.exists(p):
        s = compress(p, 256, quant=False)
        if s:
            chest_total += s
print('chest frames new total: %.2f MB' % (chest_total / 1048576))

print('--- changed files (rel, new bytes) ---')
for r, s in sorted(report, key=lambda x: -x[1])[:8]:
    print('  %.2f KB %s' % (s / 1024, r))
