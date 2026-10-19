# -*- coding: utf-8 -*-
"""城墙整图缩小到 750x60（不裁剪，完整保留上下垛口+砖面）"""
from PIL import Image
import urllib.request, os

ui = r"F:\workspace\towerdefence\images\ui"
prev = os.path.join(ui, "wall.jpg")
bak = os.path.join(ui, "wall_old_crop.jpg")
if os.path.exists(prev) and not os.path.exists(bak):
    os.rename(prev, bak)

tmp = os.path.join(ui, "_raw_wall_scale.jpg")
urllib.request.urlretrieve("https://aka.doubaocdn.com/s/oMeekMRsAl", tmp)
im = Image.open(tmp).convert("RGB")
print("orig", im.size)
out = im.resize((750, 60), Image.LANCZOS)  # 整图缩小到目标条带，完整内容保留
out.save(prev, "JPEG", quality=92)
os.remove(tmp)
print("saved", prev, out.size)
