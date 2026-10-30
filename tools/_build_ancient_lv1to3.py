# -*- coding: utf-8 -*-
"""A卡(Lv1-Lv3)图集后处理：切帧 -> 连通域去水印/杂点 -> 统一缩放 -> 基线对齐 -> 合成规格图集 + manifest
规格：透明PNG、单行横排、各帧等大128x128、底部中心锚点。
输出：
  assets/images/enemies/ancient/lvN.png        游戏用图集
  art/monsters_ancient/lvN/frame_XX.png        逐帧源文件
  docs/art/ancient-monsters-manifest.json      清单（预览工具同源）
"""
import json, os, math
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL = 128
SAFE = 112          # 内容最大边（留 8px 安全空白）
ALPHA_TH = 16       # alpha 阈值

JOBS = [
    dict(lv=1, name="苔露团",     type="normal", frames=6, durs=[140,160,200,310,200,220], erode=2, anchor="foot",
         raw=r"art\monsters_ancient\lv1\Sprite_sheet_for_a_2D_mobile_t_2026-10-30T16-24-39.png"),
    dict(lv=2, name="疾芽鼠",     type="fast",   frames=5, durs=[160]*5,
         raw=r"art\monsters_ancient\lv2\Sprite_sheet_for_a_2D_mobile_t_2026-10-30T16-24-50.png"),
    dict(lv=3, name="负碑石卫",   type="tank",   frames=5, durs=[300]*5,
         raw=r"art\monsters_ancient\lv3\Sprite_sheet_for_a_2D_mobile_t_2026-10-30T16-25-01.png"),
    # ---- B卡 Lv4-8 ----
    dict(lv=4, name="藤缚侍从",   type="normal", frames=5, durs=[240]*5, anchor="foot",
         raw=r"art\monsters_ancient\lv4\Sprite_sheet_for_a_2D_mobile_t_2026-10-30T17-40-38.png"),
    dict(lv=5, name="荆棘猎犬",   type="fast",   frames=5, durs=[160]*5, anchor="lift",
         raw=r"art\monsters_ancient\lv5\Sprite_sheet_for_a_2D_mobile_t_2026-10-30T17-40-49.png"),
    dict(lv=6, name="古根盾卫",   type="tank",   frames=5, durs=[300]*5, anchor="foot",
         raw=r"art\monsters_ancient\lv6\Sprite_sheet_for_a_2D_mobile_t_2026-10-30T17-40-58.png"),
    dict(lv=7, name="残坛守兵",   type="normal", frames=5, durs=[240]*5, anchor="foot",
         raw=r"art\monsters_ancient\lv7\Sprite_sheet_for_a_2D_mobile_t_2026-10-30T17-41-07.png"),
    dict(lv=8, name="逐风花螳",   type="fast",   frames=5, durs=[160]*5, anchor="lift",
         raw=r"art\monsters_ancient\lv8\Sprite_sheet_for_a_2D_mobile_t_2026-10-30T17-41-18.png"),
]

def largest_component_mask(alpha):
    """返回仅保留最大连通域的 alpha 图（4邻接 BFS）。"""
    w, h = alpha.size
    px = alpha.load()
    seen = [[False]*w for _ in range(h)]
    best = None
    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or px[sx, sy] <= ALPHA_TH:
                continue
            q = deque([(sx, sy)]); seen[sy][sx] = True
            pts = []
            while q:
                x, y = q.popleft(); pts.append((x, y))
                for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny] > ALPHA_TH:
                        seen[ny][nx] = True; q.append((nx, ny))
            if best is None or len(pts) > len(best):
                best = pts
    out = Image.new("L", alpha.size, 0)
    op = out.load()
    for x, y in best or []:
        op[x, y] = px[x, y]
    return out, len(best or [])

