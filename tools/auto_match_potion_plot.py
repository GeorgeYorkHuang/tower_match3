# -*- coding: utf-8 -*-
"""自动三消药剂 · 切入点与收益点三面板图（浅色主题，只读数据）"""
import csv, os, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.ticker import FuncFormatter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
FONT = 'C:/Windows/Fonts/msyh.ttc'
if os.path.exists(FONT):
    fm.fontManager.addfont(FONT)
    plt.rcParams['font.family'] = fm.FontProperties(fname=FONT).get_name()
plt.rcParams['axes.unicode_minus'] = False

FG, GRID, MUTED = '#1f2937', '#e5e7eb', '#6b7280'
C_AUTO, C_MAN, C_BOSS, C_AD = '#e07a5f', '#3d8b6e', '#c1440e', '#7c5cbf'


def csv_rows(name):
    p = os.path.join(DOCS, name)
    with open(p, encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


val = csv_rows('auto-match-value.csv')
bal = csv_rows('balance-curve-data.csv')
press = {int(r['wave']): float(r['pressure']) for r in bal if r['mode'] == 'real'}
W = list(range(1, 61))

fig, axes = plt.subplots(3, 1, figsize=(12.4, 14.2), facecolor='white')
fig.suptitle('自动三消药剂（30 秒）· 价值基线与切入点', fontsize=19, color=FG, y=0.985, fontweight='bold')

# ---------- A 自动 vs 手动 ----------
ax = axes[0]
labels = ['单次经验', '单次能量', '30 次经验', '30 次能量']
auto = [6.0, 6.0, 150, 180]
man = [7.62, 7.62, 229, 229]
x = range(len(labels)); bw = 0.34
ax.bar([i - bw / 2 for i in x], auto, bw, color=C_AUTO, label='自动（只普通三连，颜色随机）', zorder=3)
ax.bar([i + bw / 2 for i in x], man, bw, color=C_MAN, label='手动（按形状分布，保守下界）', zorder=3)
for i, (a, m) in enumerate(zip(auto, man)):
    ax.text(i - bw / 2, a + 5, str(a), ha='center', fontsize=10, color=C_AUTO)
    ax.text(i + bw / 2, m + 5, str(m), ha='center', fontsize=10, color=C_MAN)
ax.set_xticks(list(x)); ax.set_xticklabels(labels, fontsize=11)
ax.set_ylabel('经验 / 能量点', fontsize=10.5, color=FG)
ax.set_title('A  保底而非外挂：自动效率约为手动的 66%（经验）/ 79%（能量），且未计连锁\n'
             '手动可打 4 连 / 5 连 / 连锁 / 挑塔色 → 实际差距更大；这个区间应保留，不要提速',
             fontsize=11.5, color=FG, loc='left', pad=9)
ax.set_ylim(0, 262)
ax.grid(axis='y', color=GRID, lw=0.8); ax.set_axisbelow(True)
ax.legend(fontsize=10, frameon=True, facecolor='white', edgecolor=GRID, loc='upper left')
for s in ax.spines.values(): s.set_color(GRID)

# ---------- B 波次时间轴 ----------
ax = axes[1]
p = [min(press.get(w, 1), 12) for w in W]
ax.fill_between(W, 0, p, color='#f3d9c8', alpha=0.75, zorder=1)
ax.plot(W, p, color='#d9a183', lw=1.4, zorder=2)
ax.text(3, 2.7, '难度压力 pressure（封顶 12）', fontsize=9, color='#a8704f',
        bbox=dict(facecolor='white', edgecolor='none', alpha=0.88, pad=2))
ax.axvline(2.5, color='#9ca3af', lw=1.4, ls=':', zorder=3)
ax.text(1.3, 8.3, 'W1–2 禁用\n会替玩家选塔', fontsize=9.5, color='#b91c1c', ha='left')
ax.axvspan(7, 10, color='#dbeafe', alpha=0.85, zorder=0)
ax.text(8.5, 8.3, 'W7 起\n买得起', fontsize=9.5, color='#1d4ed8', ha='center')
for w, tag in [(20, 'W20 Boss'), (40, 'W40 Boss'), (60, 'W60 Boss')]:
    ax.axvline(w, color=C_BOSS, lw=1.8, ls='--', zorder=3)
    ax.text(w - 0.4 if w == 60 else w, 11.7, tag, fontsize=9.5, color=C_BOSS,
            ha='right' if w == 60 else 'center')
ax.scatter([20, 40, 60], [min(press.get(w, 1), 12) for w in (20, 40, 60)],
           s=56, color=C_BOSS, zorder=5)
ax.axvspan(41, 60, color='#ede9fe', alpha=0.5, zorder=0)
ax.text(50, 6.6, 'W41–60 高压段：Boss 波 + 决策密度回升', fontsize=9.5, color=C_AD, ha='center')
ax.set_xlim(1, 60); ax.set_ylim(0, 12.8)
ax.set_xticks([1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60])
ax.set_xlabel('波次（普通战场 W1–60）', fontsize=10.5, color=FG)
ax.set_ylabel('压力比', fontsize=10.5, color=FG)
ax.set_title('B  切入点时间轴：塔位成型后放开，锚定 Boss 波与高压波（波间给，不占战斗时间）',
             fontsize=12, color=FG, loc='left', pad=9)
ax.grid(axis='y', color=GRID, lw=0.8); ax.set_axisbelow(True)
for s in ax.spines.values(): s.set_color(GRID)

# ---------- C 倍速口径 ----------
ax = axes[2]
speeds = [1, 2, 3, 4]
waves = [0.75, 1.5, 2.25, 3.0]
per_wave = [40, 20, 13.3, 10]
ax2 = ax.twinx()
b = ax.bar([s - 0.17 for s in speeds], waves, 0.34, color=C_AD, label='30 秒覆盖波数（左轴）', zorder=3)
l, = ax2.plot(speeds, per_wave, 'o-', color=C_AUTO, lw=2.4, ms=8, label='每波自动消除次数（右轴）', zorder=4)
for s, v in zip(speeds, waves):
    ax.text(s - 0.17, v + 0.06, str(v), ha='center', fontsize=10, color=C_AD)
for s, v in zip(speeds, per_wave):
    ax2.text(s + 0.12, v + 1.0, str(v), fontsize=10, color=C_AUTO)
ax.set_xticks(speeds); ax.set_xticklabels(['×1', '×2', '×3', '×4'], fontsize=11)
ax.set_xlim(0.5, 4.6); ax.set_ylim(0, 3.6); ax2.set_ylim(0, 48)
ax.set_xlabel('战斗倍速', fontsize=10.5, color=FG)
ax.set_ylabel('覆盖波数', fontsize=10.5, color=C_AD)
ax2.set_ylabel('次 / 波', fontsize=10.5, color=C_AUTO)
ax.set_title('C  计时口径缺陷：药剂按真实秒、战斗按倍速逻辑秒 → ×4 下每波消除密度掉到 1/4',
             fontsize=12, color=FG, loc='left', pad=9)
ax.text(2.55, 3.25, '建议改为按「消除次数」或逻辑秒计时，消除倍速套利',
        fontsize=10, color=MUTED, ha='center')
ax.grid(axis='y', color=GRID, lw=0.8); ax.set_axisbelow(True)
for s in ax.spines.values(): s.set_color(GRID)

plt.tight_layout(rect=[0, 0, 1, 0.975])
out = os.path.join(DOCS, 'auto-match-potion.png')
plt.savefig(out, dpi=150, facecolor='white')
print('saved ->', out)
