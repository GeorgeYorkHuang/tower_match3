# -*- coding: utf-8 -*-
"""combat.js 重构步骤2：六塔区块聚拢 + 公共方法收口（方法体零改动，仅重排定义顺序）"""
import io

P = r"F:\workspace\towerdefence\js\combat.js"
with io.open(P, "r", encoding="utf-8") as f:
    src = f.read()
lines = src.split("\n")

# 方法起始行（1-indexed，Grep 实测）
starts = {1072:'hitFire', 1183:'applyBurn', 1219:'hitIce', 1389:'applySlow',
          1396:'hitPoison', 1410:'applyPoison', 1430:'poisonStack', 1438:'towerMuzzle',
          1451:'inTowerRange', 1455:'hasDot', 1458:'hitElectric', 1575:'hitBoomerang',
          1605:'applyBleed', 1616:'hitCannon', 1661:'explode', 1686:'tickPeriodic',
          1696:'tickFire', 1855:'tickIce', 1974:'tickElectric', 2081:'tickPoison',
          2146:'tickCannon', 2246:'tickBoomerang', 2308:'fxFlash'}

def block(start_line, end_line):
    """返回 [start_line, end_line) 1-indexed 行切片"""
    return lines[start_line-1:end_line-1]

def strip_head(blk, head_lines):
    """从块尾剥离区块头注释行；返回(块, 头行列表)"""
    removed = []
    while blk and blk[-1].strip().startswith('/* ==='):
        removed.insert(0, blk.pop())
    return blk, removed

# 校验起点
for ln, name in starts.items():
    assert lines[ln-1].startswith('  ' + name + '('), "line %d != %s: %r" % (ln, name, lines[ln-1][:60])

# 提取块（方法起始 → 下一方法起始）
order = list(starts.keys())
segs = {}
for i, ln in enumerate(order):
    nxt = order[i+1] if i+1 < len(order) else 2308
    segs[starts[ln]] = block(ln, nxt)

# 区块头注释行（独立行号，1-indexed）
heads = {1071:'FIRE', 1218:'ICE', 1457:'ELECTRIC', 1395:'POISON', 1615:'CANNON', 1573:'BOOM1', 1574:'BOOM2', 2307:'VIS'}
head_text = {}
for ln, tag in heads.items():
    head_text[tag] = lines[ln-1]

# 从各自块尾剥离头注释
for ln, tag in heads.items():
    owner = None
    for mln in order:
        if ln > mln and (ln < (order[order.index(mln)+1] if order.index(mln)+1 < len(order) else 2308)):
            owner = starts[mln]
    if owner:
        segs[owner], _ = strip_head(segs[owner], [])

def fmt(name):
    return name.replace('FIRE','火塔').replace('ICE','冰塔').replace('ELECTRIC','电塔').replace('POISON','毒塔').replace('CANNON','炮塔').replace('BOOM1','回旋镖塔').replace('BOOM2','回旋镖塔')

def j(parts):
    out = []
    for p in parts:
        p = [l.rstrip() for l in p]
        while p and not p[-1].strip(): p.pop()   # 去尾空行
        while p and not p[0].strip(): p.pop(0)   # 去头空行
        out.append("\n".join(p))
    return "\n\n\n".join(out) + "\n"

def head_blk(tag):
    t = head_text[tag]
    return [t]

# 新组装：六塔区块（hit+状态+tick），公共方法收口
new_mid = j([
    head_blk('FIRE') + segs['hitFire'] + segs['applyBurn'] + segs['tickFire'],
    head_blk('ICE') + segs['hitIce'] + segs['tickIce'],
    head_blk('ELECTRIC') + segs['hitElectric'] + segs['tickElectric'],
    head_blk('POISON') + segs['hitPoison'] + segs['applyPoison'] + segs['poisonStack'] + segs['tickPoison'],
    head_blk('CANNON') + segs['hitCannon'] + segs['tickCannon'],
    head_blk('BOOM1') + head_blk('BOOM2') + segs['hitBoomerang'] + segs['applyBleed'] + segs['tickBoomerang'],
    ['  /* ============ 公共：状态 / 几何 / 通用 ============ */'] + segs['applySlow'] + segs['towerMuzzle'] + segs['inTowerRange'] + segs['hasDot'] + segs['explode'] + segs['tickPeriodic'] + head_blk('VIS'),
])

# 校验剥离后无残留头行在公共方法中
assert '/* ===========' not in j([segs['applySlow'] + segs['towerMuzzle'] + segs['inTowerRange'] + segs['hasDot'] + segs['explode'] + segs['tickPeriodic']]), "head残留"

# 替换 L1071..L2307（火头 → tickBoomerang 结束）
assert lines[1070].strip().startswith('/* ============ 火塔'), repr(lines[1070])
assert lines[2304].strip() == '}', repr(lines[2304])
new_lines = lines[:1070] + new_mid.split("\n") + lines[2307:]
src = "\n".join(new_lines)
with io.open(P, "w", encoding="utf-8", newline="") as f:
    f.write(src)
print("OK, new length:", len(new_lines))
