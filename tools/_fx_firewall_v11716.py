# -*- coding: utf-8 -*-
"""v1.17.16 火墙技能 4 帧动画后处理

输入: art/fx_firewall_v1/anim_firewall_01..04.png (1536x1024 黑底原图)
输出:
  - final/anim_firewall_01..04.png  512x160 黑底(加法混合), 四帧同一裁剪框保证逐像素对齐
  - contact_sheet.png               四帧横排接触表(带帧号)
  - preview_loop.gif                12fps 循环预览
  - preview_in_game.png             战场背景 + 加法混合合成模拟

规格: 12fps × 4 帧 = 0.333s 循环; 混合=lighter(加法), 黑底即透明; 游戏内 180x56 逻辑px 绘制
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SRC = "art/fx_firewall_v1"
FIN = os.path.join(SRC, "final")
os.makedirs(FIN, exist_ok=True)

N = 4
CW, CH = 512, 160          # 单帧画布
FPS = 12
RAW = [Image.open(os.path.join(SRC, "anim_firewall_%02d.png" % i)).convert("RGB") for i in range(1, N + 1)]

# 0) 预清理：
#    a. 右下角「AI生成」水印是低饱和灰白像素（R≈B），而火墙地面余焰是高饱和橙（R>>B）
#       → 在右下角区域内只把 低色差+有亮度 的像素压成黑，保住橙色余焰
#    b. 原图黑底非纯黑(≈10-15)，加法混合下会形成可见面板 → 全帧减 14 的地板
FLOOR = 14
def clean(im):
    w, h = im.size
    px = im.load()
    x0, y0 = int(w * 0.60), int(h * 0.86)          # 水印区域（右下角）
    for y in range(y0, h):
        for x in range(x0, w):
            r, g, b = px[x, y]
            if abs(r - b) < 35 and max(r, g, b) > 25:   # 低饱和且有亮度 → 水印灰
                px[x, y] = (0, 0, 0)
    return im.point(lambda v: max(0, v - FLOOR))        # 黑底地板

RAW = [clean(im) for im in RAW]

# 1) 全局 bbox（四帧用同一框，保证火焰逐像素对齐不跳）
TH = 14  # 低于此亮度的视为黑底
def bbox_of(im):
    g = im.convert("L").point(lambda v: 255 if v > TH else 0)
    return g.getbbox()

boxes = [bbox_of(im) for im in RAW]
l = min(b[0] for b in boxes); t = min(b[1] for b in boxes)
r = max(b[2] for b in boxes); b = max(b[3] for b in boxes)
print("全局裁剪框:", (l, t, r, b))

crops = [im.crop((l, t, r, b)) for im in RAW]
cw, ch = crops[0].size
print("裁剪后尺寸:", cw, "x", ch)

# 2) 统一到 512x160：宽度铺满（火焰是全宽条带），高度居中
scale = CW / cw
newW, newH = CW, max(1, int(round(ch * scale)))
if newH > CH:
    # 极端情况裁不到，等比缩小
    scale = CH / ch
    newW, newH = max(1, int(round(cw * scale))), CH
frames = []
for c in crops:
    c2 = c.resize((newW, newH), Image.LANCZOS)
    cv = Image.new("RGB", (CW, CH), (0, 0, 0))
    cv.paste(c2, ((CW - newW) // 2, (CH - newH) // 2))
    frames.append(cv)

for i, f in enumerate(frames, 1):
    f.save(os.path.join(FIN, "anim_firewall_%02d.png" % i))
    print("写入 final/anim_firewall_%02d.png %s" % (i, f.size))

# 3) 接触表（黑底上直接横排 + 帧号）
sheet = Image.new("RGB", (CW * N + (N + 1) * 8, CH + 56), (10, 8, 14))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 20)
except Exception:
    font = ImageFont.load_default()
for i, f in enumerate(frames):
    x = 8 + i * (CW + 8)
    sheet.paste(f, (x, 8))
    d.text((x + CW // 2, CH + 30), "frame %d  t=%.3fs" % (i, (i - 1) / FPS),
           fill=(220, 210, 200), font=font, anchor="mm")
sheet.save(os.path.join(SRC, "contact_sheet.png"))
print("接触表:", os.path.join(SRC, "contact_sheet.png"), sheet.size)

# 4) GIF 循环预览（12fps）
frames[0].save(os.path.join(SRC, "preview_loop.gif"), save_all=True,
               append_images=frames[1:], duration=int(1000 / FPS), loop=0)
print("GIF:", os.path.join(SRC, "preview_loop.gif"))

# 5) 游戏内模拟：暗紫战场底 + 石板路 + 加法混合叠加火墙（放 2 倍便于查看）
S = 2
mw, mh = 750 * S, 500 * S
mock = Image.new("RGB", (mw, mh), (23, 18, 31))
md = ImageDraw.Draw(mock)
md.rectangle([0, 0, mw, 60 * S], fill=(14, 11, 20))                      # 顶栏
md.rectangle([0, mh - 110 * S, mw, mh], fill=(30, 24, 42))               # 塔位区
for gy in range(150 * S, mh - 120 * S, 90 * S):                          # 石板横缝
    md.line([(0, gy), (mw, gy)], fill=(30, 23, 40), width=2)
md.line([(0, 120 * S), (mw, 120 * S)], fill=(255, 112, 67, 60), width=2) # 出怪线
# 四个示例位置：同一动画不同相位叠在路面上（模拟多段火墙/停留效果）
for k in range(4):
    f = frames[k]
    w2, h2 = 360 * S, int(160 * S * (360 / 512) * 1.6)  # 180逻辑宽的2倍展示 + 焰高放宽
    f2 = f.resize((w2, h2), Image.LANCZOS)
    x = int(mw * (0.12 + 0.24 * k)); y = 200 * S
    region = mock.crop((x, y, x + w2, y + h2))
    lit = ImageChops.add(region, f2)                                     # 加法混合
    mock.paste(lit, (x, y))
try:
    mfont = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18)
except Exception:
    mfont = ImageFont.load_default()
md.text((mw // 2, mh - 60 * S), "游戏内模拟 · 加法混合(lighter) · 180x56 逻辑px @2x",
        fill=(200, 195, 210), font=mfont, anchor="mm")
mock.save(os.path.join(SRC, "preview_in_game.png"))
print("游戏内模拟:", os.path.join(SRC, "preview_in_game.png"), mock.size)
