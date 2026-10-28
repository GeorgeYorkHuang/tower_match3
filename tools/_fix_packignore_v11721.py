# -*- coding: utf-8 -*-
"""
v1.17.21 主包瘦身：把不该上传的项目文件排除出代码包。

背景：
  - assets 已是分包（game.json subpackages root=assets），素材本体不再占主包；
  - 但主包里仍残留：audio/ 396KB（本次已迁入 assets/audio）、.creative-design 设计稿 591KB、
    若干工具临时目录（_doc_draft / doc-fetch-resources / draft_*）、根目录测试脚本与 fetch 日志、
    以及 README.md 等纯文档。
  - game.json(上传时用) 与 project.config.json(开发者工具本地编译用) 的 packOptions.ignore
    必须保持一致，否则「工具显示包大小」与「后台上传大小」会对不上。

策略：只追加 ignore 规则，不移动/删除任何文件（零风险，随时可回退）。
"""
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 期望排除的条目（folder / file / regexp 三种）
WANT = [
    # 工具与源素材目录
    ("folder", "tools"),
    ("folder", "art"),
    ("folder", "docs"),
    ("folder", ".workbuddy"),
    ("folder", ".creative-design"),
    # 工具临时目录（非游戏资源）
    ("folder", "_doc_draft"),
    ("folder", "doc-fetch-resources"),
    ("folder", "draft_944b5e9f_folder"),
    # 根目录文档与日志
    ("file", "README.md"),
    ("file", "消消防线-动画与特效规格.md"),
    ("file", "fetch_stderr.txt"),
    ("file", "fetch_stdout.txt"),
    # 根目录测试脚本
    ("regexp", r"^_test_.*\.cjs$"),
]


def merge(path):
    with io.open(path, encoding="utf-8") as f:
        data = json.load(f)
    pack = data.setdefault("packOptions", {})
    ignore = pack.setdefault("ignore", [])
    have = {(e.get("type"), e.get("value")) for e in ignore}
    added = []
    for t, v in WANT:
        if (t, v) not in have:
            ignore.append({"type": t, "value": v})
            added.append((t, v))
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return added, len(ignore)


for name in ("game.json", "project.config.json"):
    p = os.path.join(ROOT, name)
    added, total = merge(p)
    print("[%s] 新增 %d 条，现共 %d 条" % (name, len(added), total))
    for t, v in added:
        print("   + %-7s %s" % (t, v))
