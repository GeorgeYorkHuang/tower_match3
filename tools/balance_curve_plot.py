# -*- coding: utf-8 -*-
"""读取 docs/balance-curve-data.csv，输出关键指标摘要与 docs/balance-curve.png。"""
import csv, math, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'docs', 'balance-curve-data.csv')
PNG = os.path.join(ROOT, 'docs', 'balance-curve.png')

with open(CSV, newline='', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))
for r in rows:
    for k, v in list(r.items()):
        if k not in ('mode',):
            try: r[k] = float(v)
            except (ValueError, TypeError): pass

D = {(r['mode'], int(r['wave'])): r for r in rows}
WAVES = list(range(1, 61))

def series(mode, key):
    return [D[(mode, w)][key] for w in WAVES]

# ---------- 摘要 ----------
print('=== 关键指标（REAL 口径，20 局均值）===')
print('wave  rawHp     effHp     supply   pressure  expLv  towerLv  skills  mult   dps')
for w in [1, 5, 10, 15, 19, 20, 21, 25, 30, 32, 35, 39, 40, 41, 45, 50, 55, 59, 60]:
    r = D[('real', w)]
    print('%4d %9d %9d %9d %9.2f %6.1f %8.1f %7.1f %5.2f %6d' % (
        w, r['rawHp'], r['effHp'], r['supply'], r['pressure'], r['expLevel'],
        r['towerLvSum'], r['activeSkills'], r['skillMult'], r['totalDps']))

print('\n=== Boss 尖峰（effHp 相对相邻非 Boss 波均值）===')
for w in (5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60):
    base = (D[('real', w-1)]['effHp'] + D[('real', w+1)]['effHp'])/2 if w < 60 else D[('real', 59)]['effHp']
    print('W%-2d  effHp=%-9d 相邻均值=%-9d 倍数=%6.2f  scriptBoss=%s' % (
        w, D[('real', w)]['effHp'], base, D[('real', w)]['effHp']/base,
        'Y' if w in (20, 40, 60) else '-'))

print('\n=== 压力 >1 起点与区间 ===')
p = series('real', 'pressure')
start = next((w for w in WAVES[3:] if all(D[('real', x)]['pressure'] > 1 for x in range(w, min(w+5, 61)))), None)
print('连续 5 波以上 pressure>1 的起始波:', start)
print('W1/W5/W10/W20/W40/W60 pressure:', [round(D[('real', w)]['pressure'], 2) for w in (1, 5, 10, 20, 40, 60)])
print('\n=== 成长停滞 ===')
for a, b in [(1, 20), (20, 40), (40, 60)]:
    print('W%d→W%d  expLv %.1f→%.1f | towerLvSum %.1f→%.1f | skillMult %.2f→%.2f | DPS %.0f→%.0f' % (
        a, b, D[('real', a)]['expLevel'], D[('real', b)]['expLevel'],
        D[('real', a)]['towerLvSum'], D[('real', b)]['towerLvSum'],
        D[('real', a)]['skillMult'], D[('real', b)]['skillMult'],
        D[('real', a)]['totalDps'], D[('real', b)]['totalDps']))
print('SIM vs REAL W60 DPS: %.0f vs %.0f' % (D[('sim', 60)]['totalDps'], D[('real', 60)]['totalDps']))

# ---------- 绘图 ----------
try:
    F = lambda s: ImageFont.truetype('C:/Windows/Fonts/arial.ttf', s)
except OSError:
    F = lambda s: ImageFont.load_default()
f_title, f_axis, f_small = F(20), F(13), F(11)
W, H = 1240, 980
BG, FG, GRID = '#ffffff', '#20242b', '#dfe4ea'
RED, BLUE, GREEN, AMBER = '#c0392b', '#185FA5', '#2f8f46', '#B8860B'
im = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(im)

def logv(v): return math.log10(max(1e-6, v))
def frame(x0, y0, x1, y1, title):
    d.rectangle([x0, y0, x1, y1], outline=GRID, width=1)
    d.text((x0, y0-24), title, font=f_title, fill=FG)

def xticks(x0, y1):
    for w in (1, 10, 20, 30, 40, 50, 60):
        x = x0 + (w-1)/59*(x1-x0)
        d.line([(x, y1-6), (x, y1)], fill='#9aa4b0', width=1)
        d.text((x-8, y1+6), str(w), font=f_small, fill='#5f6b78')
    d.text((x1-40, y1+6), 'wave', font=f_small, fill='#5f6b78')

