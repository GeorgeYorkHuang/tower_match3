# -*- coding: utf-8 -*-
"""
v1.17.21b 让 game.json 与 project.config.json 的 packOptions.ignore 完全一致。

问题：project.config.json 里 40 余条忽略规则用的是**旧的 images/... 路径**（素材早已迁到
      assets/images/...），全部失效成为死规则；而 game.json 里真正生效的两条 assets regexp
      又没有同步过去。结果是「开发者工具本地编译的包」与「后台上传的包」内容不一致。

做法：以 game.json 的 ignore 为唯一事实来源，整体覆盖 project.config.json 的 ignore
      （被覆盖的都是已验证目标不存在或为空目录的死规则）。
"""
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GP = os.path.join(ROOT, "game.json")
PP = os.path.join(ROOT, "project.config.json")


def read(p):
    with io.open(p, encoding="utf-8") as f:
        return json.load(f)


def write(p, d):
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")


game = read(GP)
pc = read(PP)

src = game.setdefault("packOptions", {}).setdefault("ignore", [])
old = pc.setdefault("packOptions", {}).get("ignore", [])

# 统计被丢弃的死规则，便于复核
dropped = [e for e in old if e not in src]
pc["packOptions"]["ignore"] = [dict(e) for e in src]

write(PP, pc)
write(GP, game)  # 归一化格式

print("game.json ignore: %d 条" % len(src))
print("project.config.json ignore: %d 条（原 %d 条，丢弃 %d 条死规则）"
      % (len(pc["packOptions"]["ignore"]), len(old), len(dropped)))
for e in dropped:
    print("   - %-7s %s" % (e.get("type"), e.get("value")))
