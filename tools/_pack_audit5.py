# -*- coding: utf-8 -*-
"""统计 images 各子目录文件数与总大小"""
import os

ROOT = r'F:\workspace\towerdefence'
for sub in sorted(os.listdir(os.path.join(ROOT, 'images'))):
    p = os.path.join(ROOT, 'images', sub)
    if not os.path.isdir(p):
        continue
    n = 0; t = 0
    for root, dirs, files in os.walk(p):
        for f in files:
            s = os.path.getsize(os.path.join(root, f))
            n += 1; t += s
    print('%-12s %5d files  %7.1f MB' % (sub, n, t / 1048576))
