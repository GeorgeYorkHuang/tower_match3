# -*- coding: utf-8 -*-
"""读取 docs/exp-curve-current-data.csv，绘制当前经验获取 / 升级曲线三面板图（浅色主题）。"""
import csv, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.ticker import FuncFormatter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'docs', 'exp-curve-current-data.csv')
PNG = os.path.join(ROOT, 'docs', 'exp-curve-current.png')

FP = 'C:/Windows/Fonts/msyh.ttc'
if os.path.exists(FP):
    font_manager.fontManager.addfont(FP)
    plt.rcParams['font.family'] = 'Microsoft YaHei'
plt.rcParams['axes.unicode_minus'] = False

with open(CSV, newline='', encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))
D = {int(r['wave']): r for r in rows}

def num(r, k):
    v = r.get(k, '')
    try: return float(v)
    except (TypeError, ValueError): return None

W = list(range(1, 91))
anc_supply = [num(D[w], 'anc_supply') if w <= 60 else None for w in W]
aby_supply = [num(D[w], 'aby_supply') for w in W]
anc_cum = [num(D[w], 'anc_cum') if w <= 60 else None for w in W]
aby_cum = [num(D[w], 'aby_cum') for w in W]
anc_lv = [num(D[w], 'anc_level') if w <= 60 else None for w in W]
aby_lv = [num(D[w], 'aby_level') for w in W]

BG, FG, GRID = '#ffffff', '#1f2937', '#e5e9f0'
C_ANC, C_ABY, C_THR = '#e8590c', '#6741d9', '#0ca678'
fig, axes = plt.subplots(3, 1, figsize=(13, 13), facecolor=BG)
fig.suptitle('当前经验获取曲线与升级曲线  ·  代码实算 / 全歼 / 无经验圣遗物',
             fontsize=17, fontweight='bold', color=FG, y=0.985)
for ax in axes:
    ax.set_facecolor('#fbfcfe')
    ax.grid(True, color=GRID, linewidth=0.8, alpha=0.9)
    ax.tick_params(colors='#4b5563', labelsize=10)
    for sp in ax.spines.values(): sp.set_color('#cbd5e1')
    ax.set_xlim(1, 90)
    ax.set_xticks(range(0, 91, 10))

# --- Panel A 逐波经验获取 ---
ax = axes[0]
ax.plot(W, aby_supply, color=C_ABY, lw=1.9, ls='--', alpha=0.85,
        label='深渊 abyss（W1–90，无脚本 Boss）')
ax.plot(W[:60], anc_supply[:60], color=C_ANC, lw=2.7, zorder=4,
        label='普通战场 ancient（W1–60，含脚本 Boss）')
ax.text(1.5, 8600, '两曲线仅 W20 / 40 / 60（脚本 Boss 波）与 W61–90 分离', fontsize=9, color='#6b7280')
for w in (20, 40, 60):
    ax.axvline(w, color='#94a3b8', ls='--', lw=0.9, alpha=0.7)
    ax.annotate('W%d 普通凹陷\n%.0f' % (w, anc_supply[w-1]), xy=(w, anc_supply[w-1]),
                xytext=(w + 1.5, anc_supply[w-1] + 2100), fontsize=9, color=C_ANC,
                arrowprops=dict(arrowstyle='->', color=C_ANC, lw=0.9))
ax.set_ylabel('每波经验', fontsize=11, color=FG)
ax.set_title('A  经验获取曲线：逐波入账（三消 41.75 + 波末 20 + 击杀 × 波次倍率）',
             fontsize=12, color=FG, loc='left', pad=10)
ax.legend(loc='upper left', fontsize=10, framealpha=0.95, facecolor='#ffffff', edgecolor='#cbd5e1')
ax.yaxis.set_major_formatter(FuncFormatter(lambda x, p: '{:,.0f}'.format(x)))

