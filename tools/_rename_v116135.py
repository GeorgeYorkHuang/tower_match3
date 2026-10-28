# -*- coding: utf-8 -*-
"""v1.16.135 更名：消消防线 → 深窟远征（仅 js 源码与 README，文档文件名引用不动）。一次性工具。"""
import io

files = [
    'js/loading.js',
    'js/config.js',
    'js/game/main.js',
    'js/game/canvas.js',
    'js/game/render.js',
    'README.md',
]
for fp in files:
    src = io.open(fp, encoding='utf-8').read()
    n = src.count('消消防线')
    if n:
        io.open(fp, 'w', encoding='utf-8', newline='').write(src.replace('消消防线', '深窟远征'))
        print(f"{fp}: {n} 处替换")
    else:
        print(f"{fp}: 无")
