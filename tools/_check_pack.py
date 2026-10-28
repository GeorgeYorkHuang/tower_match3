# -*- coding: utf-8 -*-
"""
上传前包体自检（模拟微信小游戏打包规则）。

规则（官方文档 developers.weixin.qq.com/minigame 分包加载）：
  - 主包 ≤ 4MB
  - 单个普通分包不限大小（独立分包才限 4MB）
  - 主包 + 所有分包总计 ≤ 30MB
  - game.json subpackages 中配置的目录 → 各自独立成包；未配置的进主包
  - packOptions.ignore 对主包与分包同时生效

用法：python tools/_check_pack.py
"""
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git"}          # 版本库自身不参与打包
MAIN_LIMIT = 4 * 1024 * 1024
TOTAL_LIMIT = 30 * 1024 * 1024


def load_cfg(name):
    with io.open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return json.load(f)


def build_matchers(ignore):
    folders, files, regexps = [], set(), []
    for e in ignore:
        t, v = e.get("type"), (e.get("value") or "")
        if not v:
            continue
        if t == "folder":
            folders.append(v.strip("/") + "/")
        elif t == "file":
            files.add(v.lstrip("/"))
        elif t == "regexp":
            try:
                regexps.append(re.compile(v))
            except re.error:
                print("  ! 无效正则，已跳过：%s" % v)
    return folders, files, regexps


def ignored(rel, folders, files, regexps):
    if rel in files:
        return True
    for d in folders:
        if rel == d[:-1] or rel.startswith(d):
            return True
    for r in regexps:
        if r.search(rel):
            return True
    return False


def main():
    g = load_cfg("game.json")
    pc = load_cfg("project.config.json")
    subs = {s["root"].strip("/"): s.get("name", s["root"]) for s in g.get("subpackages", [])}

    # 两处 ignore 取并集，避免只在一侧配置导致工具与实际上传不一致
    mg = build_matchers(g.get("packOptions", {}).get("ignore", []))
    mp = build_matchers(pc.get("packOptions", {}).get("ignore", []))
    merged = (
        mg[0] + [d for d in mp[0] if d not in mg[0]],
        mg[1] | mp[1],
        mg[2] + [r for r in mp[2] if r.pattern not in [x.pattern for x in mg[2]]],
    )
    folders, files, regexps = merged

    main_bytes, main_count, main_big = 0, 0, []
    sub_bytes = {k: 0 for k in subs}
    sub_count = {k: 0 for k in subs}
    sub_dropped = {k: [] for k in subs}

    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            abs_p = os.path.join(dirpath, fn)
            rel = os.path.relpath(abs_p, ROOT).replace(os.sep, "/")
            if ignored(rel, folders, files, regexps):
                continue
            size = os.path.getsize(abs_p)
            owner = None
            for root_dir in subs:
                if rel == root_dir + "/game.js" or rel.startswith(root_dir + "/"):
                    owner = root_dir
                    break
            if owner:
                sub_bytes[owner] += size
                sub_count[owner] += 1
            else:
                main_bytes += size
                main_count += 1
                main_big.append((size, rel))

    mb = lambda b: b / 1024.0 / 1024.0
    print("=== 主包 ===")
    print("  文件 %d 个，%.2f MB  (上限 4.00 MB)  %s"
          % (main_count, mb(main_bytes), "OK" if main_bytes <= MAIN_LIMIT else "超限！"))
    print("=== 分包 ===")
    total = main_bytes
    for root_dir in subs:
        total += sub_bytes[root_dir]
        print("  %-10s %3d 个文件，%.2f MB" % (subs[root_dir], sub_count[root_dir], mb(sub_bytes[root_dir])))
    print("=== 合计 %.2f MB (上限 30.00 MB) %s ==="
          % (mb(total), "OK" if total <= TOTAL_LIMIT else "超限！"))

    main_big.sort(reverse=True)
    print("\n主包前 12 大文件：")
    for size, rel in main_big[:12]:
        print("  %8.1f KB  %s" % (size / 1024.0, rel))


if __name__ == "__main__":
    main()
