# -*- coding: utf-8 -*-
# 圣遗物 AI 图标尺寸归一化：检测徽章边界 -> 方形裁切 -> 512x512 统一尺寸 + 圆角透明
# 用法: python normalize_relic_icons.py <raw分类目录> <输出目录> <分类前缀>
import sys, os
from PIL import Image, ImageDraw

IN_DIR, OUT_DIR, PREFIX = sys.argv[1], sys.argv[2], sys.argv[3]
SIZE, BADGE, RADIUS = 512, 448, 92
THR = 45  # 徽章亮度阈值（背景为极暗色）

os.makedirs(OUT_DIR, exist_ok=True)
files = sorted(f for f in os.listdir(IN_DIR) if f.lower().endswith('.png'))
assert len(files) > 0, 'no input images'

stats = []
for i, fn in enumerate(files, 1):
    img = Image.open(os.path.join(IN_DIR, fn)).convert('RGB')
    w, h = img.size
    px = img.load()
    # 背景参考：四角采样
    corners = [px[x, y] for x, y in [(8, 8), (w - 9, 8), (8, h - 9), (w - 9, h - 9)]]
    bg = max(max(c) for c in corners)
    thr = max(THR, bg * 2 + 15)
    # 亮度蒙版 bbox
    minx, miny, maxx, maxy = w, h, 0, 0
    step = 4  # 采样步长加速
    y_limit = int(h * 0.90)  # 排除底部留白区（水印所在），徽章锚点 v1.1 不会进入该区
    for y in range(0, y_limit, step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            if max(r, g, b) > thr:
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    bw, bh = maxx - minx, maxy - miny
    # 兜底：检测结果异常时用固定中心裁切
    if bw < w * 0.4 or bh < h * 0.4 or bw > w * 0.98 or bh > h * 0.98:
        cx, cy, side = w // 2, int(h * 0.46), int(w * 0.82)
        minx, miny, maxx, maxy = cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2
        bw = bh = side
        fallback = True
    else:
        fallback = False
    # 强制正方形（以较长边为准，绕 bbox 中心扩展）
    side = max(bw, bh)
    cx, cy = (minx + maxx) // 2, (miny + maxy) // 2
    half = side // 2
    box = (max(0, cx - half), max(0, cy - half), min(w, cx + half), min(h, cy + half))
    while box[2] - box[0] < side and box[0] > 0: box = (box[0] - 1, box[1], box[2], box[3])
    while box[3] - box[1] < side and box[1] > 0: box = (box[0], box[1] - 1, box[2], box[3])
    while box[2] - box[0] < side and box[2] < w: box = (box[0], box[1], box[2] + 1, box[3])
    while box[3] - box[1] < side and box[3] < h: box = (box[0], box[1], box[2], box[3] + 1)
    badge = img.crop(box).resize((BADGE, BADGE), Image.LANCZOS)
    # 圆角透明画布
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    mask = Image.new('L', (BADGE, BADGE), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, BADGE - 1, BADGE - 1], radius=RADIUS, fill=255)
    canvas.paste(badge, ((SIZE - BADGE) // 2, (SIZE - BADGE) // 2), mask)
    out = os.path.join(OUT_DIR, f'{PREFIX}_{i:02d}.png')
    canvas.save(out)
    stats.append((fn, box, side, fallback))

# 接触表（4 列缩略图，检查一致性）
cols = 4
rows = (len(stats) + cols - 1) // cols
sheet = Image.new('RGBA', (cols * 140 + 20, rows * 140 + 20), (30, 30, 34, 255))
for i, fn in enumerate([s[0] for s in stats]):
    t = Image.open(os.path.join(OUT_DIR, f'{PREFIX}_{i+1:02d}.png')).resize((128, 128), Image.LANCZOS)
    sheet.alpha_composite(t, (20 + (i % cols) * 140, 20 + (i // cols) * 140))
sheet_path = os.path.join(OUT_DIR, f'sheet_{PREFIX}.png')
sheet.save(sheet_path)

print(f'{len(stats)} icons -> {OUT_DIR}')
for fn, box, side, fb in stats:
    print(f'{fn}: bbox_side={side} box={box}{" [FALLBACK]" if fb else ""}')
print(f'sheet -> {sheet_path}')
