"""汇总当前六塔三消供能、请求/实扣能效、零能量时间和同级成长；只写独立报告。"""
from pathlib import Path
from collections import defaultdict
import csv
import gzip
import hashlib
import json
import statistics

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
NAMES = dict(fire='火塔', ice='冰塔', poison='毒塔', electric='电塔', boomerang='回旋镖', cannon='炮塔')

def load(mode):
    return json.loads(gzip.decompress((DOCS / f'six-tower-current-{mode}.json.gz').read_bytes()))

def write_csv(name, rows):
    with (DOCS / name).open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)

fixed, primary, secondary = (load(mode) for mode in ['fixed', 'primary', 'secondary'])
assert len(fixed['runs']) == 144
assert len(primary['runs']) == len(secondary['runs']) == 96
assert fixed['sourceHashes'] == primary['sourceHashes'] == secondary['sourceHashes']
source = fixed['sourceHashes']
assert source == json.loads((DOCS / 'fire-ice-trajectory-summary.json').read_text(encoding='utf-8'))['sourceHashes'], '本轮不得混入新的游戏数值修改'
for file, digest in source.items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
for data in [primary, secondary]:
    assert data['frozenRuntime'] and data['passiveReplayChecked'] and data['pairedChecks'] == 48
    assert data['routes'] == fixed['routes'] and data['skillEnergyFactors'] == fixed['skillEnergyFactors']

campaigns, wave_rows = [], []
for data in [primary, secondary]:
    for r in data['runs']:
        campaigns.append(dict(route=r['route'], condition=r['condition'], field=r['field'], seed=r['seed'],
                              cadence=r['cadence'], profile=r['profile'], terminal=r['terminal'], wave=r['wave'],
                              clearedWaves=r['clearedWaves'], seconds=r['seconds'], wallHp=r['wallHp'],
                              levels=json.dumps(r['levels']), damage=json.dumps(r['damage'])))
        level_map = {(a['wave'], a['key']): a for a in r['observations']['levels']}
        assert abs(sum(w['seconds'] for w in r['waves']) - r['totals']['seconds']) < 1e-5
        for w in r['waves']:
            number = w['wave']
            segment = 'W1-10' if number <= 10 else 'W11-19' if number < 20 else 'W20' if number == 20 else 'W21-39' if number < 40 else 'W40' if number == 40 else 'W41-59' if number < 60 else 'W60+'
            for key, t in w['towers'].items():
                damage = w['damage'].get(key, {}).get('total', 0)
                asked = t['requestedAttackEnergy'] + t['requestedSkillEnergy']
                paid = t['actualAttackEnergy'] + t['actualSkillEnergy']
                assert 0 <= t['zeroSeconds'] <= t['lowSeconds'] + 1e-6 <= w['seconds'] + 2e-6
                assert paid <= asked + 1e-6
                lv = level_map.get((number, key), {})
                wave_rows.append(dict(route=r['route'], condition=r['condition'], field=r['field'], seed=r['seed'],
                    cadence=r['cadence'], profile=r['profile'], wave=number, segment=segment, key=key,
                    seconds=w['seconds'], damage=damage, asked=asked, paid=paid,
                    attackAsked=t['requestedAttackEnergy'], periodicAsked=t['requestedSkillEnergy'],
                    attackPaid=t['actualAttackEnergy'], periodicPaid=t['actualSkillEnergy'],
                    zeroSeconds=t['zeroSeconds'], lowSeconds=t['lowSeconds'], energySeconds=t['energySeconds'],
                    matchEnergy=t['matchEnergy'], refillEnergy=t['refillEnergy'], overflow=t['matchOverflow'],
                    levelSeconds=lv.get('levelSeconds', 0), levelTime=lv.get('seconds', 0), endLevel=w['levels'][key],
                    skillCasts=t['skillCasts'], unpaidSkillCasts=t['unpaidSkillCasts']))

groups = defaultdict(list)
for row in wave_rows:
    groups[tuple(row[k] for k in ['route', 'field', 'cadence', 'condition', 'key', 'segment'])].append(row)
