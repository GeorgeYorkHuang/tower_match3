# -*- coding: utf-8 -*-
"""render.js 重构步骤3b：fx() 按 f.type 拆为 FX_HANDLERS 分发表（22 个 handler，行为零变更）
区间规则：分支体 body = [分支起始行 : 下一分支起始行)，含分支自身的闭行（`}` 合并进下一分支起始行行首的除外）；
match 为链尾，闭行独立（L2192），由方法闭替代。"""
import io

P = r"F:\workspace\towerdefence\js\game\render.js"
with io.open(P, "r", encoding="utf-8") as f:
    src = f.read()
lines = src.split("\n")

# 边界校验（1-based 行号转 0-based；分支闭 `}` 与下一分支 `else if` 同行）
assert lines[1186].startswith('  fx(ctx, fxList) {'), repr(lines[1186][:40])
assert lines[1189].startswith("      if (f.type === 'shot') {"), repr(lines[1189][:60])
assert lines[1626].startswith("      } else if (f.type === 'hitwall') {"), repr(lines[1626][:70])
assert lines[2192].strip() == '}', repr(lines[2192])
assert lines[2193].strip() == '});', repr(lines[2193])
assert lines[2194].strip() == '}', repr(lines[2194])

# 分支体行区间（0-based [start:end)；body 含 L(start+1)..L(end)，end = 下一分支起始行 - 1）
BRANCHES = [
    ('shot',        'fxShot',        (1190, 1626)),
    ('hitwall',     'fxHitwall',     (1627, 1633)),
    ('bullet',      'fxBullet',      (1634, 1641)),
    ('strikeShell', 'fxStrikeShell', (1642, 1680)),
    ('strike',      'fxStrike',      (1681, 1716)),
    ('boom',        'fxBoom',        (1717, 1745)),
    ('flash',       'fxFlashFx',     (1746, 1751)),
    ('vine',        'fxVine',        (1752, 1797)),
    ('thorn',       'fxThorn',       (1798, 1831)),
    ('mine',        'fxMine',        (1832, 1874)),
    ('turret',      'fxTurret',      (1875, 1913)),
    ('cyclone',     'fxCyclone',     (1914, 1939)),
    ('pillar',      'fxPillar',      (1940, 2009)),
    ('fireWall',    'fxFireWall',    (2010, 2044)),
    ('rain',        'fxRain',        (2045, 2056)),
    ('raindrop',    'fxRaindrop',    (2057, 2087)),
    ('particle',    'fxParticleFx',  (2088, 2103)),
    ('ring',        'fxRingFx',      (2104, 2112)),
    ('beam',        'fxBeamFx',      (2113, 2120)),
    ('beamp',       'fxBeamp',       (2121, 2177)),
    ('match',       'fxMatch',       (2178, 2191)),
]

def dedent(blk):
    return [l[2:] if l.startswith('  ') else l for l in blk]

# 生成 handler 方法块
handlers = []
for typ, mname, (s, e) in BRANCHES:
    body = dedent(lines[s:e])
    while body and not body[0].strip(): body.pop(0)
    while body and not body[-1].strip(): body.pop()
    handlers.append((typ, mname, ['  ' + mname + '(ctx, f) {'] + body + ['  }']))

for typ, mname, m in handlers:
    assert m[1].strip(), mname

# FX_HANDLERS 表（模块级，插在 class Renderer 前）
map_lines = ['// 区C · 技能特效 handler 分发表：f.type → Renderer 方法（v1.16.43 重构，拆自原 fx()）',
             'const FX_HANDLERS = {']
for i, (typ, mname, _m) in enumerate(handlers):
    comma = ',' if i < len(handlers) - 1 else ''
    map_lines.append("  %s: '%s'%s" % (typ, mname, comma))
map_lines.append('};')

# 新 fx()：dispatch
new_fx = ['  /** 打击特效（区C）：统一 dispatch——22 种 f.type 各由独立 handler 渲染（v1.16.43 重构） */',
          '  fx(ctx, fxList) {',
          '    fxList.forEach((f) => {',
          '      if (f.t < 0) return; // v1.13.8：延迟帧动画（火雨连续波次 stagger）未到时跳过渲染',
          '      const h = FX_HANDLERS[f.type];',
          '      if (h) this[h](ctx, f);',
          '    });',
          '  }']

assert lines[155].startswith('class Renderer {'), repr(lines[155])
class_idx = 155
mid = []
for typ, mname, m in handlers:
    mid += m + ['']

new_lines = lines[:class_idx] + map_lines + [''] + lines[class_idx:1186] + new_fx + [''] + mid + lines[2195:]
with io.open(P, "w", encoding="utf-8", newline="") as f:
    f.write("\n".join(new_lines))
print("OK, new length:", len(new_lines))
