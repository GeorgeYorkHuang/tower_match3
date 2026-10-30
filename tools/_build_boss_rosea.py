# -*- coding: utf-8 -*-
"""W美工任务卡：圣坛20波「缠根司祭·萝赛」(altar_rosea) 图集构建
规格（任务卡）：透明PNG、横排、march 单帧 256x256、幼芽 runner 单帧 128x128、脚底中心锚点。
输出：
  assets/images/bosses/altar_rosea/march.png            行进/待机 6 帧（任务卡要求8帧，见 manifest 备注）
  assets/images/bosses/altar_rosea/sapling_runner.png   幼芽 5 帧（独立造型，不影响普通 Lv5）
  art/bosses_ancient/altar_rosea/<clip>/frame_XX.png    逐帧源文件
  docs/art/altar-rosea-manifest.json                    交付 manifest
复用 _build_ancient_lv1to3 的抠底/去白边/连通域函数。
"""
import json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _build_ancient_lv1to3 import largest_component_mask, remove_fringe
from collections import deque

def keyout_background_edges_full(im, tol=16, max_palette=8):
    """全边采样版抠底：扫描整圈边缘像素聚类调色板（修复角点采样漏掉第二种棋盘灰的问题），
    再按调色板从边缘泛洪 -> 透明。"""
    w, h = im.size
    px = im.load()
    palette = []
    def add_pal(c):
        # 只收中性浅灰（棋盘家族）：低饱和 + 亮度高。排除跨界藤蔓/人物边缘的彩色像素。
        r, g, b = c
        if max(r, g, b) - min(r, g, b) > 18: return
        if min(r, g, b) < 200: return
        if len(palette) >= max_palette: return
        if all(max(abs(c[i]-p[i]) for i in range(3)) > 10 for p in palette):
            palette.append(c)
    for x in range(0, w, 4):
        add_pal(px[x, 0][:3]); add_pal(px[x, h-1][:3])
    for y in range(0, h, 4):
        add_pal(px[0, y][:3]); add_pal(px[w-1, y][:3])
    def is_bg(p):
        return p[3] == 0 or any(max(abs(p[i]-pal[i]) for i in range(3)) <= tol for pal in palette)
    seen = [[False]*w for _ in range(h)]
    q = deque()
    for x in range(w): q.append((x, 0)); q.append((x, h-1))
    for y in range(h): q.append((0, y)); q.append((w-1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]: continue
        seen[y][x] = True
        p = px[x, y]
        if not is_bg(p): continue
        px[x, y] = (p[0], p[1], p[2], 0)
        q.extend(((x-1, y), (x+1, y), (x, y-1), (x, y+1)))
    return im, palette

ALPHA_TH = 16

JOBS = [
    dict(clip="march", cell=256, safe=240, frames=6, durs=[320]*6, loop=True, erode=2, anchor="foot",
         split="cluster_upper",   # 模型排布不落 256 网格，等分会切坏帧；上体聚类避开地面横连藤蔓
         raw=r"art\bosses_ancient\altar_rosea_march\Sprite_sheet__ONE_horizontal_r_2026-10-30T18-09-54.png"),
    dict(clip="sapling_runner", cell=128, safe=112, frames=5, durs=[160]*5, loop=True, erode=1, anchor="foot",
         split="cluster",
         raw=r"art\bosses_ancient\altar_sapling_runner\Sprite_sheet_for_a_2D_mobile_t_2026-10-30T18-08-20.png"),
]

def detect_clusters(img, min_w=40, gap=12, y_to=None, min_run=4):
    """按列投影检测人物簇。y_to: 只统计 0..y_to 高度带；min_run: 先丢弃窄于此的
    细丝 run（藤蔓搭桥元凶），再做 gap 合并。"""
    px = img.load()
    W, H = img.size
    y_max = int(H * y_to) if y_to else H
    def is_bg(p):
        r, g, b, a = p
        if a < 10: return True
        return (abs(r-233) < 16 and abs(g-232) < 16 and abs(b-231) < 16) or (r > 246 and g > 246 and b > 244)
    cols = []
    for x in range(W):
        cols.append(any(not is_bg(px[x, y]) for y in range(0, y_max, 3)))
    runs, s = [], None
    for x, v in enumerate(cols):
        if v and s is None: s = x
        if not v and s is not None:
            if x - s >= min_run: runs.append([s, x])
            s = None
    if s is not None and W - s >= min_run: runs.append([s, W])
    # 合并小间隙
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < gap: merged[-1][1] = r[1]
        else: merged.append(r)
    merged = [r for r in merged if r[1]-r[0] >= min_w]
    return merged

def process(job):
    img = Image.open(os.path.join(ROOT, job["raw"])).convert("RGBA")
    W, H = img.size
    N, CELL, SAFE = job["frames"], job["cell"], job["safe"]
    if job.get("split") == "cluster":
        clusters = detect_clusters(img, min_w=60, gap=6)
        print(f"  检测到人物簇 {len(clusters)} 个（需 {N}）: {clusters}")
        if len(clusters) < N:
            raise SystemExit(f"❌ {job['clip']}: 人物簇 {len(clusters)} < 帧数 {N}，需人工处理")
        cells = sorted(sorted(clusters, key=lambda r: r[1]-r[0], reverse=True)[:N])
    elif job.get("split") == "cluster_upper":
        clusters = detect_clusters(img, min_w=80, gap=20, y_to=0.45, min_run=4)
        print(f"  检测到上体簇 {len(clusters)} 个（需 {N}）: {clusters}")
        if len(clusters) != N:
            raise SystemExit(f"❌ {job['clip']}: 上体簇 {len(clusters)} != 帧数 {N}，需人工处理")
        cells = clusters
    else:
        fw = W / N
        cells = [(int(round(i*fw)), int(round((i+1)*fw))) for i in range(N)]
    frames, report = [], []
    for i, (x0, x1) in enumerate(cells):
        cellimg = img.crop((x0, 0, x1, H))
        cellimg, palette = keyout_background_edges_full(cellimg)
        alpha, kept = largest_component_mask(cellimg.getchannel("A"))
        cellimg.putalpha(alpha)
        cellimg = remove_fringe(cellimg, palette, erode=job.get("erode", 1))
        bbox = alpha.getbbox()
        if not bbox:
            report.append((i+1, 0, "EMPTY")); frames.append(None); continue
        frames.append(cellimg.crop(bbox))
        report.append((i+1, kept, f"bbox {frames[-1].size}"))
    maxdim = max(max(f.size) for f in frames if f)
    scale = min(1.0, SAFE / maxdim)
    if scale < 1.0:
        frames = [f.resize((max(1,int(f.width*scale)), max(1,int(f.height*scale))), Image.LANCZOS) if f else None for f in frames]
    margin = 6
    atlas = Image.new("RGBA", (CELL*N, CELL), (0,0,0,0))
    for i, f in enumerate(frames):
        if not f: continue
        px = (i*CELL) + (CELL - f.width)//2
        py = CELL - margin - f.height   # 脚底中心锚点：脚底统一钉在底边上方 6px
        atlas.paste(f, (px, py))
    out_dir = os.path.join(ROOT, "assets", "images", "bosses", "altar_rosea")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, job["clip"] + ".png")
    atlas.save(out_path, "PNG", optimize=True)
    src_dir = os.path.join(ROOT, "art", "bosses_ancient", "altar_rosea", job["clip"])
    os.makedirs(src_dir, exist_ok=True)
    for i, f in enumerate(frames):
        if f: f.save(os.path.join(src_dir, f"frame_{i+1:02d}.png"), "PNG")
    return atlas, out_path, report, scale, maxdim