energy = []
sum_keys = ['seconds', 'damage', 'asked', 'paid', 'attackAsked', 'periodicAsked', 'attackPaid', 'periodicPaid',
            'zeroSeconds', 'lowSeconds', 'energySeconds', 'matchEnergy', 'refillEnergy', 'overflow',
            'levelSeconds', 'levelTime', 'skillCasts', 'unpaidSkillCasts']
for identity, rows in groups.items():
    out = dict(zip(['route', 'field', 'cadence', 'condition', 'key', 'segment'], identity))
    out.update({key: sum(r[key] for r in rows) for key in sum_keys})
    seconds, asked, paid = out['seconds'], out['asked'], out['paid']
    out.update(runs=len({(r['seed'], r['profile']) for r in rows}),
               zeroFraction=out['zeroSeconds'] / max(seconds, 1e-9), lowFraction=out['lowSeconds'] / max(seconds, 1e-9),
               meanEnergy=out['energySeconds'] / max(seconds, 1e-9),
               meanLevel=out['levelSeconds'] / max(out['levelTime'], 1e-9),
               dps=out['damage'] / max(seconds, 1e-9), askedPerSecond=asked / max(seconds, 1e-9),
               paidPerSecond=paid / max(seconds, 1e-9), supplyPerSecond=(out['matchEnergy'] + out['refillEnergy']) / max(seconds, 1e-9),
               paidCoverage=paid / asked if asked > 0 else None,
               damagePerAsked=out['damage'] / asked if asked > 0 else None,
               damagePerPaid=out['damage'] / paid if paid > 0 else None)
    energy.append(out)

def cell(route, key, segment='W11-19', field='ancient', cadence=2, condition='normal'):
    return next(r for r in energy if all(r[k] == v for k, v in dict(route=route, key=key, segment=segment, field=field, cadence=cadence, condition=condition).items()))

growth = []
for route in ['primary', 'secondary']:
    for key in NAMES:
        out = dict(route=route, key=key, skills='/'.join(f'{n}({b})' for n, b in fixed['routes'][route][key]))
        for level in [4, 7, 13]:
            for scenario in ['boss', 'dense']:
                rows = [r for r in fixed['runs'] if r['route'] == route and r['key'] == key and r['level'] == level and r['scenario'] == scenario]
                assert len(rows) == 2
                for metric in ['dps', 'askedPerSecond', 'hardControlFraction', 'slowEquivalent']:
                    out[f'{scenario}_L{level}_{metric}'] = statistics.mean(r[metric] for r in rows)
        growth.append(out)
base = []
for key, t in fixed['towers'].items():
    base.append(dict(key=key, perShotL1=t['baseDps'] * t['atkInterval'], perShotGrowth=t['perLv'] * t['atkInterval'],
                     perShotL13=(t['baseDps'] + 12 * t['perLv']) * t['atkInterval'], nominalDpsL1=t['baseDps'],
                     nominalDpsL13=t['baseDps'] + 12 * t['perLv'], basicCost=t['attackCost']))

write_csv('six-tower-current-campaigns.csv', campaigns)
write_csv('six-tower-current-waves.csv', wave_rows)
write_csv('six-tower-current-energy.csv', energy)
write_csv('six-tower-current-growth.csv', growth)
write_csv('six-tower-current-base-growth.csv', base)
summary = dict(date='2026-11-10', fixedRuns=144, movingRuns=192, sourceHashes=source,
               passiveReplayChecked=True, pairedChecks=96,
               pairedSteps=primary['pairedSteps'] + secondary['pairedSteps'], energy=energy, growth=growth, base=base,
               lateNormalRuns=sum(r['wave'] >= 41 for r in campaigns if r['condition'] == 'normal'),
               trueVictories=sum(r['terminal'] == 'victory' for r in campaigns),
               note='No game numerical changes. Wave boundary tool snapshot fixed; historical datasets retained. Supply is native replay matching/global casts, not passive0.7/s. Neutral reference does not measure pure energy-only causal DPS loss.')
