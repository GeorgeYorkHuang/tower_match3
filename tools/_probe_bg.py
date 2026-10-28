# -*- coding: utf-8 -*-
"""探测基准图背景色与描边差异，判断能否安全 flood-fill 抠图"""
import sys
from PIL import Image
from collections import Counter

for fp in ["art/towers_v1/tower_fire_top_v1.png", "art/towers_v1/tower_cannon_top_v1.png"]:
    im = Image.open(fp).convert("RGB")
    w, h = im.size
    px = im.load()
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    print("=" * 60)
    print(fp, im.size)
    print("  四角:", corners)
    # 边缘一圈的众数（判断背景是否均匀）
    edge = []
    for x in range(0, w, 4):
        edge.append(px[x, 2]); edge.append(px[x, h - 3])
    for y in range(0, h, 4):
        edge.append(px[2, y]); edge.append(px[w - 3, y])
    c = Counter(edge)
    print("  边缘众数 top3:", c.most_common(3))
    # 最暗像素（描边）统计
    dark = [p for p in edge if sum(p) < 120]
    print("  边缘暗像素(<120)占比: %.1f%%" % (100.0 * len(dark) / len(edge)))
    # 中心区域颜色
    print("  中心:", px[w // 2, h // 2])
