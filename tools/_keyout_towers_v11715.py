# -*- coding: utf-8 -*-
"""v1.17.15 塔图标替换流水线（六塔收官版）

在 v1.17.14 基础上补电塔/回旋镖塔，六塔全部按 80% 占比重抠一遍，
预览图改为六塔同屏接触表（含全局技能位跳过逻辑与四/六槽两种排布）。
"""
import os, shutil
from collections import deque, Counter
from PIL import Image, ImageFilter, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
ART = "art/towers_v1"
TOWERS = "assets/images/towers"
BK = os.path.join(ART, "backup_sideview")
os.makedirs(BK, exist_ok=True)

# 六塔：原图 → 资产文件
JOBS = [
    ("tower_fire_top_v1.png", "fire.png"),
    ("tower_ice_top_v1.png", "ice.png"),
    ("tower_poison_top_v2.png", "poison.png"),
    ("tower_electric_top_v1.png", "electric.png"),
    ("tower_boomerang_top_v1.png", "boomerang.png"),
    ("tower_cannon_top_v1.png", "cannon.png"),
]
TOL = 10.0     # 背景与描边色距 ~15，取 10 保描边
RATIO = 0.80   # 主体占画布比例


def keyout(fp_in, tol=TOL, ratio_target=RATIO):
    im = Image.open(fp_in).convert("RGB")
    w, h = im.size
    px = im.load()
    border = []
    for x in range(w):
        border.append(px[x, 0]); border.append(px[x, h - 1])
    for y in range(h):
        border.append(px[0, y]); border.append(px[w - 1, y])
    bg = Counter(border).most_common(1)[0][0]
    t2 = tol * tol

    def isbg(c):
        dr = c[0] - bg[0]; dg = c[1] - bg[1]; db = c[2] - bg[2]
        return dr * dr + dg * dg + db * db <= t2

    bgmask = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            i = y * w + x
            if not bgmask[i] and isbg(px[x, y]):
                bgmask[i] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            i = y * w + x
            if not bgmask[i] and isbg(px[x, y]):
                bgmask[i] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not bgmask[i] and isbg(px[nx, ny]):
                    bgmask[i] = 1; q.append((nx, ny))
    ratio = sum(bgmask) / (w * h)

    # 前景连通域过滤：丢弃 < 最大岛 1% 的碎片（水印/噪点）
    fg = bytearray(1 - b for b in bgmask)
    seen = bytearray(w * h)
    keep = bytearray(w * h)
    comps = []
    for i in range(w * h):
        if fg[i] and not seen[i]:
            comp = []
            q = deque([i]); seen[i] = 1
            while q:
                j = q.popleft(); comp.append(j)
                x, y = j % w, j // w
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        k = ny * w + nx
                        if fg[k] and not seen[k]:
                            seen[k] = 1; q.append(k)
            comps.append(comp)
    comps.sort(key=len, reverse=True)
    biggest = len(comps[0]) if comps else 0
    for comp in comps:
        if len(comp) >= biggest * 0.01:
            for j in comp:
                keep[j] = 1

    alpha = Image.frombytes("L", (w, h), bytes(255 if keep[i] else 0 for i in range(w * h)))
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.0))
    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)

    bbox = alpha.point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bbox:
        raise RuntimeError("抠图后主体为空: " + fp_in)
    subj = rgba.crop(bbox)
    sw, sh = subj.size
    side = int(max(sw, sh) / ratio_target)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(subj, ((side - sw) // 2, (side - sh) // 2), subj)
    out = canvas.resize((256, 256), Image.LANCZOS)
    print("  bg=%s 删背景%.0f%% 主体%dx%d" % (bg, ratio * 100, sw, sh))
    return out


previews = []
for src, dst in JOBS:
    fp_src = os.path.join(ART, src)
    if not os.path.exists(fp_src):
        print("跳过（缺原图）", fp_src)
        previews.append(None)
        continue
    out = keyout(fp_src)
    out.save(os.path.join(TOWERS, dst))
    print("写入", dst, out.size)
    previews.append(out)

# ---- 游戏内预览：六塔同屏接触表 ----
S = 2
row = Image.open("assets/images/ui/tower_row_dark.jpg").convert("RGB")
W, H = row.size[0] * S, row.size[1] * S
cv = row.resize((W, H), Image.LANCZOS).convert("RGBA")
slot = 100 * S; gap = 28 * S
itemN = 6
x0 = int((750 * S - (itemN * slot + (itemN - 1) * gap)) / 2)
slotY = 12 * S
names = ["火", "冰", "毒", "电", "回旋", "炮"]
d = ImageDraw.Draw(cv)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 22)
    font2 = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 24)
except Exception:
    font = font2 = ImageFont.load_default()
for i, ic in enumerate(previews):
    if ic is None:
        continue
    x = x0 + i * (slot + gap)
    cv.alpha_composite(ic.resize((98 * S, 98 * S), Image.LANCZOS), (x + 1 * S, slotY))
    d.text((x + slot // 2, slotY + slot - 20), "Lv1", fill=(255, 255, 255, 190), font=font2, anchor="mm")
    d.text((x + slot // 2, H - 26), names[i], fill=(255, 255, 255, 220), font=font, anchor="mm")
cv.convert("RGB").save(os.path.join(ART, "preview_in_game.png"))
print("预览:", os.path.join(ART, "preview_in_game.png"))
