# -*- coding: utf-8 -*-
"""Boss 图集后处理（缠根司祭·萝赛，圣坛 20 波小 Boss）
规格：透明PNG、单行横排、各帧等大 192x192（Boss 比小怪 128 大 50%）、底部中心锚点、脚底钉线。
复用 _build_ancient_lv1to3 的抠底/去白边/连通域函数。
输出：
  assets/images/enemies/ancient/boss20_luosai_p1.png / _p2.png   游戏用图集
  art/bosses_ancient/luosai_pN/frame_XX.png                      逐帧源文件
  docs/art/ancient-bosses-manifest.json                          Boss 清单（独立于小怪 manifest）
"""
import json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _build_ancient_lv1to3 import largest_component_mask, keyout_background_edges, remove_fringe

CELL = 192
SAFE = 176          # 内容最大边（留 8px 安全空白）
ALPHA_TH = 16

JOBS = [
    dict(id="boss20_luosai_p1", name="缠根司祭·萝赛 P1 藤甲期", frames=6, durs=[320]*6,
         anchor="foot", erode=2,
         raw=r"art\bosses_ancient\luosai_p1\Boss_sprite_sheet_for_a_2D_mob_2026-10-30T17-57-53.png"),
    dict(id="boss20_luosai_p2", name="缠根司祭·萝赛 P2 花绽狂暴", frames=6, durs=[180]*6,
         anchor="foot", erode=2,
         raw=r"art\bosses_ancient\luosai_p2\Boss_sprite_sheet_for_a_2D_mob_2026-10-30T17-58-04.png"),
]

def process(job):
    img = Image.open(os.path.join(ROOT, job["raw"])).convert("RGBA")
    W, H = img.size
    N = job["frames"]
    fw = W / N
    frames, report = [], []
    for i in range(N):
        x0, x1 = int(round(i*fw)), int(round((i+1)*fw))
        cellimg = img.crop((x0, 0, x1, H))
        cellimg, palette = keyout_background_edges(cellimg)
        alpha, kept = largest_component_mask(cellimg.getchannel("A"))
        cellimg.putalpha(alpha)
        cellimg = remove_fringe(cellimg, palette, erode=job.get("erode", 1))
        bbox = alpha.getbbox()
        if not bbox:
            report.append((i+1, 0, "EMPTY")); frames.append(None); continue
        frames.append(cellimg.crop(bbox))
        report.append((i+1, kept, f"bbox {cellimg.crop(bbox).size}"))
    maxdim = max(max(f.size) for f in frames if f)
    scale = min(1.0, SAFE / maxdim)
    if scale < 1.0:
        frames = [f.resize((max(1,int(f.width*scale)), max(1,int(f.height*scale))), Image.LANCZOS) if f else None for f in frames]
    anchor = job.get("anchor", "foot")
    margin = job.get("baseMargin", 6)
    atlas = Image.new("RGBA", (CELL*N, CELL), (0,0,0,0))
    for i, f in enumerate(frames):
        if not f: continue
        px = (i*CELL) + (CELL - f.width)//2
        py = (CELL - margin - f.height) if anchor == "foot" else (CELL - f.height)
        atlas.paste(f, (px, py))
    out_dir = os.path.join(ROOT, "assets", "images", "enemies", "ancient")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, job["id"] + ".png")
    atlas.save(out_path, "PNG", optimize=True)
    src_dir = os.path.join(ROOT, "art", "bosses_ancient", job["id"])
    os.makedirs(src_dir, exist_ok=True)
    for i, f in enumerate(frames):
        if f: f.save(os.path.join(src_dir, f"frame_{i+1:02d}.png"), "PNG")
    return atlas, out_path, report, scale, maxdim

def main():
    manifest = {
        "version": "2026-10-31T02:05", "game": "圣坛裂痕", "field": "圣坛花园",
        "spec": {"frameWidth": 192, "frameHeight": 192, "anchor": "bottom-center"},
        "bosses": [],
    }
    for job in JOBS:
        atlas, out_path, report, scale, maxdim = process(job)
        manifest["bosses"].append({
            "id": job["id"], "name": job["name"],
            "field": "ancient", "wave": 20, "kind": "mini-boss",
            "path": f"assets/images/enemies/ancient/{job['id']}.png",
            "frameCount": job["frames"], "frameWidth": 192, "frameHeight": 192,
            "frameDurations": job["durs"], "anchor": "bottom-center",
            "bytes": os.path.getsize(out_path), "scaled": round(scale, 3), "rawMaxDim": maxdim,
        })
        print(f"{job['id']}: {atlas.size[0]}x{atlas.size[1]}, {os.path.getsize(out_path)/1024:.1f}KB, scale={scale:.2f} (rawMax {maxdim}px)")
        for r in report: print("   frame", r)
    man_path = os.path.join(ROOT, "docs", "art", "ancient-bosses-manifest.json")
    os.makedirs(os.path.dirname(man_path), exist_ok=True)
    with open(man_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("manifest -> docs/art/ancient-bosses-manifest.json")

if __name__ == "__main__":
    main()
