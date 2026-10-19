#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《消消防线》图片素材准备脚本
从生成素材 URL 下载 → 白底转透明 → 缩放 → 输出到 images/ 目录。
可重复运行（幂等）。
"""
import os
import sys
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, 'images', '_raw')

# (远端URL, 输出相对路径, 目标尺寸(w,h))
ASSETS = [
    ('https://aka.doubaocdn.com/s/cRgVrkp7tR',  'images/towers/fire.png',       (64, 64)),
    ('https://aka.doubaocdn.com/s/TW5lgYz0b9',  'images/towers/ice.png',        (64, 64)),
    ('https://aka.doubaocdn.com/s/m2MOoNnVbY',  'images/towers/poison.png',     (64, 64)),
    ('https://aka.doubaocdn.com/s/c6UlR6WZvG',  'images/towers/electric.png',   (64, 64)),
    ('https://aka.doubaocdn.com/s/Tw0F2SxvMf',  'images/towers/boomerang.png',  (64, 64)),
    ('https://aka.doubaocdn.com/s/mKpEs1B6UI',  'images/enemies/normal.png',    (72, 72)),
    ('https://aka.doubaocdn.com/s/V7U0v2lzXN',  'images/enemies/boss.png',      (128, 128)),
    ('https://aka.doubaocdn.com/s/8FUUYU49en',  'images/ui/coin.png',           (80, 80)),
]


def download(url, dest):
    if os.path.exists(dest):
        print(f'  [skip] 已存在 {dest}')
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f'  [dl] {url} -> {dest}')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, 'wb') as f:
        f.write(r.read())


def white_to_alpha(img):
    """白底转透明：min(RGB) 越高越接近白色 → alpha 越低。保留主体高光半透明。"""
    import numpy as np
    arr = np.array(img.convert('RGBA')).astype(np.int16)
    mn = arr[..., :3].min(axis=2)              # 0..255
    alpha = np.clip((mn - 190) / 50.0, 0.0, 1.0)  # mn<=190 不透明；mn>=240 全透明
    arr[..., 3] = (255 * (1 - alpha)).astype(np.uint8)
    # 裁掉透明边缘，贴近主体
    out = np.array(arr).astype(np.uint8)
    return Image.fromarray(out)


def crop_alpha(img):
    """按 alpha 包围盒裁切，去掉多余白边。"""
    import numpy as np
    a = np.array(img)[..., 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return img
    x0, x1 = xs.min(), xs.max() + 1
    y0, y1 = ys.min(), ys.max() + 1
    return img.crop((x0, y0, x1, y1))


def main():
    for url, rel, size in ASSETS:
        raw = os.path.join(RAW_DIR, os.path.basename(rel).replace('.png', '_raw.png'))
        download(url, raw)
        out_path = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        if os.path.exists(out_path):
            print(f'  [skip] 已存在 {rel}')
            continue
        img = Image.open(raw)
        img = white_to_alpha(img)
        img = crop_alpha(img)
        # 保持正方形画布：以最大边为基准，居中放置（便于游戏内等距绘制）
        w, h = size
        side = max(w, h)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        resized = img.resize((w, h), Image.LANCZOS)
        canvas.paste(resized, (0, 0), resized)
        canvas.save(out_path)
        print(f'  [out] {rel} {canvas.size}')
    print('素材准备完成。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