def main():
    clips = {}
    for job in JOBS:
        atlas, out_path, report, scale, maxdim = process(job)
        clips[job["clip"]] = {
            "path": f"assets/images/bosses/altar_rosea/{job['clip']}.png",
            "frameCount": job["frames"], "frameWidth": job["cell"], "frameHeight": job["cell"],
            "frameDurations": job["durs"], "loop": job["loop"], "anchor": "bottom-center",
            "bytes": os.path.getsize(out_path), "scaled": round(scale, 3), "rawMaxDim": maxdim,
        }
        print(f"{job['clip']}: {atlas.size[0]}x{atlas.size[1]}, {clips[job['clip']]['bytes']/1024:.1f}KB, scale={scale:.2f}")
        for r in report: print("   frame", r)
    manifest = {
        "id": "altar_rosea",
        "name": "缠根司祭·萝赛",
        "field": "ancient", "wave": 20, "kind": "mini-boss",
        "game": "圣坛裂痕",
        "anchor": "bottom-center",
        "degrade": {"mode": "static-frame", "frame": "march frame_1", "note": "播放器缺帧/加载失败时显示 march 首帧静帧"},
        "clips": {
            "march": {
                **clips["march"],
                "usage": "行进/待机样板（P1 闭合花冠）",
                "deviation": "任务卡要求 8 帧；图像模型 3 次生成均无法稳定产出 8 帧一致（7 帧版本存在丢杖帧），采用 6 帧一致版。若 owner 不接受，需人工补拍 2 帧。",
            },
            "sapling_runner": {
                **clips["sapling_runner"],
                "usage": "幼芽召唤单位 ×3 换皮共用，独立于普通 Lv5 素材",
            },
            "cast": {
                "pending": True, "plannedFrames": 8, "frameWidth": 256, "frameHeight": 256,
                "loop": False, "eventTimepoints": {"castStartMs": 0, "vineRingFlashMs": 300, "endMs": 1000},
                "note": "验收 march 后补拍（任务卡约定）",
            },
            "shellbreak": {
                "pending": True, "plannedFrames": 8, "frameWidth": 256, "frameHeight": 256,
                "loop": False, "eventTimepoints": {"burstAtMs": 200, "pauseMs": 500, "endMs": 800},
                "note": "0.5s 破壳停顿/花瓣爆开；表现层由 js/game/fx/boss-rosea.js 的 burst() 先行承担",
            },
            "death": {
                "pending": True, "plannedFrames": 8, "frameWidth": 256, "frameHeight": 256,
                "loop": False, "eventTimepoints": {"collapseStartMs": 0, "petalFallMs": 400, "endMs": 1200},
            },
        },
        "fxModule": "js/game/fx/boss-rosea.js",
        "preview": "tools/preview_rosea.html",
    }
    man_path = os.path.join(ROOT, "docs", "art", "altar-rosea-manifest.json")
    os.makedirs(os.path.dirname(man_path), exist_ok=True)
    with open(man_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("manifest -> docs/art/altar-rosea-manifest.json")

if __name__ == "__main__":
    main()
