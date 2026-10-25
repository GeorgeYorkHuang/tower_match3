# -*- coding: utf-8 -*-
# 宝箱三帧素材处理：下载透明帧 -> 统一 512x512 透明底
import os, urllib.request
from PIL import Image

base = r'F:\workspace\towerdefence\images\ui'
urls = {
    'chest_closed_raw': 'https://mediakit-image.cn-beijing.volces.com/tos-cn-i-mcagdqv95q/veImageX-store/imagesegment/1a9657b7-dbd0-4faa-bba9-99d176db5c62/4411ced34398dcaf4ff51ed65774557b37a6a9aa007d03a5f71ca6d04c3b2a2c.png~tplv-mcagdqv95q-image.image?sign=1792912789-rand-imagex-bcb5b6b44f2cd9d55a984fad49f10fcc',
    'chest_open_raw': 'https://mediakit-image.cn-beijing.volces.com/tos-cn-i-mcagdqv95q/veImageX-store/imagesegment/32464cad-1c53-4d82-944a-d2fc8774ffbb/576769d3abca5fc9cedf175e17a50f088a327746c91543345acc6b14b3a8e29f.png~tplv-mcagdqv95q-image.image?sign=1792912797-rand-imagex-efc678b2f5ca810bb52dcd86d8d925b4',
}
for name, url in urls.items():
    p = os.path.join(base, name + '.png')
    urllib.request.urlretrieve(url, p)
    print('downloaded', name)

# 三帧统一 512x512 透明底
jobs = [('chest_closed_raw', 'chest_closed'), ('chest_open_raw', 'chest_open'), ('chest', 'chest_half')]
for src, dst in jobs:
    im = Image.open(os.path.join(base, src + '.png')).convert('RGBA')
    im = im.resize((512, 512), Image.LANCZOS)
    out = os.path.join(base, dst + '.png')
    im.save(out)
    print(dst, im.size, im.mode, im.getbbox(), os.path.getsize(out))
