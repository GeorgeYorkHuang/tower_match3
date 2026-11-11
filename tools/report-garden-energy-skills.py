"""汇总保留Boss收费的单技能能耗对照；候选没有稳定收益时不改正式配置。"""
from pathlib import Path
import gzip
import hashlib
import json
import statistics

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
LABELS = {'baseline': '原版', 'fire60': '只降多重火球', 'heavy60': '只降重炮',
          'double60': '只降双管齐射', 'combined': '组合方案'}


def read(name):
    return json.loads(gzip.decompress((DOCS / f'{name}.json.gz').read_bytes()))


def key(r):
    return r['profile'], r['seed']


def aggregate(rs):
    return dict(runs=len(rs), passed20=sum(r['clearedWaves'] >= 20 for r in rs),
                reached40=sum(r['wave'] >= 40 for r in rs),
                passed40=sum(r['terminal'] == 'window_complete' for r in rs),
                medianEndWave=statistics.median(r['wave'] for r in rs),
                timeCaps=sum(r['terminal'] == 'time_cap' for r in rs))


base = read('garden-attack-stats')
source = base['sourceHashes']
for file, digest in source.items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
baseline = {key(r): r for r in base['runs'] if r['route'] == 'primary'}
assert len(baseline) == 12
unique, screens, full = {}, {}, {}
for name in ['fire60', 'heavy60', 'double60', 'combined']:
    files = [('screen', f'garden-energy-{name}')] if name != 'combined' else []
    if name != 'double60':
        files.append(('full', f'garden-energy-{name}-full'))
    for kind, file in files:
        d = read(file)
        assert d['sourceHashes'] == source and not d['liveChanges']
        assert d['passiveReplayChecked'] and d['reproducedBaseline']
        assert len(d['runs']) == (6 if kind == 'screen' else 12)
        if kind == 'screen':
            screens[name] = d
        else:
            full[name] = d
            assert {key(r) for r in d['runs']} == set(baseline)
        for r in d['runs']:
            assert r['field'] == 'ancient' and r['route'] == 'primary'
            a = r['observations']['skillEnergy']
            assert a['bossOriginal'] == a['bossCharged']
            assert a['regularCharged'] <= a['regularOriginal'] + 1e-8
            identity = (name, *key(r))
            if identity in unique:
                assert unique[identity] == r, 'Reused screen must remain identical'
            unique[identity] = r
            # 不含被调整技能的冰毒电镖组合必须完整复现原生结果。
            if r['profile'] == 'wind_control':
                clean = lambda row: {k: v for k, v in row.items() if k not in ['route', 'energyCandidate', 'observations']}
                assert clean(r) == clean(baseline[key(r)])
assert len(unique) == 42

rows = []
for name, d in full.items():
    rs = d['runs']; old = [baseline[key(r)] for r in rs]
    gained = [key(r) for r in rs if r['terminal'] == 'window_complete' and baseline[key(r)]['terminal'] != 'window_complete']
    lost = [key(r) for r in rs if r['terminal'] != 'window_complete' and baseline[key(r)]['terminal'] == 'window_complete']
    rows.append(dict(name=name, parameters=d['parameters'], **aggregate(rs), newlyPassed=gained, lostPassed=lost))
screen_rows = []
for name, d in screens.items():
    old = [baseline[key(r)] for r in d['runs']]
    screen_rows.append(dict(name=name, original=aggregate(old), candidate=aggregate(d['runs'])))

def energy(rs, tower):
    waves = [w for r in rs if tower in r['keys'] for w in r['waves'] if 25 <= w['wave'] <= 39]
    seconds = sum(w['seconds'] for w in waves)
    return sum(w['towers'].get(tower, {}).get('zeroSeconds', 0) for w in waves) / seconds


energy_rows = [dict(name='baseline', fireZero=energy(list(baseline.values()), 'fire'), cannonZero=energy(list(baseline.values()), 'cannon'))]
for name, d in full.items():
    energy_rows.append(dict(name=name, fireZero=energy(d['runs'], 'fire'), cannonZero=energy(d['runs'], 'cannon')))
