# -*- coding: utf-8 -*-
"""v1.17.17 火墙接入后的严格比例合成图

按游戏真实尺寸合成：逻辑 750 宽、2 倍图输出；火墙 w=180 逻辑、h=45，贴图 180x56 底边贴地面线。
用于判断接入后的实际观感（上一次 mock 放大了 2 倍，不代表真实比例）。
"""
import os
from PIL import Image, ImageDraw, ImageChops, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
S = 2  # 2 倍图

bg = Image.open("assets/images/ui/field_bg_lava.jpg").convert("RGB")
bg = bg.resize((750 * S, int(bg.size[1] * S)), Image.LANCZOS)
W, H = bg.size
cv = bg.copy()
d = ImageDraw.Draw(cv)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 22)
except Exception:
    font = ImageFont.load_default()

wall_w, wall_h = 180, 45
sprite_h = round(wall_w * 160 / 512)          # = 56
frames = [Image.open("art/fx_firewall_v1/final/anim_firewall_%02d.png" % i).convert("RGBA") for i in range(1, 5)]

# 三条火墙：中段两条（真实尺寸、不同相位），模拟 source-over 主体 + 45% lighter 辉光
spots = [(int(W * 0.30), int(H * 0.34), 0), (int(W * 0.30), int(H * 0.58), 1)]
for cx, cy, fi in spots:
    f = frames[fi]
    sw, sh = wall_w * S, sprite_h * S
    f2 = f.resize((sw, sh), Image.LANCZOS)
    x = int(cx - sw / 2)
    y = int(cy + wall_h * S / 2 - sh)
    region = cv.crop((x, y, x + sw, y + sh)).convert("RGBA")
    # 主体 source-over
    comp = Image.alpha_composite(region, f2)
    # 辉光：RGB 加法 45%
    glow_rgb = Image.new("RGB", f2.size, (0, 0, 0))
    fr, fg, fb, fa = f2.split()
    glow_rgb.paste(Image.merge("RGB", (fr, fg, fb)), (0, 0), fa)
    base_rgb = comp.convert("RGB")
    lit = ImageChops.add(base_rgb, glow_rgb.point(lambda v: int(v * 0.45)))
    comp = Image.alpha_composite(comp, Image.merge("RGBA", (*lit.split(), Image.new("L", f2.size, 255))))
    cv.paste(comp.convert("RGB"), (x, y))
    # 地面余焰红晕（代码层 ellipse）
    glow = Image.new("RGBA", (int(wall_w * S * 1.1), int(wall_h * S)), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([0, 0, glow.size[0] - 1, glow.size[1] - 1], fill=(255, 112, 67, 40))
    gx = int(cx - glow.size[0] / 2); gy = int(cy + wall_h * S / 2 - glow.size[1] / 2)
    base = cv.crop((gx, gy, gx + glow.size[0], gy + glow.size[1])).convert("RGB")
    ov = Image.new("RGB", glow.size, (0, 0, 0)); ov.paste(glow, (0, 0), glow)
    cv.paste(ImageChops.add(base, ov), (gx, gy))
    # 判定范围虚线框（180x45）
    dx0 = cx - wall_w * S / 2; dy0 = cy - wall_h * S / 2
    for k in range(0, int(wall_w * S), 12):
        d.line([(dx0 + k, cy + wall_h * S / 2), (dx0 + k + 6, cy + wall_h * S / 2)], fill=(120, 255, 160), width=2)

# 比例标注
d.text((int(W * 0.62), int(H * 0.30)), "火墙 180×45 逻辑px", fill=(200, 235, 210), font=font, anchor="lm")
d.text((int(W * 0.62), int(H * 0.36)), "贴图 180×56（焰尖高出判定 11px）", fill=(200, 235, 210), font=font, anchor="lm")
d.text((int(W * 0.62), int(H * 0.42)), "绿色虚线 = 实际判定地面线", fill=(120, 255, 160), font=font, anchor="lm")
d.text((W // 2, H - 26), "严格比例 · 2x 输出（750 逻辑宽）", fill=(220, 215, 225), font=font, anchor="mm")

out = "art/fx_firewall_v1/preview_in_game_exact.png"
cv.save(out)
print(out, cv.size)
