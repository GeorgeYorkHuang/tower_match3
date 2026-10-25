# -*- coding: utf-8 -*-
"""列出 images 保留项中 >300KB 的文件，定位包体大头"""
import os

ROOT = r'F:\workspace\towerdefence'
big = []
for root, dirs, files in os.walk(os.path.join(ROOT, 'images')):
    for f in files:
        p = os.path.join(root, f)
        s = os.path.getsize(p)
        if s > 300 * 1024:
            rel = os.path.relpath(p, ROOT)
            skip = '_raw.png' in f or f == 'chest.png' or 'debuff' in os.path.normpath(root).split(os.sep)
            if not skip:
                big.append((s, rel))

big.sort(reverse=True)
total = sum(s for s, _ in big)
print('keep >300KB files: %d, total %.1f MB' % (len(big), total / 1048576))
for s, r in big[:40]:
    print('  %.2f MB %s' % (s / 1048576, r))
