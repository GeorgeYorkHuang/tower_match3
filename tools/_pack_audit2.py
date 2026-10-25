# -*- coding: utf-8 -*-
"""精确计算 packOptions.ignore 排除未引用资源后的最终包体"""
import os

ROOT = r'F:\workspace\towerdefence'

def dirsize(d):
    t = 0
    for root, dirs, files in os.walk(d):
        for f in files:
            t += os.path.getsize(os.path.join(root, f))
    return t

# 排除清单（未运行时引用 / 开发产物 / 超大源图）
EXCLUDE_SUB = ['_raw.png', 'chest.png']  # 文件名含这些即排除（chest.png 4MB 合成图未引用）
EXCLUDE_DIRS = [  # 目录名排除（debuff 帧 emoji 渲染未用）
    'debuff',
]

def classify():
    keep = 0; excl = 0; detail = []
    for root, dirs, files in os.walk(os.path.join(ROOT, 'images')):
        for f in files:
            p = os.path.join(root, f)
            s = os.path.getsize(p)
            rel = os.path.relpath(p, ROOT)
            skip = any(x in f for x in EXCLUDE_SUB) or any(d in os.path.normpath(root).split(os.sep) for d in EXCLUDE_DIRS)
            if skip:
                excl += s
                if s > 300*1024: detail.append(('EXCL', rel, s))
            else:
                keep += s
    return keep, excl, detail

keep, excl, detail = classify()
print('keep images: %.1f MB' % (keep/1048576))
print('excluded images: %.1f MB' % (excl/1048576))
for tag, rel, s in sorted(detail, key=lambda x: -x[2])[:12]:
    print('  [%s] %.2f MB %s' % (tag, s/1048576, rel))

# 其他目录
for d in ['js', 'tools', 'game.js', 'game.json', 'project.config.json', 'app.json']:
    p = os.path.join(ROOT, d)
    if os.path.isdir(p):
        print('%-6s %.1f MB' % (d, dirsize(p)/1048576))
    elif os.path.isfile(p):
        print('%-6s %.2f MB' % (d, os.path.getsize(p)/1048576))
