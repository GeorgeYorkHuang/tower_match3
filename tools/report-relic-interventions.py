"""汇总圣物单独构筑的单因素实验；验证源码、配对与干预范围，不改游戏数值。"""
from pathlib import Path
import csv
import gzip
import hashlib
import json
import math
import statistics

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
FIELDS = {'ancient': '圣坛花园', 'lava': '熔岩矿场', 'frost': '霜风峡谷'}
LABELS = {'baseline': '当前值', 'damage20': '六塔伤害＋20%', 'exp20': '经验入账＋20%',
          'boss80': 'W40本体血量80%', 'boss50': 'W40本体血量50%'}


def read(name):
    return json.loads(gzip.decompress((DOCS / name).read_bytes()))


def key(row):
    return tuple(row[k] for k in ['route', 'field', 'seed', 'profile'])


base_data = [read(f'relic-only-{route}-build.json.gz') for route in ['primary', 'secondary']]
source = base_data[0]['sourceHashes']
baseline = [r for d in base_data for r in d['runs']]
indexed = {key(r): r for r in baseline}
assert len(indexed) == len(baseline) == 72
for d in base_data:
    assert d['sourceHashes'] == source
for file, digest in source.items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
groups = {'baseline': baseline}
prefix_checks = 0
for name in ['damage20', 'exp20', 'boss80', 'boss50']:
    data = read(f'relic-intervention-{name}.json.gz')
    assert data['sourceHashes'] == source and not data['liveChanges']
    assert data['frozenRuntime'] and data['reproducedBaseline'] and data['passiveReplayChecked']
    rs = groups[name] = data['runs']
    expected = set(indexed) if not name.startswith('boss') else {
        key(r) for r in baseline if r['field'] == 'ancient' and r['wave'] == 40}
    assert {key(r) for r in rs} == expected and len(rs) == len(expected)
    for r in rs:
        a = r['observations']['intervention']
        if name == 'damage20':
            assert a['damageCalls'] > 0 and not a['xpCalls'] and not a['bossBodies']
            assert math.isclose(a['scaledDamageInput'], a['rawDamageInput'] * 1.2, rel_tol=1e-10)
        elif name == 'exp20':
            assert a['xpCalls'] > 0 and not a['damageCalls'] and not a['bossBodies']
            assert math.isclose(a['grantedXp'], a['originalXp'] * 1.2, rel_tol=1e-10)
        else:
            assert not a['damageCalls'] and not a['xpCalls'] and len(a['bossBodies']) == 1
            assert a['bossBodies'][0]['before'] == 540000
            assert a['bossBodies'][0]['after'] == (432000 if name == 'boss80' else 270000)
            b = indexed[key(r)]
            # 仅W40出生后改变本体：此前逐波结果、选牌和W40入场状态必须相同。
            assert [w for w in r['waves'] if w['wave'] < 40] == [w for w in b['waves'] if w['wave'] < 40]
            assert r['observations']['entries'] == b['observations']['entries']
            boundary = next(w['startAt'] for w in b['waves'] if w['wave'] == 40)
            assert [c for c in r['relicChoices'] if c['at'] < boundary] == [c for c in b['relicChoices'] if c['at'] < boundary]
            if name == 'boss50':
                members = r['waves'][-1]['boss']['members']
                assert len(members) == 2 and all(e['phase'] == 2 and e['maxHp'] == 172800 for e in members)
            prefix_checks += 1


def aggregate(rs):
    return dict(runs=len(rs), passed20=sum(r['clearedWaves'] >= 20 for r in rs),
                reached40=sum(r['wave'] >= 40 for r in rs),
                passed40=sum(r['terminal'] == 'window_complete' for r in rs),
                timeCaps=sum(r['terminal'] == 'time_cap' for r in rs),
                medianEndWave=statistics.median(r['wave'] for r in rs))


