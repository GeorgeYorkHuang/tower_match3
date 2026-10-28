# -*- coding: utf-8 -*-
"""v1.17.25 火柱 8 帧后处理(纯 PIL)：F1 灰底 keyout + 水印清除 -> 全局 bbox 对齐 -> 512x640 交付
生成图: art/fx_firepillar_v1/*.png (1024x1280)
交付:   assets/images/fx/firepillar/anim_firepillar_01..08.png (512x640)
"""
import os
from PIL import Image, ImageDraw, ImageFilter

SRC = r'F:/workspace/towerdefence/art/fx_firepillar_v1'
OUT = r'F:/workspace/towerdefence/assets/images/fx/firepillar'
FRAMES = {
    1: 'Keep_the_exact_same_art_style__2026-10-28T15-44-52.png',  # F1 圈·落印(灰底+水印)
    2: 'Keep_the_exact_same_art_style__2026-10-28T15-44-02.png',  # F2 聚·收束
    3: 'Keep_the_exact_same_art_style__2026-10-28T15-45-30.png',  # F3 生·立柱
    4: 'Remove_the_wide_burning_ground_2026-10-28T15-46-56.png',  # F4 冲·拔高
    5: 'Keep_the_exact_same_art_style__2026-10-28T15-47-36.png',  # F5 顶·满高
    6: '2D_game_VFX_sprite__stylized_c_2026-10-28T15-33-18.png',  # F6 扩·抵边(基准)
    7: 'Keep_the_exact_same_art_style__2026-10-28T15-48-17.png',  # F7 散·崩解
    8: 'Keep_the_exact_same_art_style__2026-10-28T15-48-50.png',  # F8 烬·余痕
}
TW, TH = 512, 640
MAGENTA = (255, 0, 255, 255)

def coverage(im):
    a = im.getchannel('A')
    hist = a.histogram()
    return sum(hist[9:]) / (im.size[0] * im.size[1])

def keyout_by_floodfill(im, thresh=55):
    """从边缘多点 flood-fill 将背景染洋红，再抠成透明。返回(处理图, 清除比例)。"""
    im = im.copy()
    w, h = im.size
    seeds = [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2),
             (w // 2, 1), (w // 2, h - 2), (1, h // 2), (w - 2, h // 2)]
    for s in seeds:
        try:
            ImageDraw.floodfill(im, s, MAGENTA, thresh=thresh)
        except Exception:
            pass
    px = im.load()
    cleared = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 200 and g < 90 and b > 200 and a > 0:
                px[x, y] = (r, g, b, 0)
                cleared += 1
    return im, cleared / (w * h)

def scrub_region(im, box, thr_s=40, thr_v=170):
    """区域内清除低饱和亮像素(水印白字/灰字残留)。"""
    x0, y0, x1, y1 = box
    px = im.load()
    cleared = 0
    for y in range(max(0, y0), min(im.size[1], y1)):
        for x in range(max(0, x0), min(im.size[0], x1)):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            if mx - mn < thr_s and mx > thr_v:
                px[x, y] = (r, g, b, 0)
                cleared += 1
    return im, cleared

def feather(im, radius=1):
    a = im.getchannel('A').filter(ImageFilter.GaussianBlur(radius))
    im.putalpha(a)
    return im

def main():
    os.makedirs(OUT, exist_ok=True)
    frames = {}
    print('== 1. load & alpha check ==')
    for n in sorted(FRAMES):
        im = Image.open(os.path.join(SRC, FRAMES[n])).convert('RGBA')
        cov = coverage(im)
        print(f'F{n}: {im.size} alpha_coverage={cov*100:.1f}%')
        if cov > 0.97:
            print('  -> nearly opaque, flood keyout...')
            im, ratio = keyout_by_floodfill(im, thresh=55)
            print(f'  cleared {ratio*100:.1f}% by floodfill')
            # 水印: F1 右下角
            w, h = im.size
            im, c1 = scrub_region(im, (w - 320, h - 140, w, h))
            print(f'  scrub watermark region: {c1} px')
            im = feather(im, 1)
        frames[n] = im

    print('== 2. global bbox union ==')
    boxes = {n: frames[n].getbbox() for n in sorted(frames)}
    for n, bx in boxes.items():
        print(f'F{n} bbox={bx}')
    x0 = min(b[0] for b in boxes.values()); y0 = min(b[1] for b in boxes.values())
    x1 = max(b[2] for b in boxes.values()); y1 = max(b[3] for b in boxes.values())
    uw, uh = x1 - x0, y1 - y0
    print(f'union bbox=({x0},{y0},{x1},{y1}) size={uw}x{uh} ratio={uw/uh:.3f}')

    scale = min((TW - 24) / uw, (TH - 22) / uh)
    cw, ch = int(round(uw * scale)), int(round(uh * scale))
    px = (TW - cw) // 2
    py = TH - 10 - ch
    print(f'scale={scale:.4f} content=({cw},{ch}) paste=({px},{py})')

    print('== 3. crop & resize & paste ==')
    total = 0
    for n in sorted(frames):
        crop = frames[n].crop((x0, y0, x1, y1)).resize((cw, ch), Image.LANCZOS)
        canvas = Image.new('RGBA', (TW, TH), (0, 0, 0, 0))
        canvas.paste(crop, (px, py), crop)
        out_path = os.path.join(OUT, f'anim_firepillar_{n:02d}.png')
        canvas.save(out_path, optimize=True)
        kb = os.path.getsize(out_path) / 1024
        total += kb
        print(f'F{n} -> anim_firepillar_{n:02d}.png ({kb:.0f} KB)')

    print('== 4. contact sheet ==')
    half = TW // 2
    cs = Image.new('RGBA', (half * 4, half * 2), (24, 20, 30, 255))
    for n in sorted(frames):
        im = Image.open(os.path.join(OUT, f'anim_firepillar_{n:02d}.png')).resize((half, int(half * TH / TW)), Image.LANCZOS)
        cs.paste(im, (((n - 1) % 4) * half, ((n - 1) // 4) * int(half * TH / TW)), im)
    cs_path = os.path.join(SRC, 'contact_sheet.png')
    cs.save(cs_path)
    print(f'contact sheet -> {cs_path}')
    print(f'== total {total:.0f} KB for 8 frames ==')

if __name__ == '__main__':
    main()