def process(job):
    raw_path = os.path.join(ROOT, job["raw"])
    img = Image.open(raw_path).convert("RGBA")
    W, H = img.size
    N = job["frames"]
    fw = W / N
    frames = []
    report = []
    for i in range(N):
        x0 = int(round(i*fw)); x1 = int(round((i+1)*fw))
        cellimg = img.crop((x0, 0, x1, H))
        # 底色兜底抠图（白底/假棋盘格通用）：边缘采样调色板泛洪 -> 透明
        cellimg, palette = keyout_background_edges(cellimg)
        alpha, kept = largest_component_mask(cellimg.getchannel("A"))
        cellimg.putalpha(alpha)
        cellimg = remove_fringe(cellimg, palette, erode=job.get("erode", 1))  # 去白边
        bbox = alpha.getbbox()
        if not bbox:
            report.append((i+1, 0, "EMPTY")); frames.append(None); continue
        frame = cellimg.crop(bbox)
        frames.append(frame)
        report.append((i+1, kept, f"bbox {frame.size}"))
    # 统一缩放：全帧取同一系数，保持相对大小
    maxdim = max(max(f.size) for f in frames if f)
    scale = min(1.0, SAFE / maxdim)
    if scale < 1.0:
        frames = [f.resize((max(1,int(f.width*scale)), max(1,int(f.height*scale))), Image.LANCZOS) if f else None for f in frames]
    # 合成
    # anchor='foot'  ：脚底基点锚定——所有帧脚底对齐同一基线（消除帧间跳动感，仅保留挤压/摆动）
    # anchor='lift'  ：保留原图腾空量（跑/跳循环的滞空相）
    anchor = job.get("anchor", "lift")
    margin = job.get("baseMargin", 6)   # 脚底距图集底边留白
    atlas = Image.new("RGBA", (CELL*N, CELL), (0,0,0,0))
    for i, f in enumerate(frames):
        if not f: continue
        px = (i*CELL) + (CELL - f.width)//2
        if anchor == "foot":
            py = CELL - margin - f.height   # 脚底统一钉在基线上
        else:
            ground = max(g.height for g in frames if g)
            top_from_ground = ground - f.height
            py = CELL - top_from_ground - f.height
        atlas.paste(f, (px, py))
    # 输出
    out_dir = os.path.join(ROOT, "assets", "images", "enemies", "ancient")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"lv{job['lv']}.png")
    atlas.save(out_path, "PNG", optimize=True)
    # 逐帧源文件
    src_dir = os.path.join(ROOT, "art", "monsters_ancient", f"lv{job['lv']}")
    os.makedirs(src_dir, exist_ok=True)
    for i, f in enumerate(frames):
        if f: f.save(os.path.join(src_dir, f"frame_{i+1:02d}.png"), "PNG")
    return atlas, out_path, report, scale, maxdim