aggregates = []
paired = []
for name in ['baseline', 'damage20', 'exp20']:
    for field in FIELDS:
        for route in ['all', 'primary', 'secondary']:
            rs = [r for r in groups[name] if r['field'] == field and (route == 'all' or r['route'] == route)]
            aggregates.append(dict(treatment=name, field=field, route=route, **aggregate(rs)))
    if name != 'baseline':
        pairs = [(indexed[key(r)], r) for r in groups[name]]
        paired.append(dict(treatment=name,
                           laterEndWave=sum(r['wave'] > b['wave'] for b, r in pairs),
                           sameEndWave=sum(r['wave'] == b['wave'] for b, r in pairs),
                           earlierEndWave=sum(r['wave'] < b['wave'] for b, r in pairs),
                           newlyPassed40=sum(r['terminal'] == 'window_complete' and b['terminal'] != 'window_complete' for b, r in pairs),
                           lostPassed40=sum(r['terminal'] != 'window_complete' and b['terminal'] == 'window_complete' for b, r in pairs)))

# 生长比较只用三组都进入同一节点的交集，避免幸存者构成不同导致均值误读。
growth = []
maps = {n: {key(r): r for r in groups[n]} for n in ['baseline', 'damage20', 'exp20']}
for wave in [20, 40]:
    common = [k for k in indexed if all(any(e['wave'] == wave for e in maps[n][k]['observations']['entries']) for n in maps)]
    for n in maps:
        entries = [next(e for e in maps[n][k]['observations']['entries'] if e['wave'] == wave) for k in common]
        growth.append(dict(treatment=n, wave=wave, commonCases=len(common),
                           meanTowerLevel=statistics.mean(statistics.mean(e['levels'].values()) for e in entries),
                           meanRelicCount=statistics.mean(sum(e['relics'].values()) for e in entries)))

boss_rows = []
natural = [r for r in baseline if r['field'] == 'ancient' and r['wave'] == 40]
for name in ['baseline', 'boss80', 'boss50']:
    for r in natural if name == 'baseline' else groups[name]:
        w = r['waves'][-1]
        members = w['boss']['members']
        boss_rows.append(dict(treatment=name, route=r['route'], profile=r['profile'], seed=r['seed'],
                              terminal=r['terminal'], seconds=w['seconds'], phase=w['boss']['phase'],
                              hp=sum(max(0, e['hp']) for e in members), maxHp=sum(e['maxHp'] for e in members)))

summary = dict(date='2026-11-10', sourceHashes=source, gameNumericalChanges=False,
               baselineRuns=72, interventionRuns=sum(len(groups[n]) for n in groups if n != 'baseline'),
               scope='Naturally acquired1star in-battle relics; no shop, red cards, talents or permanent bonuses',
               aggregates=aggregates, paired=paired, growth=growth, gardenBoss= boss_rows,
               verifiedBossPrefixes=prefix_checks,
               notes=['damage20 scales tower damage entry events before armor; not base attack config',
                      'exp20 scales all positive gainExp input; no threshold/initial level change',
                      'boss probes replay only2 naturally reached baseline cases fromW1; twins unchanged'])
(DOCS / 'relic-interventions-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
for filename, rs in [('relic-interventions-aggregates.csv', aggregates), ('relic-interventions-garden40.csv', boss_rows)]:
    with (DOCS / filename).open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=list(rs[0])); writer.writeheader(); writer.writerows(rs)

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False
fig, axes = plt.subplots(1, 2, figsize=(12, 5.5))
for i, (name, color) in enumerate([('baseline', '#8d969e'), ('damage20', '#c78234'), ('exp20', '#378879')]):
    rows = [r for r in aggregates if r['treatment'] == name and r['route'] == 'all']
    x = [j + (i - 1) * .25 for j in range(3)]
    for ax, metric in zip(axes, ['passed20', 'passed40']):
        values = [r[metric] for r in rows]
        ax.bar(x, values, .23, color=color, label=LABELS[name])
        for at, v in zip(x, values): ax.text(at, v + .3, str(v), ha='center', fontsize=10)