(DOCS / 'six-tower-current-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

# 面向阅读的双图：同场景同波段，保留路线差异，不按单塔强度排序。
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
fonts = {f.name for f in font_manager.fontManager.ttflist}
for font in ['Microsoft YaHei', 'SimHei', 'SimSun', 'Noto Sans CJK SC']:
    if font in fonts:
        plt.rcParams['font.sans-serif'] = [font]; break
plt.rcParams['axes.unicode_minus'] = False
fig, axes = plt.subplots(1, 2, figsize=(13, 6.8), gridspec_kw={'wspace': .38})
colors = ['#c9772d', '#26867c']
for index, route in enumerate(['primary', 'secondary']):
    y = [i + (index - .5) * .3 for i in range(6)]
    values = [cell(route, key) for key in NAMES]
    label = '强化普攻路线' if route == 'primary' else '周期/驻场路线'
    axes[0].barh(y, [r['zeroFraction'] * 100 for r in values], height=.27, color=colors[index], label=label)
    for at, row in zip(y, values):
        axes[0].text(row['zeroFraction'] * 100 + .5, at, f'{row["zeroFraction"]:.0%}', va='center', fontsize=9)
    axes[1].scatter([max(1e-6, r['damagePerAsked'] or 0) for r in values], y, color=colors[index], s=60, label=label)
    for at, row in zip(y, values):
        axes[1].annotate(f'{row["damagePerAsked"]:.0f}', (max(1e-6, row['damagePerAsked'] or 0), at), xytext=(6, 0), textcoords='offset points', va='center', fontsize=9)
for ax in axes:
    ax.set_yticks(range(6), list(NAMES.values())); ax.invert_yaxis(); ax.grid(axis='x', alpha=.18)
    ax.spines[['top', 'right']].set_visible(False)
axes[0].set_xlim(0, 100); axes[0].set_title('零能量时间占比'); axes[0].set_xlabel('战斗时间占比（%）')
axes[1].set_xscale('log'); axes[1].set_title('有效伤害 / 请求能量'); axes[1].set_xlabel('对数刻度；含持续伤害与免费派生')
axes[0].legend(loc='lower right', fontsize=9)
fig.suptitle('六塔三消供能复测｜花园 W11–19，2秒操作', fontsize=16, y=.96)
fig.text(.5, .035, '两种子、混合四塔阵容，按在场时间加权；这是构筑诊断，不是单塔强度排行。', ha='center', fontsize=10)
fig.subplots_adjust(top=.86, bottom=.15)
fig.savefig(DOCS / 'six-tower-current-overview.png', dpi=160, facecolor='white')
plt.close(fig)

md = ['# 六塔当前版：三消供能、能效与成长复测', '', '日期：2026-11-10。V1.18.9后的本地工作区。', '',
      '## 本轮结论', '',
      '先处理冰锥/穿刺、多镖的计费预估与实际弹体不一致，再讨论基础攻击和成长调整。火/炮强化路线的供能压力要单独看；不因Boss目标少就下调已确认保留的群体预估收费。', '',
      '本轮未修改游戏数值：144组固定60能量成长参考＋192组移动供能配对，共336组。另做18组实际发射预算核对。三消供能按真实棋盘和全局技能执行，没有新增0.7能量/秒自动增长。', '',
      '## 两套路线与方法', '',
      '| 塔 | 强化普攻路线 | 周期/驻场路线 |', '| --- | --- | --- |']
for key in NAMES:
    md.append(f'| {NAMES[key]} | ' + ' | '.join('、'.join(f'{n}·{b}' for n, b in fixed['routes'][route][key]) for route in ['primary', 'secondary']) + ' |')
md += ['',
       '- 固定靶：Lv4/7/13，两种子，单个大体型Boss或12个普通体型敌人；预热120秒，计量120秒，60Hz，每次战斗更新前重置60能量。靶不动、不死、无护甲，不代表真人DPS。',
       '- 移动：三张图×两种子×六种四塔组合×正常供能/固定60能量对照；花园另测4秒操作。两套技能路线共192组，真实棋盘/出怪/升级/攻城，全局补能和锻造按原采集策略释放，首次破防或2400秒/60波上限即停。',
       '- 排除圣物、局外星级、天赋和商店，隔离基础构筑；不是完整玩家养成和真人胜率。固定路线按计划选择，不能当作玩家最优构筑。',
       '- 60能量对照也会改变射程、清怪、经验、等级和波次时间；它用于诊断供能敏感性，不能把整局总伤比直接解释为纯能耗损失。共同棋盘操作前缀逐步校验，96对通过。', '',
       '采集工具修复了一处切波统计边界：旧seconds是切波时的数值副本，而towers继续记录本帧，曾相差1/60秒。现在统一在帧后展开计数，分波与整局时间/扣能/零能时长守恒；游戏逻辑未变，历史报告不覆盖。', '',
       '## 花园W11–19：真实三消供能', '',
       '两种子、2秒操作，按含该塔的组合在场时间加权。各塔等级、目标、协同不同，不按这一表给单塔排名。请求/实扣包括普通三消额外攻击和周期技能；收益包含免费派生及持续伤害。', '',
       '| 塔/路线 | 平均等级 | 入账能量/秒 | 请求/秒 | 实扣/秒 | 零能时间 | 伤害/请求能量 | 伤害/实扣能量 |',
       '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
for key in NAMES:
    for route, label in [('primary', '强化'), ('secondary', '周期')]:
        r = cell(route, key)
        md.append(f'| {NAMES[key]}·{label} | {r["meanLevel"]:.1f} | {r["supplyPerSecond"]:.2f} | {r["askedPerSecond"]:.2f} | '
                  f'{r["paidPerSecond"]:.2f} | {r["zeroFraction"]:.1%} | {r["damagePerAsked"]:.0f} | {r["damagePerPaid"]:.0f} |')
md += ['',
       '“伤害/实扣能量”不能单独作为能效排名：能量不足扣光后仍会释放，甚至0能量也有30%伤害；分母变小可能让这个数看起来更高。须结合请求口径、零能时间、实际伤害、控制和推进判断。入账能量含三消与全局补给，不包含开局存量；能量返还等额外来源依照原技能，不能把此列当完整收支账。', '',
       '![六塔供能概览](six-tower-current-overview.png)', '',
       '## 已确认的计费预估差异', '',
       '数据见six-tower-current-attack-budget.json，使用真实attackOnce生成弹体，再读取数量/伤害/穿透上限，不根据文案推算。', '',
       '1. 按本次普攻基础攻击归一化：小冰锥C3为18枚×10%伤害，普攻费用倍率1.44。再加穿刺A3后，每枚最多命中5个目标，初始弹体合计仍为1.8倍基础攻击，费用倍率却降至1.152；现有multi/else-if分支跳过穿刺贡献，只叠了穿刺自己的0.8。测试构筑等级不同，不能将这里的相同倍率误读成相同绝对攻击。穿透应如何计入组合预估需要统一，不是给每次穿透再次扣能。碎冰的免费派生规则本轮不新增收费。',
       '2. 多镖A3实际5枚各52%伤害，合计2.60倍初始弹体伤害；当前计费前的逐枚递减预估为1.56倍，叠该技能0.8后为1.248倍。若只统一这层初始弹体口径，会是2.60×0.8＝2.08倍；这仅是核对示例，尚未写入游戏。回程和风痕等收益需另按现有规则确认。',
       '这两项会使低耗能路线更容易维持高能量档。先校正预估和实际表现，再评判是否应削攻击，能避免用基础数值掩盖规则差异。', '',
       '## 同级固定靶成长参考', '',
       '| 塔/路线 | 单体Lv4→7→13 DPS | Lv13群体DPS | 正常档请求能量/秒 |',
       '| --- | ---: | ---: | ---: |']
for r in growth:
    label = '强化' if r['route'] == 'primary' else '周期'
    md.append(f'| {NAMES[r["key"]]}·{label} | ' + '→'.join(f'{r[f"boss_L{lv}_dps"]:.0f}' for lv in [4, 7, 13])
              + f' | {r["dense_L13_dps"]:.0f} | {r["boss_L13_askedPerSecond"]:.2f} |')
md += ['',
       'Boss靶有较大的碰撞体积，碎冰/多弹可能反复覆盖；12目标组也受位置与穿透路径影响，所以不是简单把单体DPS乘目标数。毒塔传染/毒爆依赖死亡，固定不死靶不能测全。护盾、回血、控制也不能仅按伤害计价；明细CSV保留控制/减速参考。', '',
       '| 塔 | Lv1基础单发 | 每级单发增长 | Lv13基础单发 | Lv13名义基础DPS |',
       '| --- | ---: | ---: | ---: | ---: |']
for r in base:
    md.append(f'| {NAMES[r["key"]]} | {r["perShotL1"]:.1f} | {r["perShotGrowth"]:.1f} | {r["perShotL13"]:.1f} | {r["nominalDpsL13"]:.1f} |')
md += ['',
       '这是不含技能、能量、全局锻造、实际命中和回旋镖往返节奏的配置换算，不是实战DPS。基础成长仍按现有线性规则；当前差异更需要先核对技能乘区、命中覆盖和计费预估，没有据此给六塔基础攻击统一增减。', '',
       '## 地图、操作节奏和后期样本', '',
       '| 路线/条件 | 花园2秒：失守波中位 | 熔岩2秒 | 霜风2秒 | 花园4秒 |', '| --- | ---: | ---: | ---: | ---: |']
for route in ['primary', 'secondary']:
    for condition in ['normal', 'neutral']:
        vals = []
        for field, cadence in [('ancient', 2), ('lava', 2), ('frost', 2), ('ancient', 4)]:
            rows = [r for r in campaigns if r['route'] == route and r['condition'] == condition and r['field'] == field and r['cadence'] == cadence]
            # 非失守结果保留原terminal，不将wave_cap算作通关。
            lost = [r['wave'] for r in rows if r['terminal'] == 'wall_broken']
            vals.append(f'{statistics.median(lost):.1f}（{len(lost)}/{len(rows)}失守）' if lost else '无失守样本')
        md.append('| ' + ('强化' if route == 'primary' else '周期') + '/' + ('三消供能' if condition == 'normal' else '60能量参考') + ' | ' + ' | '.join(vals) + ' |')
md += ['',
       f'正常供能样本共96组，其中进入W41及以后只有{summary["lateNormalRuns"]}组。后期观测具有明显存活筛选，不能用少量幸存构筑给全体晚期强度下结论；Lv13成长由固定同级参考补充。wave_cap、time_cap和“走到W60”均不等于通关，原始终止原因保留。', '',
       '不同地图Boss与出怪配置不同，不跨图直接评Boss强弱；中位数也不是胜率。变慢操作会同时改变升级、全局技能和清怪，不能用它反推固定自动回能。', '',
       '## 建议的下一轮顺序', '',
       '1. 先统一冰锥叠穿刺、多镖的普攻预估口径；保留每技能独立系数、首次激活一次、分支升级不额外叠折扣，以及出手前能量快照。',
       '2. 使用修正口径重新看火/电/炮与冰/毒/镖的真实供能差异；只对必要技能做独立系数试算。Boss仍按已经确认的收费规则，不按单目标临时打折。',
       '3. 费用规则稳定后，再对同级技能成长和基础攻击讨论具体数值；单独保留地雷的窄范围/不移动定位，避免按总伤直接削弱。', '',
       '## 复跑与验证', '',
       '- `node tools/collect-six-tower-current.cjs fixed` / `primary` / `secondary`；三个输出各自独立，固定运行时源码快照。',
       '- `node tools/audit-current-attack-budget.cjs`；`python tools/report-six-tower-current.py`。',
       '- 能耗观察器被动性、真实棋盘确定性、同帧切波计数守恒、209组周期能量边界、44+52组独立系数和火冰弹道回归通过。',
       '- 原始回放压缩为JSON.gz，CSV提供逐局、逐波、各塔供能和同级成长；本轮游戏文件哈希与上轮火冰专项完全相同。未进行真机帧率、温度和真人操作验证。', '']
(DOCS / 'six-tower-current-analysis.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(fixed=144, moving=192, pairedChecks=96, pairedSteps=summary['pairedSteps'],
                     lateNormalRuns=summary['lateNormalRuns'], garden=[cell('primary', key) for key in NAMES]), ensure_ascii=False))
