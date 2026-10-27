# -*- coding: utf-8 -*-
"""扫描 js/ 目录：统计 icon: '...' 字段的 emoji 占位 + 内联 emoji 使用。一次性工具。"""
import re, glob, collections, io

EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE0F]"
)
ICON = re.compile("icon:\\s*'([^']*)'")   # chr(92) 避开 shell 转义

icons = []            # (emoji, file, key)
inline = collections.defaultdict(set)   # file -> set(emoji)
for fp in glob.glob('js/**/*.js', recursive=True):
    src = io.open(fp, encoding='utf-8').read()
    for line in src.splitlines():
        m = ICON.search(line)
        if m and EMOJI.search(m.group(1)):
            key = line.strip().split(':')[0].strip(" {,'\"")
            icons.append((m.group(1), fp.replace('\\', '/'), key))
        else:
            for ch in line:
                if EMOJI.match(ch):
                    inline[fp.replace('\\', '/')].add(ch)

print("== icon: 字段（emoji 占位） ==")
print(f"总数 {len(icons)}，去重 {len(set(e for e, _, _ in icons))} 种\n")
byfile = collections.Counter(fp for _, fp, _ in icons)
for fp, n in byfile.items():
    print(f"  {fp}: {n} 个")
print()
cur = None
for e, fp, key in icons:
    if fp != cur:
        cur = fp
        print(f"-- {fp}")
    print(f"  {e}  {key}")

print("\n== 内联 emoji（文案/标题/符号，不含 icon 字段的文件余量） ==")
for fp in sorted(inline):
    print(f"  {fp}: {len(inline[fp])} 种 {' '.join(sorted(inline[fp])[:40])}")