for ax, title in zip(axes, ['完全通过W20', '完全通过W40']):
    ax.set_title(title + '（每组24个样本）'); ax.set_xticks(range(3), list(FIELDS.values()))
    ax.set_ylim(0, 27); ax.set_yticks(range(0, 25, 6)); ax.grid(axis='y', alpha=.15)
    ax.spines[['top', 'right']].set_visible(False)
axes[0].legend(loc='lower right')
fig.suptitle('只用局内一星圣物｜输出与经验单因素对照', fontsize=16)
fig.text(.5, .035, '两套技能路线 × 六种四塔组合 × 两种子；样本通过数，不代表真人胜率。正式游戏数值未改。', ha='center', fontsize=10)
fig.subplots_adjust(top=.81, bottom=.16, wspace=.25)
fig.savefig(DOCS / 'relic-interventions-overview.png', dpi=160, facecolor='white'); plt.close(fig)

md = ['# 圣物单独构筑：输出、经验与花园W40单因素对照', '',
      '日期：2026-11-10。正式游戏文件及数值未修改；干预仅在独立离线进程的当前战斗实例中生效。', '',
      '## 范围与干预', '',
      '- 沿用72组一星圣物基线：三地图、两套技能路线、六种四塔组合、种子41/123，每2秒操作。圣物走真实掉落→入盘→开箱→三选一流程。',
      '- 排除商店、红卡、整个天赋盘、局外圣物加成、二/三星圣物养成、广告复活与重掷。固定路线和选牌启发式不是最优构筑搜索。',
      '- 输出组：六塔普攻、技能及持续伤害进入伤害结算时统一×1.2，再处理护甲；费用、技能倍率、射速不改。这不等同于把基础攻击配置加20%。',
      '- 经验组：所有正经验入账×1.2；经验门槛、初始等级与初始经验不改。后续自然升级及其耗能变化照常发生。',
      '- Boss组：仅对原基线自然到达花园W40的两组，从W1重放；本体血量改为80%或50%，分身血量、护甲、攻城伤害、共鸣和回血全部保留。没有把强行空降W40的样本混入统计。',
      '- 输出/经验各72组，Boss各2组，共148组新增干预回放；旧基线72组复用。每个采集进程另做无干预基线完整复现及观察器被动对照。', '',
      '## 三地图结果', '',
      '| 地图 | 调整 | 通过W20 | 到达W40 | 通过W40 | 终止波中位 |',
      '| --- | --- | ---: | ---: | ---: | ---: |']
for field, label in FIELDS.items():
    for n in ['baseline', 'damage20', 'exp20']:
        r = next(a for a in aggregates if a['field'] == field and a['treatment'] == n and a['route'] == 'all')
        md.append(f'| {label} | {LABELS[n]} | {r["passed20"]}/24 | {r["reached40"]}/24 | {r["passed40"]}/24 | {r["medianEndWave"]:.1f} |')
md += ['', '通过W40指Boss及残怪全部清理，只有到达不算通过；时间上限也不算通过。', '',
       '![单因素对照](relic-interventions-overview.png)', '',
       '同种子并不代表干预后棋盘、选牌和升级仍完全相同：更快击杀会改变随机调用顺序和后续决策。这是整场策略回放的净结果，不能全部解释为同一弹体的纯伤害差值。', '',
       '| 调整 | 终止波更晚 | 相同 | 更早 | 新增通过W40 | 原通过变失败 |',
       '| --- | ---: | ---: | ---: | ---: | ---: |']
for r in paired:
    md.append(f'| {LABELS[r["treatment"]]} | {r["laterEndWave"]} | {r["sameEndWave"]} | {r["earlierEndWave"]} | {r["newlyPassed40"]} | {r["lostPassed40"]} |')
md += ['', '## 同一批入场样本的成长', '',
       '仅比较三组都到达该节点的交集；以下均值不拿不同幸存者混比。', '',
       '| 节点 | 调整 | 交集样本 | 四塔平均等级 | 入场圣物平均张数 |', '| --- | --- | ---: | ---: | ---: |']