# Panel A: 需求 vs 供给（对数）
x0, x1, y0, y1 = 70, 1190, 60, 370
frame(x0, y0, x1, y1, 'A  Demand (effective HP) vs Supply (DPS x 40s)   [log scale]')
lo, hi = 3.0, 7.0
def yA(v): return y1 - (logv(v)-lo)/(hi-lo)*(y1-y0)
for e in range(3, 8):
    y = yA(10**e)
    d.line([(x0, y), (x1, y)], fill=GRID, width=1)
    d.text((x0-46, y-7), '1e%d' % e, font=f_small, fill='#5f6b78')
for w in (20, 40, 60):
    x = x0 + (w-1)/59*(x1-x0)
    d.line([(x, y0), (x, y1)], fill='#e0c8a0', width=1)
    d.text((x+3, y0+4), 'BOSS %d' % w, font=f_small, fill=AMBER)
for key, col in [('effHp', RED), ('supply', BLUE)]:
    pts = [(x0+(w-1)/59*(x1-x0), yA(D[('real', w)][key])) for w in WAVES]
    d.line(pts, fill=col, width=2, joint='curve')
d.text((x0+12, y1-46), 'demand = effective HP (armor-adjusted)', font=f_axis, fill=RED)
d.text((x0+12, y1-28), 'supply = player DPS x 40s', font=f_axis, fill=BLUE)
xticks(x0, y1)

# Panel B: 压力比（对数）
x0, x1, y0, y1 = 70, 1190, 430, 640
frame(x0, y0, x1, y1, 'B  Pressure index = demand / supply   [log scale, REAL]')
lo, hi = -0.3, 2.5
def yB(v): return y1 - (logv(v)-lo)/(hi-lo)*(y1-y0)
for e, lab in [(0, '1.0'), (1, '10'), (2, '100')]:
    y = yB(10**e)
    d.line([(x0, y), (x1, y)], fill=GRID, width=1)
    d.text((x0-36, y-7), lab, font=f_small, fill='#5f6b78')
y1line = yB(1.0)
d.line([(x0, y1line), (x1, y1line)], fill=GREEN, width=1)
for w in (20, 40, 60):
    x = x0 + (w-1)/59*(x1-x0)
    d.line([(x, y0), (x, y1)], fill='#e0c8a0', width=1)
for mode, col in [('real', RED), ('sim', AMBER)]:
    pts = [(x0+(w-1)/59*(x1-x0), yB(D[(mode, w)]['pressure'])) for w in WAVES]
    d.line(pts, fill=col, width=2, joint='curve')
d.text((x0+12, y0+10), 'green line = parity (1.0): above = wave cannot be cleared in 40s', font=f_axis, fill=GREEN)
d.text((x0+12, y0+30), 'red = real exp (kills + wave bonus)   amber = built-in simulator exp', font=f_small, fill=FG)
xticks(x0, y1)

# Panel C: 成长曲线（归一化到 0-1）
x0, x1, y0, y1 = 70, 1190, 700, 910
frame(x0, y0, x1, y1, 'C  Growth: exp level / tower levels / skill multiplier   [REAL, normalized]')
caps = {'expLevel': 24.0, 'towerLvSum': 28.0, 'skillMult': 2.4}
for frac in (0, .25, .5, .75, 1):
    y = y1 - frac*(y1-y0)
    d.line([(x0, y), (x1, y)], fill=GRID, width=1)
for key, cap, col, lab in [('expLevel', caps['expLevel'], BLUE, 'exp level / 24'),
                           ('towerLvSum', caps['towerLvSum'], GREEN, 'tower level sum / 28'),
                           ('skillMult', caps['skillMult'], AMBER, 'skill multiplier / 2.4')]:
    pts = [(x0+(w-1)/59*(x1-x0), y1-min(1, D[('real', w)][key]/cap)*(y1-y0)) for w in WAVES]
    d.line(pts, fill=col, width=2, joint='curve')
    d.text((x0+12 + list(caps).index(key)*250, y0+10), lab, font=f_small, fill=col)
d.text((x0+12, y1-26), 'all three flatten after wave ~20; skill multiplier reaches 2.12 (theoretical 4.573 = 1.45^3 x 1.5)', font=f_axis, fill=FG)
xticks(x0, y1)

d.text((70, 946), 'source: tools/balance_curve.js  |  20 seeded runs  |  effective HP = sum(hp / (1 - armor))  |  diagnostic model, not a live-combat prediction',
       font=f_small, fill='#5f6b78')
im.save(PNG)
print('\n图已输出:', PNG)
