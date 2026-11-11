"""拆解花园W25–39压力，补能仅作诊断；不按跨构筑DPS给塔强弱排名。"""
from pathlib import Path
import gzip
import hashlib
import json
import statistics

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
NAMES = dict(fire='火', ice='冰', poison='毒', electric='电', boomerang='镖', cannon='炮')
PROFILES = dict(elements='火冰毒电', no_ice='火毒电炮', wind_control='冰毒电镖', artillery_control='火冰电炮',
                summon_control='火冰毒炮', wind_artillery='火冰镖炮')
ROUTES = dict(primary='强化普攻', secondary='周期/驻场')


def read(name):
    return json.loads(gzip.decompress((DOCS / f'{name}.json.gz').read_bytes()))


def key(r):
    return (r['route'], r['profile'], r['seed'])


baseline = read('garden-attack-stats')
source = baseline['sourceHashes']
for file, digest in source.items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
indexed = {key(r): r for r in baseline['runs']}
assert len(indexed) == 24 and all(r['field'] == 'ancient' for r in baseline['runs'])
failures = [r for r in baseline['runs'] if r['wave'] < 40]
assert len(failures) == 11
metrics = []
for route in ROUTES:
    for tower in NAMES:
        relevant = [r for r in failures if r['route'] == route and tower in r['keys']]
        ws = [w for r in relevant for w in r['waves'] if 25 <= w['wave'] <= 39]
        seconds = sum(w['seconds'] for w in ws)
        if not seconds:
            continue
        def total(field):
            return sum(w['towers'].get(tower, {}).get(field, 0) for w in ws)
        zero, low = total('zeroSeconds'), total('lowSeconds')
        assert -1e-6 <= zero <= low + 1e-6 <= seconds + 1e-5
        metrics.append(dict(route=route, tower=tower, cases=len(relevant), seconds=seconds,
                            zeroFraction=zero / seconds, lowIncludingZeroFraction=low / seconds,
                            meanEnergy=total('energySeconds') / seconds,
                            askedPerSecond=(total('requestedAttackEnergy') + total('requestedSkillEnergy')) / seconds,
                            paidPerSecond=(total('actualAttackEnergy') + total('actualSkillEnergy')) / seconds,
                            observedDps=sum(w['damage'].get(tower, {}).get('total', 0) for w in ws) / seconds,
                            skillCasts=total('skillCasts'), unpaidSkillCasts=total('unpaidSkillCasts')))

conditions = []
for route in ROUTES:
    data = read(f'garden-bottleneck-{route}')
    assert data['sourceHashes'] == source and not data['liveChanges']
    assert data['reproducedBaselines'] and data['passiveReplayChecked'] and len(data['runs']) == 10
    for r in data['runs']:
        b = indexed[key(r)]
        assert [w for w in r['waves'] if w['wave'] < 25] == [w for w in b['waves'] if w['wave'] < 25]
        selected = b['keys'] if r['energyFloor'] == 'all' else [r['energyFloor']]
        assert set(r['observations']['diagnosticEnergy']) <= set(selected)
        conditions.append(dict(route=route, profile=r['profile'], seed=r['seed'], mode=r['energyFloor'],
                               baselineWave=b['wave'], wave=r['wave'], terminal=r['terminal'],
                               extraEnergy=r['observations']['diagnosticEnergy'],
                               energyPerSecond={k: v / max(1e-9, sum(w['seconds'] for w in r['waves'] if w['wave'] >= 25))
                                                for k, v in r['observations']['diagnosticEnergy'].items()}))
case_keys = list(dict.fromkeys(key(r) for r in conditions))
assert len(case_keys) == 4
for k in case_keys:
    rows = [r for r in conditions if key(r) == k]
    assert {r['mode'] for r in rows} == set(indexed[k]['keys']) | {'all'}
summary = dict(date='2026-11-10', sourceHashes=source, gameNumericalChanges=False,
               scope='Garden only; current base attack/growth+20%; no shared multiplier; native1star relics, no shop/red/talents.',
               baselineRuns=24, pre40Failures=len(failures), diagnosticRuns=20,
               routeFailures={route: sum(r['route'] == route for r in failures) for route in ROUTES},
               metrics=metrics, conditions=conditions)