for r in growth:
    md.append(f'| W{r["wave"]} | {LABELS[r["treatment"]]} | {r["commonCases"]} | {r["meanTowerLevel"]:.2f} | {r["meanRelicCount"]:.2f} |')
md += ['', '## 花园W40：降低本体血量不等于降低整场Boss血量', '',
       '| 调整/种子 | 结果 | 失守时阶段 | 该阶段剩余血量合计 | 本波时间 |', '| --- | --- | ---: | ---: | ---: |']
for r in boss_rows:
    md.append(f'| {LABELS[r["treatment"]]}·{r["seed"]} | 未通过 | {r["phase"]} | {r["hp"]:.0f}/{r["maxHp"]:.0f} | {r["seconds"]:.1f}秒 |')
md += ['',
       '两组原基线在失守前仅对本体造成约10.9万、11.2万净生命损失，而原本体需要损失21.6万才分裂。改成80%血仍需17.28万，因此仍卡在一阶段；改成50%血只需10.8万，能进入二阶段，但两个分身仍各17.28万，最后几乎满血。两组均未通过。', '',
       '原配置本体54万、60%分裂；忽略护甲、护盾、小怪及回血，清完本体到分裂和两个分身至少需21.6万＋34.56万＝56.16万净伤害，是W20本体5.2万的10.8倍。这只是生命门槛的算术比较，不能替代实际输出与攻城窗口测算。', '',
       '本体减半测试不代表把Boss配置总血量减半；实际修改配置中的基础血量还会影响分身，这种联动方案本轮没有测试。不得据此直接认定全局基础攻击应翻倍。', '',
       '## 结论与下一步建议', '',
       '本批72组基线通过W40为3组；只增加输出后为23组，只增加经验后为16组。输出组终止波更晚56组、更早1组；经验组更晚48组、更早5组，且有2组原通过样本转为未通过。现有样本更支持优先补有效伤害，而不是先加经验或重新降低能耗。', '',
       '经验入账增加20%，在三组共同到达节点的样本里，W20入场四塔平均等级约从4.76到5.02，W40从7.50到7.94；没有等比例转化成20%的战斗输出提升。升级也会同时改变费用与技能选择，不能把经验倍率直接当作伤害倍率。', '',
       '花园W40仍是单独瓶颈：输出组到达10/24、通过1/24，经验组到达8/24、通过1/24。下一轮应把六塔伤害增益作为候选，并另调花园W40的本体、分身及攻城窗口总预算。不能只砍一阶段血量，也不在同一轮同时改经验和能耗。20%是本轮验证过的候选尺度，尚不是已确认的正式发布值。', '',
       '当前结果仍存在构筑差距：火/冰/电/炮组合在基线、输出组、经验组均无样本通过W40。因此，整体有效输出不足与技能路线间不平衡可能同时存在；本轮不能证明六塔基础攻击都该统一增加20%。后续正式落地前需要拆开普攻、周期技能和驻场伤害，并保护W1–10的原有开局节奏。', '',
       '## 验证与复跑', '',
       f'- JS源码逐文件SHA-256与圣物原基线一致；四份结果均无运行中源码变化。Boss组W40之前逐波、选牌及入场快照一致，共{prefix_checks}组通过。',
       '- 输出组仅记录伤害×1.2，无经验或Boss改动；经验组仅记录经验×1.2；Boss组仅本体出生时改血，二阶段分身实测仍各172800。',
       '- 干预单元用例、圣物策略、移动采集、观察器、切波能量边界检查通过；尚未真机复测。',
       '- `node tools/collect-relic-interventions.cjs damage20`（另支持exp20、boss80、boss50）；`node tools/test-relic-interventions.cjs`；`python tools/report-relic-interventions.py`。',
       '- 原始数据为`docs/relic-intervention-*.json.gz`，含候选/选择、升级、逐波能量、W20/W40快照与Boss血量时间线。', '']
(DOCS / 'relic-interventions-analysis.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(aggregates=[r for r in aggregates if r['route'] == 'all'], paired=paired, growth=growth, gardenBoss=boss_rows), ensure_ascii=False))
