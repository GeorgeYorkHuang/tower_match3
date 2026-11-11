"""汇总只启用局内一星圣物、无商店/红卡天赋的W20/W40压力测试，不调整游戏数值。"""
from pathlib import Path
import csv
import gzip
import hashlib
import json
import statistics

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
NAMES = {'ancient': '圣坛花园', 'lava': '熔岩矿场', 'frost': '霜风峡谷'}
def read(name):
    return json.loads(gzip.decompress((DOCS / name).read_bytes()))
primary = read('relic-only-primary-build.json.gz')
secondary = read('relic-only-secondary-build.json.gz')
first = read('relic-only-primary-first.json.gz')
assert len(primary['runs']) == len(secondary['runs']) == 36 and len(first['runs']) == 12
source = primary['sourceHashes']
assert source == secondary['sourceHashes'] == first['sourceHashes']
assert source == json.loads((DOCS / 'six-tower-budget-fix-summary.json').read_text(encoding='utf-8'))['sourceHashes']
for file, digest in source.items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
for data in [primary, secondary, first]:
    assert data['passiveReplayChecked'] and data['frozenRuntime'] and not data['shop'] and not data['talents']

rows, boss_rows = [], []
for data in [primary, secondary, first]:
    for r in data['runs']:
        choices = r['relicChoices']
        for c in choices:
            assert c['id'] in c['candidates'] and c['rarity'] != 'ur'
            if c['goldOnly']: assert c['rarity'] == 'ssr'
        entries = {e['wave']: e for e in r['observations']['entries']}
        rows.append(dict(route=r['route'], strategy=r['strategy'], field=r['field'], seed=r['seed'], profile=r['profile'],
            wave=r['wave'], terminal=r['terminal'], clearedWaves=r['clearedWaves'],
            passed20=r['clearedWaves'] >= 20, reached40=r['wave'] >= 40,
            passed40=r['terminal'] == 'window_complete', seconds=r['seconds'],
            relicCount=len(choices), before20Cards=sum(entries.get(20, {}).get('relics', {}).values()) if 20 in entries else None,
            before40Cards=sum(entries.get(40, {}).get('relics', {}).values()) if 40 in entries else None,
            levels=json.dumps(r['levels'], ensure_ascii=False), relics=json.dumps(r['runRelics'], ensure_ascii=False)))
        if r['field'] == 'ancient' and r['strategy'] == 'build' and r['wave'] == 40:
            w = next(w for w in reversed(r['waves']) if w['wave'] == 40)
            members = w['boss'].get('members') or []
            hp, maximum = sum(max(0, e['hp']) for e in members), sum(e['maxHp'] for e in members)
            boss_rows.append(dict(route=r['route'], profile=r['profile'], seed=r['seed'], phase=w['boss']['phase'],
                seconds=w['seconds'], hp=hp, maxHp=maximum, remainingFraction=hp / maximum if maximum else None,
                cards=rows[-1]['before40Cards'], levels=rows[-1]['levels'],
                totalWaveDamage=sum(v['total'] for v in w['damage'].values()),
                note='Wave damage includes adds and cannot be treated as direct Boss DPS.'))

def aggregate(rs):
    return dict(runs=len(rs), passed20=sum(r['passed20'] for r in rs), reached40=sum(r['reached40'] for r in rs),
                passed40=sum(r['passed40'] for r in rs), timeCaps=sum(r['terminal'] == 'time_cap' for r in rs),
                medianEndWave=statistics.median(r['wave'] for r in rs), medianRelics=statistics.median(r['relicCount'] for r in rs))
main = [r for r in rows if r['strategy'] == 'build']
aggregates = []
for field in NAMES:
    for route in ['primary', 'secondary', 'all']:
        rs = [r for r in main if r['field'] == field and (route == 'all' or r['route'] == route)]
        aggregates.append(dict(field=field, route=route, **aggregate(rs)))
baseline = read('six-tower-budget-fix-primary.json.gz')
assert baseline['sourceHashes'] == source
baseline_rows = [r for r in baseline['runs'] if r['cadence'] == 2]
baseline_compare = []
for field in NAMES:
    a = [r for r in baseline_rows if r['field'] == field]
    b = [r for r in main if r['field'] == field and r['route'] == 'primary']
    baseline_compare.append(dict(field=field, noRelicPassed20=sum(r['clearedWaves'] >= 20 for r in a),
                                relicPassed20=sum(r['passed20'] for r in b), noRelicMedian=statistics.median(r['wave'] for r in a),
                                relicMedian=statistics.median(r['wave'] for r in b)))
