# -*- coding: utf-8 -*-
"""v1.17.13 塔图标替换流水线
1. 备份现有侧视塔贴图
2. 对火塔/炮塔基准图做 flood-fill 抠图（只删与边缘连通的背景，保住深色描边）
3. 滤掉水印小岛 → 裁边 → 居中 92% → 256x256 → 覆盖 assets/images/towers/
4. 合成游戏内预览图（tower_row_dark 背景 + 4 槽：新火/新炮/旧冰/旧毒对照）
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

JOBS = [
    ("tower_fire_top_v1.png", "fire.png"),
    ("tower_cannon_top_v1.png", "cannon.png"),
]
TOL = 10.0  # 背景与描边色距 ~15，取 10 保描边

def keyout(fp_in, tol=TOL):
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
    removed = sum(bgmask)
    ratio = removed / (w * h)
    if ratio > 0.60:
        print("  [WARN] 背景删除占比 %.0f%%，疑似描边漏色（检查 tol）" % (ratio * 100))
    # 前景连通域过滤：只保留 >= 最大连通域 1% 的岛（清掉水印/噪点）
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
    dropped = biggest and (len(fg) - sum(keep)) or 0
    # alpha 通道 + 羽化 1px
    alpha = Image.frombytes("L", (w, h), bytes(255 if keep[i] else 0 for i in range(w * h)))
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.0))
    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)
    # 裁边 + 居中 92% + 256 输出
    bbox = alpha.point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bbox:
        raise RuntimeError("抠图后主体为空: " + fp_in)
    subj = rgba.crop(bbox)
    sw, sh = subj.size
    side = int(max(sw, sh) / 0.92)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(subj, ((side - sw) // 2, (side - sh) // 2), subj)
    out = canvas.resize((256, 256), Image.LANCZOS)
    print("  bg=%s 删背景%.0f%% 弃岛%dpx 主体%dx%d" % (bg, ratio * 100, dropped, sw, sh))
    return out

previews = []
for src, dst in JOBS:
    old = os.path.join(TOWERS, dst)
    if os.path.exists(old):
        shutil.copy2(old, os.path.join(BK, dst))
        print("备份 %s -> backup_sideview/" % dst)
    out = keyout(os.path.join(ART, src))
    out.save(os.path.join(TOWERS, dst))
    print("写入", os.path.join(TOWERS, dst), out.size)
    previews.append(out)

# ---- 游戏内预览合成：tower_row_dark 背景 + 4 槽（新火/新炮/旧冰/旧毒 对照）----
S = 2  # 2x 放大便于查看
row = Image.open("assets/images/ui/tower_row_dark.jpg").convert("RGB")
W, H = row.size[0] * S, row.size[1] * S
cv = row.resize((W, H), Image.LANCZOS).convert("RGBA")
slot = 100 * S; gap = 28 * S
itemN = 6
x0 = int((750 * S - (itemN * slot + (itemN - 1) * gap)) / 2)
slotX0 = x0 + slot + gap  # 跳过左侧洗牌按钮
slotY = 12 * S
icons = [previews[0], previews[1],
         Image.open(os.path.join(TOWERS, "ice.png")).convert("RGBA"),
         Image.open(os.path.join(TOWERS, "poison.png")).convert("RGBA")]
names = ["火塔·新俯视", "炮塔·新俯视", "冰塔·旧侧视", "毒塔·旧侧视"]
d = ImageDraw.Draw(cv)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 20)
except Exception:
    font = ImageFont.load_default()
for i, (ic, nm) in enumerate(zip(icons, names)):
    x = slotX0 + i * (slot + gap)
    cv.alpha_composite(ic.resize((98 * S, 98 * S), Image.LANCZOS), (x + 1 * S, slotY))
    d.text((x + slot // 2, slotY + slot - 20), "Lv1", fill=(255, 255, 255, 190),
           font=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 22), anchor="mm")
    d.text((x + slot // 2, H - 26), nm, fill=(255, 255, 255, 220), font=font, anchor="mm")
cv.convert("RGB").save(os.path.join(ART, "preview_in_game.png"))
print("预览:", os.path.join(ART, "preview_in_game.png"))
