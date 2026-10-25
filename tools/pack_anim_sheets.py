# -*- coding: utf-8 -*-
# 合精灵表：images/anims/<set>/<variant>/*.png -> images/anims/<set>_<variant>.png（横向条带）
# 同时更新 frames.json（补 sheet 字段）
import sys, os, json
from PIL import Image

ROOT = r'F:/workspace/towerdefence/images/anims'

def main():
    manifest = json.load(open(os.path.join(ROOT, 'frames.json'), encoding='utf8'))
    total = 0
    for s in manifest['sets']:
        for variant in s['variants']:
            d = os.path.join(ROOT, s['name'], variant)
            files = sorted(f for f in os.listdir(d) if f.endswith('.png'))
            if not files:
                continue
            imgs = [Image.open(os.path.join(d, f)).convert('RGBA') for f in files]
            w, h = imgs[0].size
            assert all(i.size == (w, h) for i in imgs), f'size mismatch in {d}'
            sheet = Image.new('RGBA', (w * len(imgs), h), (0, 0, 0, 0))
            for i, im in enumerate(imgs):
                sheet.alpha_composite(im, (i * w, 0))
            out = os.path.join(ROOT, f"{s['name']}_{variant}.png")
            # 降档：量化到 192 色（RGBA 八叉树），发光渐变视觉无损、体积减半以上
            q = sheet.quantize(colors=192, method=Image.FASTOCTREE, dither=Image.NONE)
            q.save(out, optimize=True)
            kb = os.path.getsize(out) / 1024
            total += kb
            print(f"{s['name']}_{variant}.png  {w}x{h} x{len(imgs)}f  {kb:.0f}KB")
    print(f'total sheets: {total:.0f}KB')

if __name__ == '__main__':
    main()
