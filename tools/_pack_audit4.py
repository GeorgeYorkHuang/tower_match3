# -*- coding: utf-8 -*-
"""列出 images 非 relic 目录中 >150KB 的文件"""
import os

ROOT = r'F:\workspace\towerdefence'
big = []
for root, dirs, files in os.walk(os.path.join(ROOT, 'images')):
    if 'relic' in os.path.normpath(root).split(os.sep):
        continue
    for f in files:
        p = os.path.join(root, f)
        s = os.path.getsize(p)
        if s > 150 * 1024:
            rel = os.path.relpath(p, ROOT)
            big.append((s, rel))

big.sort(reverse=True)
total = sum(s for s, _ in big)
print('non-relic >150KB: %d files, total %.1f MB' % (len(big), total / 1048576))
for s, r in big[:40]:
    print('  %.2f MB %s' % (s / 1048576, r))