for name, data in [('relic-only-campaigns.csv', rows), ('relic-only-garden40.csv', boss_rows)]:
    if not data: continue
    with (DOCS / name).open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(data[0])); writer.writeheader(); writer.writerows(data)
summary = dict(date='2026-11-10', mainRuns=72, sensitivityRuns=12, sourceHashes=source,
               gameNumericalChanges=False, baseline='new profile; naturally unlocked1star relics',
               shop=False, talents=False, aggregates=aggregates, baselineCompare=baseline_compare, garden40=boss_rows,
               firstPolicy=aggregate([r for r in rows if r['strategy'] == 'first']), buildGardenPrimary=aggregate([r for r in main if r['field'] == 'ancient' and r['route'] == 'primary']))
(DOCS / 'relic-only-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
available = {f.name for f in font_manager.fontManager.ttflist}
for font in ['Microsoft YaHei', 'SimHei', 'SimSun', 'Noto Sans CJK SC']:
    if font in available: plt.rcParams['font.sans-serif'] = [font]; break
plt.rcParams['axes.unicode_minus'] = False
fig, axes = plt.subplots(1, 2, figsize=(12.5, 5.8), gridspec_kw={'wspace': .3})
for index, (route, label, color) in enumerate([('primary', '强化普攻', '#b97a32'), ('secondary', '周期/驻场', '#287e75')]):
    points = [r for r in aggregates if r['route'] == route]
    x = [i + (index - .5) * .3 for i in range(3)]
    for ax, metric in [(axes[0], 'passed20'), (axes[1], 'passed40')]:
        values = [r[metric] for r in points]
        ax.bar(x, values, width=.27, color=color, label=label)
        for at, value in zip(x, values): ax.text(at, value + .2, f'{value}/12', ha='center', fontsize=10)
for ax in axes:
    ax.set_xticks(range(3), list(NAMES.values())); ax.set_ylim(0, 13.6); ax.set_yticks(range(0, 13, 3))
    ax.grid(axis='y', alpha=.15); ax.spines[['top', 'right']].set_visible(False)
axes[0].set_title('通过W20的样本'); axes[1].set_title('完全清理W40的样本'); axes[0].legend(loc='lower right')
fig.suptitle('只计局内一星圣遗物｜无商店、无红卡天赋', fontsize=16, y=.96)
fig.text(.5, .035, '两种子×六种四塔组合，2秒操作；固定技能路线与启发式选牌，不能当作真人胜率。', ha='center', fontsize=10)
fig.subplots_adjust(top=.83, bottom=.16); fig.savefig(DOCS / 'relic-only-overview.png', dpi=160, facecolor='white'); plt.close(fig)

md = ['# 仅局内圣遗物：W20/W40通关压力复测', '', '日期：2026-11-10。本轮游戏文件及数值均未修改。', '',
      '## 口径', '',
      '- 正常三消与全局技能供能，真实W2/Boss宝箱掉落、入盘、相邻消除、开箱和三选一；不直接注入卡或奖励。',
      '- 新号基线：圣物按实际领取解锁为一星；没有二/三星养成或额外局外加成。这是本轮明确采用的基线，不代表所有圣物星级。',
      '- 排除商店购买/增益、红卡及整个天赋盘、局外旧圣物升级、重掷、广告复活和固定60能量注入。',
      '- 六种四塔组合、两套技能路线、三图、种子41/123，2秒操作。主测试72组；花园强化路线另12组固定选第一张作敏感性对照，总84组。',
      '- 主策略只在已给出的三张里按既定技能相关性、当前能量和前期经验需求选择，不预看未来候选。不是最优构筑搜索。',
      '- 宝箱入盘后优先能相邻消除的合法交换，否则回到普通三连策略；因此不能与无宝箱基线强称相同棋盘操作的纯因果配对。',
      '- 三套采集均通过完整回放的观察器被动对照；检查未获UR、非R不重复、金箱候选全SSR、已选卡一星、商店增益及天赋为零。', '',
      '## 主测试结果', '',
      '| 地图/路线 | 通过W20 | 到达W40 | 通过W40 | 终止波中位 |', '| --- | ---: | ---: | ---: | ---: |']
for r in aggregates:
    if r['route'] == 'all': continue
    label = '强化普攻' if r['route'] == 'primary' else '周期/驻场'
    md.append(f'| {NAMES[r["field"]]}·{label} | {r["passed20"]}/{r["runs"]} | {r["reached40"]}/{r["runs"]} | {r["passed40"]}/{r["runs"]} | {r["medianEndWave"]:.1f} |')
md += ['', '通过W40要求Boss及残怪清理完毕；仅到达不算通过。到W40即结束采集，W40通关后金箱不用于证明本次W40输出足够。无时间上限或波次上限结果被冒充通关。', '',
       '![样本通过情况](relic-only-overview.png)', '',
       '## 圣物有帮助，但尚不足以支撑稳定W40', '',
       '| 强化路线 | 无圣物通过W20 | 有圣物通过W20 | 无圣物终止波中位 | 有圣物终止波中位 |',
       '| --- | ---: | ---: | ---: | ---: |']
for r in baseline_compare:
    md.append(f'| {NAMES[r["field"]]} | {r["noRelicPassed20"]}/12 | {r["relicPassed20"]}/12 | {r["noRelicMedian"]:.1f} | {r["relicMedian"]:.1f} |')
md += ['',
       '无圣物参照为同一游戏源码的budget-fix正常供能结果。加入圣物同时恢复真实掉落/领取流程并使棋盘包含宝箱，不把差值全部归因于卡片直接增伤。周期路线不混用旧版本裸测来计算净提升。', '',
       f'花园强化路线固定第一张：通过W20 {summary["firstPolicy"]["passed20"]}/12，终止波中位{summary["firstPolicy"]["medianEndWave"]:.1f}；按技能相关性选择：通过W20 {summary["buildGardenPrimary"]["passed20"]}/12，终止波中位{summary["buildGardenPrimary"]["medianEndWave"]:.1f}。这表明选牌策略会影响结果，也不能把本启发式当作玩家最佳表现。', '',
       '## 花园W40实测：本批卡在一阶段', '',
       '| 构筑/种子 | 入场圣物张数 | 塔等级 | 本波战斗时间 | 失守时Boss阶段 | 当前阶段剩余血量 |',
       '| --- | ---: | --- | ---: | ---: | ---: |']
for r in boss_rows:
    md.append(f'| {r["profile"]}·{r["seed"]} | {r["cards"]} | {r["levels"]} | {r["seconds"]:.1f}秒 | {r["phase"]} | {r["hp"]:.0f}/{r["maxHp"]:.0f}（{r["remainingFraction"]:.1%}） |')
md += ['',
       '两组都已获得8张圣物，塔约7–8级，仍在一阶段失守，Boss约剩80%血，尚未触发双生分裂与回血。因此，不能把这两组的失败归因于二阶段回血；当前首先暴露的是一阶段输出/生存窗口与本体血量、减伤的匹配问题。样本只有两组，不能据此断言所有构筑的Boss瓶颈都相同。', '',
       '代码核对：花园W40本体54万血、25%减伤，60%血分裂为两个17.28万血/12.5%减伤的分身；双生满共鸣理论回血合计864/秒，周期性对三塔降攻速。二阶段机制仍需后续单独验证，但本轮未用它解释一阶段失守。', '',
       '## 当前判断和下一步', '',
       '在新号一星圣物、无商店/无天赋这个基线下，当前构筑的有效输出与成长不足以稳定推进W40。此时不应再把大面积提前失守仅解释为缺少商店和红卡天赋。', '',
       '需要分开检查：一是多数构筑W20–35的清怪/升级节奏和供能；二是花园W40的本体血量、减伤、攻城窗口与7–8级构筑的匹配。不是已证明六塔基础伤害都应等比例增加。', '',
       '下一轮适合分别做“只增加输出”“只加快经验成长”“只降低花园W40一阶段压力”的离线干预对照，每次只改一个因素。先定位收益来源，再确定正式调整；不在本轮同时改攻击、经验、Boss血量。', '',
       '## 边界与复跑', '',
       '- 星级一星是本轮假设。若目标含二/三星圣物，要另做明确的养成档位对照；没有把三星机制或红卡天赋混入本轮。',
       '- 波次推进不等于已击杀对应Boss或已领到宝箱；未到手奖励没有补发。每局完整候选/选择、星级及W20/W40快照保存在JSON.gz。',
       '- 全队波段伤害包含小怪，不能直接当作Boss单体DPS；未记录的未来潜在伤害不计入。',
       '- `node tools/collect-relic-only.cjs primary build`、`secondary build`、`primary first`；`node tools/test-relic-only-policy.cjs`；`python tools/report-relic-only.py`。',
       '- 三张地图仅两种子、固定路线、简化操作与启发式选牌，结果不是完整构筑穷举或真人胜率；尚未真机验证。本轮只新增/修改tools、docs，没有修改游戏代码或数值。', '']
(DOCS / 'relic-only-analysis.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(mainRuns=72, sensitivity=12, aggregates=aggregates, garden40=boss_rows), ensure_ascii=False))
