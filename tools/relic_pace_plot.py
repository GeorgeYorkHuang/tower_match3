# -*- coding: utf-8 -*-
"""圣遗物获取节奏对照图（只读，浅色主题）"""
import csv, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import numpy as np

plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'docs', 'relic-pace-data.csv')
OUT = os.path.join(ROOT, 'docs', 'relic-pace.png')

with open(CSV, encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))
W = [int(r['wave']) for r in rows]
N = lambda k: [float(r[k]) if r[k] != '' else 0.0 for r in rows]

exp = N('chestExpect')
cum = N('cumActual')
ideal = [int(r['wave']) for r in rows if int(r['wave']) <= 60 and int(r['idealGet']) == 1]
minchg = [int(r['wave']) for r in rows if int(r['wave']) <= 60 and int(r['minGet']) == 1]

C_BG, C_FG, C_GRID = '#ffffff', '#1f2937', '#e5e7eb'
C_NOW, C_IDEAL, C_ALT = '#d97706', '#0f766e', '#7c3aed'

fig, axes = plt.subplots(3, 1, figsize=(12.2, 11.4), facecolor=C_BG)
fig.suptitle('圣遗物获取节奏：现状 vs 建议曲线（W1–90，40 秒/波）', fontsize=16, color=C_FG, y=0.985)

# ---------- Panel A ----------
ax = axes[0]
ax.set_facecolor('#fafafa')
ax.bar(W[:60], exp[:60], color=C_NOW, alpha=0.55, width=0.85, label='现状：每波期望宝箱数')
for i, w in enumerate(ideal):
    ax.plot([w, w], [0, 1.62], color=C_IDEAL, lw=1.7, alpha=0.85,
            label='建议获取点（11 个）' if i == 0 else None)
    ax.plot(w, 1.65, 'v', color=C_IDEAL, ms=6)
ax.text(1.4, 1.40, 'W1–4 / W6 完全无获取机会', fontsize=9.5, color='#b45309')
ax.annotate('首个可能掉落：W5（仅 55%）', xy=(5, 0.55), xytext=(8, 0.95),
            fontsize=9.5, color='#b45309',
            arrowprops=dict(arrowstyle='->', color='#b45309', lw=1.1))
ax.text(36, 1.40, 'W51–60 期望 7.55 件（每 1.3 波一件）', fontsize=9.5, color='#b45309')
ax.set_xlim(0, 61); ax.set_ylim(0, 2.15)
ax.set_ylabel('件 / 波', fontsize=10.5, color=C_FG)
ax.set_title('A  每波获取密度：现状前段空窗、后段过密', fontsize=12, color=C_FG, loc='left', pad=8)
ax.grid(axis='y', color=C_GRID, lw=0.8); ax.set_axisbelow(True)
ax.legend(loc='upper left', fontsize=9, ncol=1, frameon=True,
          facecolor='white', edgecolor=C_GRID, framealpha=0.95)
for s in ax.spines.values(): s.set_color(C_GRID)

# ---------- Panel B ----------
ax = axes[1]
ax.set_facecolor('#fafafa')
ax.plot(W, cum, color=C_NOW, lw=2.3, label='现状累计（W60 = 27.8 件，W90 = 55.5 件）')
ideal_cum = [sum(1 for x in ideal if x <= w) for w in W]
min_cum = [sum(1 for x in minchg if x <= w) for w in W]
ax.step(W[:60], ideal_cum[:60], where='post', color=C_IDEAL, lw=2.3, label='建议：递增 11 件（W2 起，W55 止）')
ax.step(W[:60], min_cum[:60], where='post', color=C_ALT, lw=1.8, ls='--', alpha=0.9,
        label='方案 B：Boss 对齐 12 件')
ax.axhline(45, color='#dc2626', lw=1.5, ls=':')
ax.text(1.5, 46.7, '候选池上限 45 张', fontsize=9.5, color='#dc2626')
ax.text(62, 50.5, '深渊 W90：55.5 件 > 45 张', fontsize=9.5, color='#dc2626')
ax.text(62, 47.6, '→ 宝箱开不出卡', fontsize=9.5, color='#dc2626')
ax.annotate('W60 = 27.8', xy=(60, cum[59]), xytext=(45, 33), fontsize=9.5, color='#b45309',
            arrowprops=dict(arrowstyle='->', color='#b45309', lw=1.1))
ax.annotate('W60 = 11', xy=(60, 11), xytext=(62, 15), fontsize=9.5, color=C_IDEAL,
            arrowprops=dict(arrowstyle='->', color=C_IDEAL, lw=1.1))
ax.axvline(60, color='#9ca3af', lw=1.0, ls='-.')
ax.text(60.6, 3, '普通战场结束', fontsize=9, color='#6b7280')
ax.set_xlim(0, 91); ax.set_ylim(0, 62)
ax.set_ylabel('累计件数', fontsize=10.5, color=C_FG)
ax.set_title('B  累计获取量：现状溢出，深渊会抽空候选池', fontsize=12, color=C_FG, loc='left', pad=8)
ax.grid(axis='y', color=C_GRID, lw=0.8); ax.set_axisbelow(True)
ax.legend(loc='upper left', fontsize=9, frameon=False)
for s in ax.spines.values(): s.set_color(C_GRID)

# ---------- Panel C ----------
ax = axes[2]
ax.set_facecolor('#fafafa')
labels = ['W1-10', 'W11-20', 'W21-30', 'W31-40', 'W41-50', 'W51-60']
gaps = [5.88, 3.28, 2.44, 1.83, 1.69, 1.32]
xs = np.arange(len(labels))
ax.bar(xs - 0.2, gaps, width=0.4, color=C_NOW, alpha=0.7, label='现状：平均每几波 1 件')
ax.axhspan(3, 8, color=C_IDEAL, alpha=0.10)
ax.axhline(5.5, color=C_IDEAL, lw=1.6, ls='--', label='建议目标带 3–8 波（均值 5.5）')
ideal_gaps = [ideal[i + 1] - ideal[i] for i in range(len(ideal) - 1)]
ax.set_xticks(xs); ax.set_xticklabels(labels)
ax.set_ylim(0, 9.2)
ax.text(0.1, 8.45, '建议逐次间隔（波）：' + ', '.join(map(str, ideal_gaps)) + '  →  2→7 递增，均值 5.3',
        fontsize=9.5, color=C_IDEAL)
ax.set_ylabel('波 / 件', fontsize=10.5, color=C_FG)
ax.set_title('C  间隔形状：现状前段 >5.9 波（过疏）、后段 <1.4 波（过密）', fontsize=12, color=C_FG, loc='left', pad=8)
ax.grid(axis='y', color=C_GRID, lw=0.8); ax.set_axisbelow(True)
ax.legend(loc='upper right', fontsize=9, frameon=False, bbox_to_anchor=(1.0, 0.93))
for s in ax.spines.values(): s.set_color(C_GRID)

for ax in axes:
    ax.tick_params(colors='#4b5563', labelsize=9)
    ax.xaxis.label.set_color(C_FG)

plt.tight_layout(rect=[0, 0, 1, 0.975])
plt.savefig(OUT, dpi=140, facecolor=C_BG)
print('saved ->', OUT)
print('建议波次', ideal)
print('建议间隔', ideal_gaps)
print('现状分段间隔', gaps)