def keyout_background_edges(im):
    """从四边采样背景调色板（白底/假棋盘格/纯色底通用），按颜色容差泛洪 -> 透明。
    只清除与边缘连通的背景区，不碰怪物身体内部的高光。"""
    w, h = im.size
    px = im.load()
    # 1. 采样边缘代表色（角+边中点），简单聚类成调色板
    samples = [px[x, y][:3] for x, y in
               [(0,0),(w-1,0),(0,h-1),(w-1,h-1),(w//2,0),(w//2,h-1),(2,2),(w-3,h-3)]]
    palette = []
    for c in samples:
        if all(max(abs(c[i]-p[i]) for i in range(3)) > 10 for p in palette):
            palette.append(c)
    def is_bg(p):
        return p[3] == 0 or any(max(abs(p[i]-pal[i]) for i in range(3)) <= 14 for pal in palette)
    # 2. 边缘泛洪
    seen = [[False]*w for _ in range(h)]
    q = deque()
    for x in range(w): q.append((x,0)); q.append((x,h-1))
    for y in range(h): q.append((0,y)); q.append((w-1,y))
    while q:
        x, y = q.popleft()
        if x<0 or y<0 or x>=w or y>=h or seen[y][x]: continue
        seen[y][x] = True
        p = px[x, y]
        if not is_bg(p): continue
        px[x, y] = (p[0], p[1], p[2], 0)
        q.extend(((x-1,y),(x+1,y),(x,y-1),(x,y+1)))
    return im, palette

def remove_fringe(im, palette, tol=22, passes=2, erode=1):
    """去白边：①alpha 腐蚀 erode px（吃掉与背景混色的最外圈，深色描边~3px 不受损）；
    ②邻接透明且近似背景色的像素 -> 透明；③剩余半透明像素 RGB 重染为邻近实心色。"""
    w, h = im.size
    for _ in range(erode):
        al = im.getchannel("A").load()
        new_a = Image.new("L", im.size, 0)
        na = new_a.load()
        for y in range(h):
            for x in range(w):
                m = al[x, y]
                for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        m = min(m, al[nx, ny])
                na[x, y] = m
        im.putalpha(new_a)
    px = im.load()
    def bg_like(c): return any(max(abs(c[i]-pal[i]) for i in range(3)) <= tol for pal in palette)
    # ② 清除残余白圈
    to_clear = []
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] == 0 or not bg_like(p[:3]): continue
            for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    to_clear.append((x, y)); break
    for x, y in to_clear: px[x, y] = (0, 0, 0, 0)
    # ③ 半透明像素重染
    for _ in range(passes):
        fixes = {}
        for y in range(h):
            for x in range(w):
                p = px[x, y]
                if p[3] >= 250 or p[3] == 0: continue
                acc = [0, 0, 0]; n = 0
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x+dx, y+dy
                        if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] >= 250:
                            c = px[nx, ny]; acc[0]+=c[0]; acc[1]+=c[1]; acc[2]+=c[2]; n += 1
                if n: fixes[(x, y)] = (acc[0]//n, acc[1]//n, acc[2]//n, p[3])
        for (x, y), c in fixes.items(): px[x, y] = c
    # ④ 边缘圈重染：紧邻透明区(≤2px)的像素，RGB 换成其内侧实心像素均值——消灭不透明浅色描边光
    def near_trans(x, y, r=2):
        for dy in range(-r, r+1):
            for dx in range(-r, r+1):
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    return True
        return False
    edge, inner = [], []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0: continue
            (edge if near_trans(x, y) else inner).append((x, y))
    inner_set = set(inner)
    fixes = {}
    for x, y in edge:
        acc = [0, 0, 0]; n = 0
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) in inner_set:
                    c = px[nx, ny]; acc[0]+=c[0]; acc[1]+=c[1]; acc[2]+=c[2]; n += 1
        if n >= 6:
            avg = (acc[0]/n, acc[1]/n, acc[2]/n)
            p = px[x, y]
            lum_p = 0.299*p[0]+0.587*p[1]+0.114*p[2]
            lum_a = 0.299*avg[0]+0.587*avg[1]+0.114*avg[2]
            if lum_p > lum_a + 15:  # 只替换比内侧亮的光晕像素，深色描边保留
                fixes[(x, y)] = (int(avg[0]), int(avg[1]), int(avg[2]), p[3])
    for (x, y), c in fixes.items(): px[x, y] = c
    return im

def main():
    import sys
    only = {int(a) for a in sys.argv[1:] if a.isdigit()}  # 可选：python xxx.py 4 5 6 只跑指定等级
    manifest = {"version": "2026-10-31T01:42", "game": "圣坛裂痕", "field": "圣坛花园", "spec": {"frameWidth":128,"frameHeight":128,"anchor":"bottom-center"}, "monsters": []}
    for job in JOBS:
        if only and job["lv"] not in only: continue
        atlas, out_path, report, scale, maxdim = process(job)
        entry = {
            "generation": job["lv"], "type": job["type"], "name": job["name"],
            "path": f"assets/images/enemies/ancient/lv{job['lv']}.png",
            "frameCount": job["frames"], "frameWidth": 128, "frameHeight": 128,
            "frameDurations": job["durs"], "anchor": "bottom-center",
            "bytes": os.path.getsize(out_path), "scaled": round(scale,3), "rawMaxDim": maxdim,
        }
        manifest["monsters"].append(entry)
        print(f"Lv{job['lv']} {job['name']}: {atlas.size[0]}x{atlas.size[1]}, {entry['bytes']/1024:.1f}KB, scale={scale:.2f} (rawMax {maxdim}px)")
        for r in report: print("   frame", r)
    os.makedirs(os.path.join(ROOT, "docs", "art"), exist_ok=True)
    man_path = os.path.join(ROOT, "docs", "art", "ancient-monsters-manifest.json")
    # 增量合并：过滤跑批时保留未涉及等级的既有条目
    old = {}
    if os.path.exists(man_path):
        try:
            with open(man_path, encoding="utf-8") as f:
                old = {m["generation"]: m for m in json.load(f).get("monsters", [])}
        except Exception:
            old = {}
    merged = []
    seen = set()
    for m in manifest["monsters"]:
        merged.append(m); seen.add(m["generation"])
    for gen, m in sorted(old.items()):
        if gen not in seen: merged.append(m)
    manifest["monsters"] = sorted(merged, key=lambda m: m["generation"])
    with open(man_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("manifest -> docs/art/ancient-monsters-manifest.json")

if __name__ == "__main__":
    main()