summary = dict(date='2026-11-10', sourceHashes=source, gameNumericalChanges=False, adoptedCandidate=None,
               uniqueCandidateRuns=42, screenRuns=18, fullExtraRuns=24, baseline=aggregate(list(baseline.values())),
               full=rows, screens=screen_rows, energy=energy_rows,
               scope='Garden only, primary route, native1star relics,no shop/red/talents. Real costs only; no energy injection; aliveBoss incl mini or bossLock retain old0.8 skill factors.')
(DOCS / 'garden-energy-skills-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False
names = ['baseline'] + list(full)
fig, axes = plt.subplots(1, 2, figsize=(12, 5.7))
values = [summary['baseline']['passed40']] + [r['passed40'] for r in rows]
axes[0].bar(range(4), values, color=['#697c8a', '#bf8a45', '#59928b', '#aa7166'])
for i, value in enumerate(values):
    axes[0].text(i, value + .2, f'{value}/12', ha='center')
axes[0].set_ylim(0, 13); axes[0].set_title('完全清理W40的样本')
for i, (field, label, color) in enumerate([('fireZero', '火塔', '#be7144'), ('cannonZero', '炮塔', '#527e91')]):
    x = [j + (i - .5) * .3 for j in range(4)]; v = [r[field] * 100 for r in energy_rows]
    axes[1].bar(x, v, .27, color=color, label=label)
    for at, value in zip(x, v):
        axes[1].text(at, value + 1, f'{value:.0f}%', ha='center', fontsize=9)
axes[1].set_ylim(0, 75); axes[1].set_title('W25–39零能量时长（按实际时长加权）'); axes[1].legend()
for ax in axes:
    ax.set_xticks(range(4), ['原版', '只降\n多重火球', '只降\n重炮', '组合'])
    ax.grid(axis='y', alpha=.15); ax.spines[['top', 'right']].set_visible(False)
fig.suptitle('普通阶段降费能缓解缺能，但本批未形成稳定通关收益', fontsize=15)
fig.text(.5, .025, '只测圣坛花园强化普攻路线；保留Boss战原收费。两种子×六种四塔组合，不是真人胜率；候选未落地。', ha='center', fontsize=10)
fig.subplots_adjust(top=.82, bottom=.19, wspace=.25)
fig.savefig(DOCS / 'garden-energy-skills-overview.png', dpi=150, facecolor='white'); plt.close(fig)

md = ['# 圣坛花园：多重火球、重炮、双管齐射能效对照', '',
      '日期：2026-11-10。正式游戏数值未改，没有采用本轮候选；三项技能正式系数仍各0.8。六塔攻击配置+20%与W40生命预算保留。', '',
      '## 范围与候选', '',
      '- 只测圣坛花园强化普攻路线，沿用真实一星圣物获取；无商店、红卡、天赋盘、重掷、复活；没有注入能量。',
      '- 单技能筛选：多重火球、重炮、双管齐射分别从0.8改成0.6，其余保持。组合：多重火球0.6、重炮0.6、双管齐射0.7。仍只在首次激活时应用一次，升级不重复折算。',
      '- 普通怪阶段才使用候选；场上存在活Boss（包括每5波小Boss）或处于锁关战时，保留原0.8。Boss战伤害倍率和计费目标数也不改。记录确认每次Boss出手候选收费与该次原价相等，但战斗节奏、构筑和出手次数变化后，Boss战累计耗能不保证等于基线。',
      '- 先在6个预选病例做三项单技能筛选，共18组。再做完整12组组合回放；多重火球和重炮各补齐另外6组并复用各自筛选6组。共有42组唯一候选回放，文件中54条记录含12条明确复用，不重复计算试验次数。',
      '- 完整路线为两种子×六种四塔组合；筛选里有4个失败病例和2个原通过病例，不是随机抽样。', '',
      '## 筛选不能代替完整路线验证', '',
      '| 六病例筛选 | 原通过W40 | 候选通过W40 |', '| --- | ---: | ---: |']
for r in screen_rows:
    md.append(f'| {LABELS[r["name"]]} | {r["original"]["passed40"]}/6 | {r["candidate"]["passed40"]}/6 |')
md += ['', '多重火球和重炮在筛选里各多出1个通过，但扩大到完整路线后没有保住原有通过样本，因此没有仅凭筛选结果上线。双管单项没有新增通过，不继续扩样作为优先候选。', '',
       '| 完整强化路线 | 到达W40 | 通过W40 | 新通过 | 原通过变失败 |', '| --- | ---: | ---: | ---: | ---: |',
       f'| 原版 | {summary["baseline"]["reached40"]}/12 | {summary["baseline"]["passed40"]}/12 | — | — |']
for r in rows:
    md.append(f'| {LABELS[r["name"]]} | {r["reached40"]}/12 | {r["passed40"]}/12 | {len(r["newlyPassed"])} | {len(r["lostPassed"])} |')
md += ['', '通过指Boss及残怪清理完毕；到达不等于通过。均无时间上限结果计入通过。', '',
       '## 缺能改善与构筑结果不是一回事', '',
       '| 方案 | 火塔零能量占比 | 炮塔零能量占比 |', '| --- | ---: | ---: |']
for r in energy_rows:
    md.append(f'| {LABELS[r["name"]]} | {r["fireZero"]:.1%} | {r["cannonZero"]:.1%} |')
md += ['', '上表覆盖完整12组中携带对应塔的W25–39时段，按各自实际时长加权；不是完全相同时长的固定靶对照，也不是只统计原失败的11组。因此原版58.7%/46.5%与上一份“失败样本”报告的68.5%/59.3%口径不同。', '',
       '本批多重火球和重炮单项各新增火冰电炮·123通过，但火冰毒炮·41及·123均由通过变为失败。组合没有新增通过，同样损失这两例。进入W40时的卡片内容、残怪、城墙和部分塔等级可能变化；相同种子下，扣费改变出手状态、击杀和随机调用，不能把结果简化为“降费让技能变弱”，也不能把补能诊断通过当作小幅降费必然有效。', '',
       '![完整路线对照](garden-energy-skills-overview.png)', '',
       '## 决定与下一步', '',
       '**不落地本轮降费候选，正式0.8保留。**在当前样本里，有缺能改善但没有稳定的通关改善；两个种子不足以证明降费整体有害，同样不足以支持把未验证收益的组合直接发布。', '',
       '下一步应先测电系周期技能（球形闪电、雷暴、极光电击）的每次施法命中、有效覆盖和伤害预算，以及对应冰系控制/护盾的贡献；再对火/炮考虑更细的普攻强化计费与供能设计。保留已有的Boss较高收费、一次扣费、缺能继续释放、扣费前伤害快照、不退能/不飞行中重索敌等约定。暂不加六塔攻击，也不进一步削W40。', '',
       '## 校验', '',
       '- 所有候选源码快照与当前攻击配置基线一致，逐文件SHA-256确认正式JS未动，运行中无源码变化。未测试后两图及W41–60。',
       '- 六个采集进程均做无候选完整基线复现与观察器被动对照；复用筛选记录逐项一致。不包含被调整技能的冰毒电镖组合完整复现原结果。',
       '- 候选隔离300组用例通过，覆盖未学/激活/升级、Boss/小Boss/锁关/死亡Boss、非普攻收费不受影响、参数不写回；原始JSON保存原价/候选价与各塔费用记录。',
       '- `node tools/test-garden-energy-candidates.cjs`；`node tools/collect-garden-energy-skills.cjs fire60`（另支持heavy60、double60、combined；加full补齐完整路线）；`python tools/report-garden-energy-skills.py`。', '']
(DOCS / 'garden-energy-skills-analysis.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(uniqueCandidateRuns=len(unique), adopted=None, baseline=summary['baseline'], full=rows), ensure_ascii=False))