(DOCS / 'garden-bottlenecks-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

# 供浏览的静态图：左侧是失败样本时段加权比例；右侧只显示四个有意选取的诊断样本。
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False
fig, (ax, table_ax) = plt.subplots(1, 2, figsize=(16, 6), gridspec_kw={'width_ratios': [1, 1.8]})
for i, (route, color) in enumerate([('primary', '#c08543'), ('secondary', '#467f79')]):
    rs = {r['tower']: r for r in metrics if r['route'] == route}
    for j, tower in enumerate(NAMES):
        x = j + (i - .5) * .32
        if tower not in rs:
            ax.text(x, 2, '—', ha='center', fontsize=10)
            continue
        v = rs[tower]['zeroFraction'] * 100
        ax.bar(x, v, .29, color=color, label=ROUTES[route] if j == 0 else None)
        ax.text(x, v + 1, f'{v:.0f}%', ha='center', fontsize=9)
ax.set_xticks(range(6), list(NAMES.values())); ax.set_ylim(0, 82)
ax.set_title('W40前失败样本：W25–39零能量时长')
ax.set_ylabel('占观察战斗时间%'); ax.legend(); ax.grid(axis='y', alpha=.15)
ax.spines[['top', 'right']].set_visible(False)
table_ax.axis('off'); table_ax.set_title('W25起仅给指定塔补足能量（诊断，非正式方案）', pad=20)
columns = ['原版'] + list(NAMES.values()) + ['全队']
cells, colors, labels = [], [], []
for k in case_keys:
    b = indexed[k]; rs = {r['mode']: r for r in conditions if key(r) == k}
    labels.append(f'{ROUTES[k[0]]}\n{PROFILES[k[1]]}·{k[2]}')
    line, fills = [f'W{b["wave"]}失守'], ['#f4e3d7']
    for mode in list(NAMES) + ['all']:
        r = rs.get(mode)
        if not r:
            line.append('—'); fills.append('#f1f2f2'); continue
        passed = r['terminal'] == 'window_complete'
        line.append(f'W{r["wave"]}' + ('通过' if passed else '失守'))
        fills.append('#b8d5bd' if passed else '#e4ecd9' if r['wave'] == 40 else '#f4e3d7')
    cells.append(line); colors.append(fills)
table = table_ax.table(cellText=cells, colLabels=columns, rowLabels=labels, cellColours=colors,
                       cellLoc='center', loc='center', bbox=[.02, .16, .98, .68])
table.auto_set_font_size(False); table.set_fontsize(9)
fig.suptitle('圣坛花园：先区分供能瓶颈与技能路线问题', fontsize=16)
fig.text(.5, .035, '左：11组提前失守样本，按实际时长加权。右：4个代表性失败样本，单塔/全队共20次干预；不是通过率统计。', ha='center', fontsize=10)
fig.subplots_adjust(top=.80, bottom=.16, left=.055, right=.985, wspace=.65)
fig.savefig(DOCS / 'garden-bottlenecks-overview.png', dpi=150, facecolor='white'); plt.close(fig)

md = ['# 圣坛花园W25–39：弱构筑瓶颈诊断', '',
      '日期：2026-11-10。正式游戏参数未修改；沿用六塔基础攻击和成长直接+20%、花园W40本体108000/分身34560的版本。没有共用增伤。', '',
      '## 当前基线', '',
      '24组完整回放：全部通过W20，13组到达W40，8组清理W40；11组在W28–39失守，其中强化普攻路线5组、周期/驻场路线6组。本轮不再重跑后两张地图，不以没有商店/红卡天赋解释这个基准的失败。', '',
      '## 失败前的实际能量与输出', '',
      '仅统计11组提前失守样本中W25–39的实际观察时间，按塔实际在场时长加权；不同塔涉及的构筑、等级、技能、圣物和战斗时长不同。不能直接把下表DPS当作同等投入的塔强度排名。低能量列包含0能量，和独立零能量列有交集。', '',
      '| 路线 | 塔 | 构筑样本数 | 平均能量 | 低于20能量 | 零能量 | 观察DPS |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: |']
for r in metrics:
    md.append(f'| {ROUTES[r["route"]]} | {NAMES[r["tower"]]} | {r["cases"]} | {r["meanEnergy"]:.1f} | {r["lowIncludingZeroFraction"]:.1%} | {r["zeroFraction"]:.1%} | {r["observedDps"]:.0f} |')
md += ['', '强化路线火塔平均能量1.3、零能量68.5%；炮塔平均1.8、零能量59.3%。同一失败样本集合里，冰/毒平均能量约96/99，几乎没有缺能。说明供能压力很不均匀，并非所有塔都缺能。', '',
       '周期路线电塔观察DPS约187、平均能量11.3；冰塔DPS约287、平均能量34，未出现未足额扣费的周期施法。电/冰路线值得继续核对，但冰墙护盾、减速、麻痹等团队价值不在DPS里，不能只因伤害低就判定应增加基础攻击。', '',
       '## 单塔供能干预', '',
       '有意选择4组W40前失守构筑：强化路线火毒电炮·41、火冰电炮·123；周期路线冰毒电镖·41、火冰电炮·123。每组分别干预其4座塔及全队，共20组。均从W1正常回放，W25起在每次战斗更新前将被选塔不足60的能量补至60，超过60的不减少。收费和伤害参数不改。', '',
       '**这是无限供应的诊断，不是正式补能方案，也不能当作某个真实充能倍率的测试。**补足能量同时恢复伤害档位、射程和周期冷却；之后随机调用、棋盘与选牌可能分叉，因此差值是整场策略净结果，不能全归因于同一技能伤害。', '',
       '| 原构筑/种子 | 原版 | 只补火 | 只补冰 | 只补毒 | 只补电 | 只补镖 | 只补炮 | 全队 |',
       '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
for k in case_keys:
    b = indexed[k]; rs = {r['mode']: r for r in conditions if key(r) == k}
    line = [f'{ROUTES[k[0]]}·{PROFILES[k[1]]}·{k[2]}', f'W{b["wave"]}失守']
    for mode in list(NAMES) + ['all']:
        r = rs.get(mode)
        line.append('—' if not r else f'W{r["wave"]}' + ('通过' if r['terminal'] == 'window_complete' else '失守'))
    md.append('| ' + ' | '.join(line) + ' |')
md += ['', '“W40失守”只表示推进到W40，没有通过Boss；“W40通过”要求Boss和残怪全部清理。不存在的塔标—。四个病例不能外推为通关率，也不是完整构筑搜索。', '',
       '![瓶颈诊断图](garden-bottlenecks-overview.png)', '',
       '## 结论及下一步优先级', '',
       '1. **强化普攻路线先处理火/炮能效。**两个选定失败病例，单独补足火或炮均能通过W40；与长期零能量观测一致。优先做多重火球、重炮/双管等具体技能的费用与供能收益对照，暂不再抬六塔攻击。诊断没有证明应采用哪一个实际能耗系数，也不推翻此前保留Boss较高收费的要求。',
       '2. **周期/驻场路线不是“给电塔补能”就能解决。**两例只补电仍在W28失守；只补冰最多延后1波。下一轮应核对电系周期技能的单位施法命中、覆盖和输出预算，以及冰系伤害/控制/护盾的合计贡献；不能仅从本结果认定电塔所有分支都弱。',
       '3. **炮台/毒棒等驻场构筑仍受团队供能约束。**周期路线一例补炮推进至W40，另一例补毒或镖推进至W40，但都未通过；全队补能两例都通过。由此不能把全部失败归为纯伤害不足，也不能用无限能量通过来证明当前真实供能平衡已完成。',
       '4. **保留W40当前参数，优先修W25–39的清怪和积怪。**失败前已出现大量残怪与集中攻城；不把进入W40即快速失守全算到W40Boss身上。W41–60尚待单独复测。', '',
       '## 校验和复跑', '',
       '- 两份诊断均与当前攻击配置24组基线逐文件源码哈希一致，正式JS无修改；没有运行中源码变化。',
       '- 四组无干预回放完整复现原结果；两路线各做观察器被动对照；20组干预W25之前逐波结果完全一致，额外能量只给被指定的塔，原始记录保留实际额外能量。',
       '- 仍是正常一星局内圣物获取、无商店、无红卡、无天赋盘、无重掷/复活；未真机测试。',
       '- `node tools/collect-garden-bottlenecks.cjs primary`、`secondary`；`python tools/report-garden-bottlenecks.py`。', '']
(DOCS / 'garden-bottlenecks-analysis.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(pre40Failures=len(failures), routeFailures=summary['routeFailures'], diagnosticRuns=len(conditions),
                      conditions=[{k: r[k] for k in ['route', 'profile', 'seed', 'mode', 'baselineWave', 'wave', 'terminal']} for r in conditions]), ensure_ascii=False))
