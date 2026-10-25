# -*- coding: utf-8 -*-
"""审计：运行时实际引用（js 内 images/ 路径）的资源总大小 vs 小游戏 4MB 包上限"""
import os, re

ROOT = r'F:\workspace\towerdefence'
jsfiles = []
for root, dirs, files in os.walk(os.path.join(ROOT, 'js')):
    for f in files:
        if f.endswith('.js'):
            jsfiles.append(os.path.join(root, f))

refs = set()
pat = re.compile(r"""['"`](images/[^'"`]+?\.(?:png|jpg|jpeg))['"`]""")
for jf in jsfiles:
    txt = open(jf, encoding='utf-8', errors='ignore').read()
    for m in pat.findall(txt):
        refs.add(m)

total = 0
big = []
missing = []
for r in sorted(refs):
    p = os.path.join(ROOT, r)
    if os.path.exists(p):
        s = os.path.getsize(p)
        total += s
        if s > 200 * 1024:
            big.append((s, r))
    else:
        missing.append(r)

print('referenced files:', len(refs), ' total: %.1f MB' % (total / 1048576))
for s, r in sorted(big, reverse=True)[:20]:
    print('  %.2f MB %s' % (s / 1048576, r))
if missing:
    print('missing refs:', missing[:10])
