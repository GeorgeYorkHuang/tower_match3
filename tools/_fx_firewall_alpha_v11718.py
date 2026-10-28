# -*- coding: utf-8 -*-
"""v1.17.18 火墙帧转透明底（亮度通道 alpha）

为什么改：v1.17.17 用加法混合在暗底效果好，但严格比例验证发现：
1. 火焰的暗红底与深色描边在加法下全部丢失（发白发黄），卡通质感没了；
2. 远古战场/测试战场回退亮草地，加法冲淡更严重。
而现有爆炸精灵表是纯光斑所以适合加法，这张是带描边的卡通形体 → 改为
source-over 主体 + 轻量 lighter 辉光叠加（代码层）。

方法：黑底 RGB 帧 → alpha = f(亮度)（V-16 后线性拉满），颜色不动 → RGBA 透明帧。
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
FIN = "art/fx_firewall_v1/final"
DST = "assets/images/fx/firewall"

LO, HI = 16, 100   # 亮度 <16 全透明（黑底余量），>=HI 全不透明
for i in range(1, 5):
    im = Image.open(os.path.join(FIN, "anim_firewall_%02d.png" % i)).convert("RGB")
    r, g, b = im.split()
    v = Image.merge("RGB", (r, g, b)).convert("L")
    # alpha = clamp((V-LO) * 255/(HI-LO))
    lut = [max(0, min(255, int((x - LO) * 255 / (HI - LO)))) for x in range(256)]
    a = v.point(lut)
    rgba = Image.merge("RGBA", (r, g, b, a))
    rgba.save(os.path.join(FIN, "anim_firewall_%02d.png" % i))
    rgba.save(os.path.join(DST, "anim_firewall_%02d.png" % i))
    # 统计
    hist = a.histogram()
    transparent = sum(hist[:8]) / (512 * 160)
    opaque = sum(hist[248:]) / (512 * 160)
    print("帧%d: 透明像素%.0f%% 不透明%.0f%%" % (i, transparent * 100, opaque * 100))
print("OK ->", DST)