# --- Panel B 累计经验 vs 升级阈值 ---
ax = axes[1]
ax.plot(W, aby_cum, color=C_ABY, lw=1.9, ls='--', alpha=0.85, label='深渊累计')
ax.plot(W[:60], anc_cum[:60], color=C_ANC, lw=2.7, zorder=4, label='普通战场累计')
ax.axhline(143479, color=C_THR, ls='--', lw=1.4, label='E(35) = 143,479  通关目标')
ax.axhline(401555, color='#d6336c', ls='--', lw=1.4, label='E(48) = 401,555  满级阈值')
ax.axvline(60, color='#94a3b8', ls=':', lw=1.1)
ax.axvline(90, color='#94a3b8', ls=':', lw=1.1)
ax.annotate('W60  143,546 → L35\n余量仅 +67', xy=(60, 143546), xytext=(33, 205000),
            fontsize=10, color=C_ANC, fontweight='bold',
            arrowprops=dict(arrowstyle='->', color=C_ANC, lw=1.1))
ax.annotate('W90  405,453 → L48', xy=(90, 405453), xytext=(62, 335000),
            fontsize=10, color=C_ABY, fontweight='bold',
            arrowprops=dict(arrowstyle='->', color=C_ABY, lw=1.1))
ax.set_ylabel('累计经验', fontsize=11, color=FG)
ax.set_title('B  累计经验 vs 升级阈值', fontsize=12, color=FG, loc='left', pad=10)
ax.legend(loc='upper left', fontsize=10, framealpha=0.95, facecolor='#ffffff', edgecolor='#cbd5e1')
ax.yaxis.set_major_formatter(FuncFormatter(lambda x, p: '%.0f万' % (x / 10000)))

# --- Panel C 等级曲线 ---
ax = axes[2]
ax.plot(W, aby_lv, color=C_ABY, lw=1.9, ls='--', alpha=0.85, label='深渊等级')
ax.plot(W[:60], anc_lv[:60], color=C_ANC, lw=2.7, zorder=4, label='普通战场等级')
ax.axhline(35, color=C_THR, ls='--', lw=1.3, label='L35 通关目标 / L48 深渊目标')
ax.axhline(48, color='#d6336c', ls='--', lw=1.3)
ax.axvline(60, color='#94a3b8', ls=':', lw=1.1)
for w, lv, txt in [(10, 10, 'W10 L10'), (27, 20, 'W27 L20'), (60, 35, 'W60 L35'),
                   (73, 40, 'W73 L40'), (90, 48, 'W90 L48')]:
    ax.plot([w], [lv], 'o', color='#1f2937', ms=4.5, zorder=5)
    dx = -13 if w >= 90 else 1
    ax.annotate(txt, xy=(w, lv), xytext=(w + dx, lv - 3.4), fontsize=9, color='#374151')
ax.set_ylabel('经验等级（0–48）', fontsize=11, color=FG)
ax.set_xlabel('波次', fontsize=11, color=FG)
ax.set_ylim(0, 52)
ax.set_yticks(range(0, 51, 10))
ax.set_title('C  升级曲线：等级 vs 波次（前期 1.2 波/级 → 中期 2.6 → 满级冲刺 1.7）',
             fontsize=12, color=FG, loc='left', pad=10)
ax.legend(loc='upper left', fontsize=10, framealpha=0.95, facecolor='#ffffff', edgecolor='#cbd5e1')

fig.text(0.012, 0.012,
         '口径：全歼 / 无经验圣遗物 / 三消按形状分布解析期望 41.75 / 稳态 4 塔波末 20；'
         '击杀经验逐只 round(kill[type] × (1+0.045×(w−1)))。脚本 Boss 波按血量实体数计。',
         fontsize=9, color='#6b7280')
fig.tight_layout(rect=[0, 0.028, 1, 0.97])
fig.savefig(PNG, dpi=140, facecolor=BG)
print('PNG ->', PNG)
