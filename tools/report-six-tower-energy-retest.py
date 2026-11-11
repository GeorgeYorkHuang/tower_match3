"""比较扣费修复前后的六塔实测；只读采集结果，生成独立报告、CSV与图表。"""
from pathlib import Path
import argparse
import csv
import gzip
import hashlib
import json
import math
import statistics
import subprocess
import re

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tag', default='after-fee', help='本轮采集标签')
parser.add_argument('--baseline', default='', help='历史采集标签；空值为原始基线')
args = parser.parse_args()
assert re.fullmatch(r'[a-z0-9-]+', args.tag)
assert not args.baseline or re.fullmatch(r'[a-z0-9-]+', args.baseline)
STEM = 'six-tower-energy-' + args.tag
BASE_STEM = 'six-tower-energy' + ('-' + args.baseline if args.baseline else '')
SKILL_MODE = args.tag == 'skill-factors'
NAMES = dict(fire='火塔', ice='冰塔', poison='毒塔', electric='电塔', boomerang='回旋镖', cannon='炮塔')
LABELS = {
    'fire': ['多重火球／大火球／灼烧', '火柱／火雨／烈焰墙'],
    'ice': ['小冰锥／冰穿刺／碎冰', '冰花／冬珠／冰墙'],
    'poison': ['毒棒／毒池／毒性强化', '剧毒／瘟疫／毒爆'],
    'electric': ['连锁／活电／麻痹', '雷球／雷暴／极光'],
    'boomerang': ['多镖／接镖／风痕', '弹力镖／风暴镖／风眼'],
    'cannon': ['炮台／支援／地雷', '重炮／双管／碎裂弹'],
}


def read(name):
    return json.loads((DOCS / name).read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def csv_write(name, rows):
    with (DOCS / name).open('w', encoding='utf-8-sig', newline='') as out:
        writer = csv.DictWriter(out, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


old_fixed = read(BASE_STEM + '-fixed.json')
old_moving = read(BASE_STEM + '-moving.json')
fixed = read(STEM + '-fixed.json')
moving = read(STEM + '-moving.json')
assert len(fixed['runs']) == len(old_fixed['runs']) == 336
assert len(moving['runs']) == len(old_moving['runs']) == 90
assert fixed['sourceHashes'] == moving['sourceHashes']
assert old_fixed['sourceHashes'] == old_moving['sourceHashes']
assert fixed['routes'] == old_fixed['routes']
assert moving['routes'] == old_moving['routes'] and moving['profiles'] == old_moving['profiles']
assert moving['pairedChecks'] == 30
for source, digest in fixed['sourceHashes'].items():
    assert sha(ROOT / source) == digest, '采集之后运行时代码有变化：' + source


def fixed_id(row):
    return tuple(row[k] for k in ['key', 'route', 'stage', 'scenario', 'supply', 'seed'])


def moving_id(row):
    return tuple(row[k] for k in ['field', 'cadence', 'seed', 'profile', 'condition'])


assert len({fixed_id(r) for r in fixed['runs']}) == 336
assert len({moving_id(r) for r in moving['runs']}) == 90
assert {fixed_id(r) for r in fixed['runs']} == {fixed_id(r) for r in old_fixed['runs']}
assert {moving_id(r) for r in moving['runs']} == {moving_id(r) for r in old_moving['runs']}
if SKILL_MODE:
    old_refs = {fixed_id(r): r for r in old_fixed['runs'] if r['supply'] == 'neutral'}
    for r in fixed['runs']:
        if r['supply'] == 'neutral':
            assert math.isclose(r['dps'], old_refs[fixed_id(r)]['dps'], rel_tol=1e-8, abs_tol=1e-7), '正常能量档伤害发生变化'
changed = [p for p, digest in fixed['sourceHashes'].items() if old_fixed['sourceHashes'].get(p) != digest]
if SKILL_MODE:
    assert set(changed) <= {'js/combat/attack-energy.js', 'js/combat/attacks.js',
                           'js/config/tower-skills.js', 'js/config/combat-common.js'}, changed
else:
    assert not any(p.startswith('js/config/') for p in changed), '配置变化会混淆扣费规则的净对照'


def average(data, key, route, scenario, supply, level=13, metric='dps'):
    rows = [r for r in data['runs'] if r['key'] == key and r['route'] == route
            and r['scenario'] == scenario and r['supply'] == supply and r['level'] == level]
    assert len(rows) == 2
    return statistics.mean(r[metric] for r in rows)


routes = []
for key in NAMES:
    for i, route in enumerate(['steady', 'alternate']):
        row = dict(key=key, route=route, label=LABELS[key][i])
        for label, data in [('before', old_fixed), ('after', fixed)]:
            for scenario in ['boss', 'dense']:
                neutral = average(data, key, route, scenario, 'neutral')
                finite = average(data, key, route, scenario, 0.7)
                slow = average(data, key, route, scenario, 0.35)
                row[f'{label}_{scenario}_neutral'] = neutral
                row[f'{label}_{scenario}_finite'] = finite
                row[f'{label}_{scenario}_slow'] = slow
                row[f'{label}_{scenario}_retained'] = finite / neutral
                row[f'{label}_{scenario}_asked'] = average(data, key, route, scenario, 'neutral', metric='requestedEnergyPerSecond')
                row[f'{label}_{scenario}_actual'] = average(data, key, route, scenario, 0.7, metric='actualEnergyPerSecond')
        row['single_change'] = row['after_boss_finite'] / row['before_boss_finite'] - 1
        row['dense_change'] = row['after_dense_finite'] / row['before_dense_finite'] - 1
        routes.append(row)

growth = []
for key in NAMES:
    for i, route in enumerate(['steady', 'alternate']):
        row = dict(key=key, route=route, label=LABELS[key][i])
        for level in [4, 7, 13]:
            for scenario in ['boss', 'dense']:
                row[f'{scenario}_L{level}_neutral'] = average(fixed, key, route, scenario, 'neutral', level)
                row[f'{scenario}_L{level}_finite'] = average(fixed, key, route, scenario, 0.7, level)
        growth.append(row)
configs = json.loads(subprocess.check_output(
    ['node', '-e', "process.stdout.write(JSON.stringify(require('./js/config.js').TOWERS))"], cwd=ROOT))
base_growth = [dict(key=key, attackL1=t['baseDps'] * t['atkInterval'],
                    attackPerLevel=t['perLv'] * t['atkInterval'],
                    attackL13=(t['baseDps'] + 12 * t['perLv']) * t['atkInterval'],
                    nominalDpsL13=t['baseDps'] + 12 * t['perLv'], cost=t['attackCost'])
               for key, t in configs.items()]


def aggregate(data, field, condition, key, cadence=2):
    rows = [r for r in data['runs'] if r['field'] == field and r['cadence'] == cadence
            and r['condition'] == condition and key in r['observations']['towers']]
    total = sum(r['observations']['seconds'] for r in rows)
    nums = {}
    for r in rows:
        for k, v in r['observations']['towers'][key].items():
            if isinstance(v, (float, int)):
                nums[k] = nums.get(k, 0) + v
    return dict(field=field, condition=condition, key=key, cadence=cadence, runs=len(rows), seconds=total,
                mean_energy=nums['energySeconds'] / total,
                below40=sum(nums[k] for k in ['rampSeconds', 'lowSeconds', 'zeroSeconds']) / total,
                below20=(nums['lowSeconds'] + nums['zeroSeconds']) / total,
                zero=nums['zeroSeconds'] / total,
                damage_state=nums['damageStateSeconds'] / total,
                range_blocked=nums['rangeBlockedSeconds'] / total,
                short_primary=nums['shortAttackLaunches'] / max(1, nums['attackLaunches']),
                periodic_short=nums['unpaidPeriodicRequests'], periodic_requests=nums['periodicRequests'],
                observed_dps=sum(r['damage'].get(key, {}).get('total', 0) for r in rows) / total)


exposure = []
for field in ['ancient', 'lava', 'frost']:
    for condition in ['normal', 'neutral', 'relics']:
        for key in NAMES:
            exposure.append(dict(field=field, condition=condition, key=key,
                                 before=aggregate(old_moving, field, condition, key),
                                 after=aggregate(moving, field, condition, key)))

old_by_id = {moving_id(r): r for r in old_moving['runs']}
campaigns = []
for r in moving['runs']:
    old = old_by_id[moving_id(r)]
    campaigns.append({**{k: r[k] for k in ['field', 'cadence', 'seed', 'profile', 'condition']},
                      'before_wave': old['wave'], 'after_wave': r['wave'],
                      'before_terminal': old['terminal'], 'after_terminal': r['terminal'],
                      'before_seconds': old['seconds'], 'after_seconds': r['seconds'],
                      'before_cleared': old['clearedWaves'], 'after_cleared': r['clearedWaves'],
                      'before_levels': old['levels'], 'after_levels': r['levels'],
                      'before_relics': len(old.get('relicChoices', [])),
                      'after_relics': len(r.get('relicChoices', []))})

with gzip.open(DOCS / (STEM + '-moving-raw.json.gz'), 'rt', encoding='utf-8') as stream:
    raw = json.load(stream)
assert raw['sourceHashes'] == fixed['sourceHashes']
assert len(raw['runs']) == 90
assert all(r['waves'] and r['moves'] and r['observations']['seconds'] > 0 for r in raw['runs'])
assert all(math.isfinite(r['dps']) and r['dps'] >= 0 for r in fixed['runs'])

# 两轮无圣物正常/60能量组内部都已检查棋盘/操作共同前缀；再核实跨轮共同前缀。
with gzip.open(DOCS / (BASE_STEM + '-moving-raw.json.gz'), 'rt', encoding='utf-8') as stream:
    old_raw = {moving_id(r): r for r in json.load(stream)['runs']}
cross_pairs = cross_steps = 0
for r in raw['runs']:
    if r['condition'] == 'relics':
        continue  # 奖励入盘和领取时机会随战斗变化，不能强称操作严格配对。
    earlier = old_raw[moving_id(r)]
    for a, b in zip(earlier['moves'], r['moves']):
        assert a['board'] == b['board'] and a['move'] == b['move'], (moving_id(r), cross_steps)
        cross_steps += 1
    cross_pairs += 1

primary = read(STEM + '-primary.json') if SKILL_MODE else None
if primary:
    assert len(primary['runs']) == 36 and primary['pairedChecks'] == 24
    assert primary['sourceHashes'] == fixed['sourceHashes']
    with gzip.open(DOCS / (STEM + '-primary-raw.json.gz'), 'rt', encoding='utf-8') as stream:
        primary_raw = json.load(stream)
    assert len(primary_raw['runs']) == 36 and primary_raw['sourceHashes'] == fixed['sourceHashes']
    for r in primary_raw['runs']:
        assert {w['wave'] for w in r['waves'] if w['wave'] <= 10} == set(range(1, 11))
    primary_exposure = [dict(key=key, before=aggregate(primary, 'ancient', 'factor1', key),
                            after=aggregate(primary, 'ancient', 'skillFactors', key),
                            neutral=aggregate(primary, 'ancient', 'neutral', key)) for key in NAMES]
    primary_prefix = []
    for key in NAMES:
        group = dict(key=key)
        for label, condition in [('before', 'factor1'), ('after', 'skillFactors')]:
            waves = [w for r in primary_raw['runs'] if r['condition'] == condition and key in r['keys']
                     for w in r['waves'] if w['wave'] <= 10]
            total = sum(w['seconds'] for w in waves)
            group[label] = dict(seconds=total,
                                mean_energy=sum(w['towers'].get(key, {}).get('energySeconds', 0) for w in waves) / total,
                                zero=sum(w['towers'].get(key, {}).get('zeroSeconds', 0) for w in waves) / total)
        primary_prefix.append(group)
else:
    primary_exposure = []
    primary_prefix = []

summary = dict(date=fixed['date'], version=fixed['version'], label='技能独立能耗系数' if SKILL_MODE else '统一扣费后，未发布的本地工作区',
               counts=dict(fixed=336, moving=90, primary=36 if primary else 0), routes=routes, growth=growth, baseGrowth=base_growth,
               exposure=exposure, campaigns=campaigns,
               baseline=BASE_STEM, skillEnergyFactors=fixed.get('skillEnergyFactors'), primaryExposure=primary_exposure,
               primaryFirst10=primary_prefix,
               changedRuntime=changed, pairedChecks=moving['pairedChecks'], pairedSteps=moving['pairedSteps'],
               crossRoundPairs=cross_pairs, crossRoundSteps=cross_steps,
               elapsed=dict(fixed=fixed['elapsedSeconds'], moving=moving['elapsedSeconds']),
               sources={name: sha(DOCS / name) for name in [
                   BASE_STEM + '-fixed.json', BASE_STEM + '-moving.json',
                   STEM + '-fixed.json', STEM + '-moving.json']})
if primary:
    for suffix in ['-primary.json', '-primary-raw.json.gz']:
        summary['sources'][STEM + suffix] = sha(DOCS / (STEM + suffix))
(DOCS / (STEM + '-summary.json')).write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
csv_write(STEM + '-routes.csv', routes)
csv_write(STEM + '-growth.csv', growth)
csv_write(STEM + '-campaigns.csv', [{k: v for k, v in r.items() if not isinstance(v, dict)} for r in campaigns])
csv_write(STEM + '-fixed.csv', [{k: v for k, v in r.items() if k not in ['observations', 'skillDps']} for r in fixed['runs']])
csv_write(STEM + '-moving.csv', [{**{k: r[k] for k in ['condition', 'field', 'profile', 'seed', 'cadence', 'wave', 'terminal']},
                                    'key': key, 'seconds': r['observations']['seconds'],
                                    **{k: v for k, v in stats.items() if isinstance(v, (float, int))}}
                                   for r in moving['runs'] for key, stats in r['observations']['towers'].items()])
if primary:
    csv_write(STEM + '-primary-campaigns.csv', [{k: r[k] for k in ['condition', 'profile', 'seed', 'wave', 'terminal', 'seconds', 'clearedWaves', 'moveCount', 'upgradeCount']} for r in primary['runs']])
    csv_write(STEM + '-primary-energy.csv', [{k: v for k, v in r.items() if not isinstance(v, dict)}
                                           for group in primary_exposure for r in [group['before'], group['after'], group['neutral']]])


def pct(n):
    return f'{n * 100:.1f}%'


def profile_name(profile):
    return '／'.join(NAMES[key].replace('塔', '') for key in moving['profiles'][profile])


md = [
    '# 六塔平衡复测：统一扣费之后', '',
    '日期：2026-11-10。基于V1.18.9之后的本地扣费修复，尚未发布新版本。本轮只改tools/docs，不调整游戏攻击、费用或技能配置。修复前数据完整保留。', '',
    '## 结论与调整顺序', '',
    '**扣费临界修复有效，但不能据此判定六塔已平衡。下一轮优先试算火／电／炮的强化普攻收费，暂不统一改基础攻击。**', '',
    '正常档60能量时的满路线输出基本保留；有限供能下，多重火球、连锁电和重炮双管的单体输出约翻倍。因此此前部分“伤害偏低”确实由扣费时点造成，不能直接用抬攻击补偿。', '',
    '| 塔 | 本轮判断 | 建议动作 |',
    '| --- | --- | --- |',
    '| 火 | 多重火球供能压力仍远高于区域技，密集输出却不低 | 优先重估多重火球＋大火球按多名溅射目标预估的收费；不统一加攻击 |',
    '| 冰 | 冰锥路线供能充足；冰花冬珠路线更敏感，且承担控制 | 暂保留基础攻击，专项复核碎冰对大体型目标的多次命中和区域技控制价值 |',
    '| 毒 | 毒棒毒池中等供能压力；传染路线在不死靶上缺少击杀触发收益 | 暂保留攻击与驻场预算，补死亡/传染场景后再判断传染路线 |',
    '| 电 | 连锁改善明显，但实战仍长时间低能量且受射程限制；周期路线输出较低 | 优先重估连锁预估跳数收费，周期路线再按控制/覆盖单独判断，不一并抬全塔攻击 |',
    '| 回旋镖 | 供能最宽裕，满路线风痕与风暴镖输出高；实际往返和覆盖影响较大 | 不再增伤；优先核对持续命中与群体覆盖预算，避免只因固定大靶高输出就直接削弱 |',
    '| 炮 | 强化普攻单体弱、群体强且收费高；驻场路线也有低能暴露 | 优先重估重炮预估溅射＋双管收费，保留地雷伤害，不统一增强炮塔 |', '',
    '基础配置Lv13理论DPS约98–125，差异明显小于成型路线输出差异；但回旋镖实际攻击节奏不按配置间隔直接循环，此项只能排查基础数值，不能代替实战。', '',
    '另一个需要明确接受的规则结果：只要出手前能量大于0但不足20，本次就是60%伤害。均匀供能0.35和0.7下，高耗能普攻都可能每次得到少量能量后立即花光，因而出现相近DPS；继续小幅降费未必马上改变表现，须结合20/40能量阈值、冷却和射程一起观察。', '',
    '下一轮建议比较“强化额外费用封顶”与“按当次可用目标折算费用”两个试算方案，保持60能量参考的伤害不变，再用相同种子复测。此报告不擅自选定新费用或修改游戏数值。', '',
    '## 测量口径', '',
    '- 固定目标336组：六塔×两路线×Lv4/7/13×单体/12密集目标×供能×种子41/123；预热120秒、计量120秒、60Hz。Lv13另测0.35能量/秒，其余供能为正常档60能量参考和0.7能量/秒。',
    '- 60能量参考由每帧补到60实现，不是100满能量。供能有限组可在富余时超过90，享受最高30%增伤，因此保留率可能超过100%。',
    '- 固定靶不移动、不死亡、无护甲，不计算击杀传染、生存或控制收益。单体为大体型Boss靶，密集组为12只普通体型靶；碰撞体积会影响散射/碎冰的命中数，不能假设群体DPS必然高于单体。伤害取原生dmgStat的实际生命/护盾扣减。',
    '- 移动战斗90组：三图、六种四塔组合，正常供能/60能量参考/真实宝箱三条件；花园2秒操作两种子，另测4秒操作。真实棋盘与动画，固定优先普通三连，固定升级路线，宝箱选第一项；无商店、红卡天赋或永久升星。会按规则使用全局补能与锻造，非纯普攻测试。',
    '- 移动测试只用每塔一条预设路线；两路线的公平输出对照来自固定靶。混合组合里的总伤害和生存波次不能作为单塔排名。',
    '- 首次城墙归零即停止，两轮都不把异常回血续局算入表现；所以跨轮差异主要来自扣费/空放/快照/免耗修复，不能归功于消除异常复活。',
    '- 波次推进超过60的采样上限不等于通关；“失守W40”也不代表击败W40 Boss。自动首选构筑不是玩家最优构筑。',
    f'- 新两批源码一致，{len(fixed["sourceHashes"])}个运行时文件哈希通过；30组供能配对共同前缀共{moving["pairedSteps"]}步；跨轮无圣物{cross_pairs}组共同前缀共{cross_steps}步通过。带宝箱组的奖励时机可能改变棋盘，不能强称跨轮操作严格一致。', '',
    '## Lv13单体与能耗：两种子均值', '',
    '0.7能量/秒是统一诊断输入，并非真人每秒供能。保留率=该供能DPS÷60能量参考DPS；该指标只判断供能敏感性，不代表塔的综合强度。', '',
    '| 塔 | 路线 | 正常档单体DPS | 有限供能DPS前→后 | 变化 | 保留率前→后 | 0.35供能DPS | 正常档请求能量/秒 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
]
for r in routes:
    md.append(f'| {NAMES[r["key"]]} | {r["label"]} | {r["after_boss_neutral"]:.0f} | {r["before_boss_finite"]:.0f}→{r["after_boss_finite"]:.0f} | {r["single_change"]:+.1%} | {pct(r["before_boss_retained"])}→{pct(r["after_boss_retained"])} | {r["after_boss_slow"]:.0f} | {r["after_boss_asked"]:.2f} |')
md.extend(['', '## Lv13密集12目标总DPS', '',
           '| 塔 | 路线 | 正常档群体DPS | 有限供能DPS前→后 | 变化 | 有限供能保留率 |',
           '| --- | --- | ---: | ---: | ---: | ---: |'])
for r in routes:
    md.append(f'| {NAMES[r["key"]]} | {r["label"]} | {r["after_dense_neutral"]:.0f} | {r["before_dense_finite"]:.0f}→{r["after_dense_finite"]:.0f} | {r["dense_change"]:+.1%} | {pct(r["after_dense_retained"])} |')
md.extend(['', '## 基础攻击成长与技能成长分开看', '',
           '以下只列配置基础直伤，不含技能、能量、圣物、天赋或商店加成；理论DPS按配置间隔计算。回旋镖实际出手受往返/接镖影响，不能以理论DPS冒充实际频率。', '',
           '| 塔 | Lv1单发基础伤害 | 每级增加 | Lv13单发基础伤害 | Lv13配置理论DPS | 基础普攻费用 |',
           '| --- | ---: | ---: | ---: | ---: | ---: |'])
for r in base_growth:
    md.append(f'| {NAMES[r["key"]]} | {r["attackL1"]:.1f} | {r["attackPerLevel"]:.2f} | {r["attackL13"]:.1f} | {r["nominalDpsL13"]:.2f} | {r["cost"]:.4f} |')
md.extend(['', '合法投入后的路线实测成长：Lv4/7/13分别有3/6/12次选择；同一路线按预设分支升级，不代表单纯塔等级的收益。以下都是单体大体型靶DPS，两种子均值。完整群体成长见growth.csv。', '',
           '| 塔 | 路线 | 60能量参考 Lv4→7→13 | 0.7供能 Lv4→7→13 |',
           '| --- | --- | ---: | ---: |'])
for r in growth:
    n = '→'.join(f'{r[f"boss_L{level}_neutral"]:.0f}' for level in [4, 7, 13])
    f = '→'.join(f'{r[f"boss_L{level}_finite"]:.0f}' for level in [4, 7, 13])
    md.append(f'| {NAMES[r["key"]]} | {r["label"]} | {n} | {f} |')
md.extend(['', '## 实战能量暴露：花园每2秒操作、无圣物正常组', '',
           '按每塔实际在场时间加权。各塔参与的组合与时长不同，属于供能暴露，不能当成公平单塔DPS。修复后能活得更久也可能更多经历高压后段，不能仅凭低能时长升降判断修复好坏。', '',
           '| 塔 | 平均能量前→后 | <40占比前→后 | <20占比前→后 | 0能量占比前→后 | 射程受限占比后 | 普攻不足费占比后 | 周期不足费次数后 |',
           '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'])
for r in exposure:
    if r['field'] != 'ancient' or r['condition'] != 'normal':
        continue
    a, b = r['before'], r['after']
    md.append(f'| {NAMES[r["key"]]} | {a["mean_energy"]:.1f}→{b["mean_energy"]:.1f} | {pct(a["below40"])}→{pct(b["below40"])} | {pct(a["below20"])}→{pct(b["below20"])} | {pct(a["zero"])}→{pct(b["zero"])} | {pct(b["range_blocked"])} | {pct(b["short_primary"])} | {b["periodic_short"]}/{b["periodic_requests"]} |')
md.extend(['', '周期“不足费”表示扣光余量但仍成功施放，不表示没有释放。射程受限表示正常射程内有敌人但实际射程内没有敌人的时间，不等于错过的攻击次数。', '',
           '## 花园每2秒操作：失守波次/结局（种子41、123）', '',
           '| 四塔组合 | 无圣物前→后 | 60能量参考前→后 | 宝箱构筑前→后 |',
           '| --- | --- | --- | --- |'])


def ending(wave, terminal):
    return str(wave) if terminal == 'wall_broken' else {'victory': '胜利', 'wave_cap': '采样上限', 'time_cap': '时间截止'}.get(terminal, terminal)


for profile in moving['profiles']:
    cells = []
    for condition in ['normal', 'neutral', 'relics']:
        xs = sorted([r for r in campaigns if r['field'] == 'ancient' and r['cadence'] == 2 and r['profile'] == profile and r['condition'] == condition], key=lambda r: r['seed'])
        cells.append('；'.join(ending(r['before_wave'], r['before_terminal']) + '→' + ending(r['after_wave'], r['after_terminal']) for r in xs))
    md.append('| ' + profile_name(profile) + ' | ' + ' | '.join(cells) + ' |')
if primary:
    md.extend(['', '## 强化普攻路线：36组移动补测', '',
               '原90组移动测试仍沿用旧预设路线，火/炮以区域或召唤技为主，不能据此评价多重火球、重炮双管的折算收益。此处将火/冰/毒/炮换成对应强化普攻路线，电/回旋镖沿用原路线。', '',
               '只用花园、每2秒普通三连、无圣物、种子41/123；六组合×两种子×三条件，共36组。对照组在离线进程内把各技能系数临时设为1，其余逻辑完全相同；实验组使用各技能配置值；另设60能量参考。没有改写游戏配置文件或用户存档。',
               f'对照组与两实验条件的24组共同操作前缀共{primary["pairedSteps"]}步通过；仍在首次破防停止。', '',
               '| 四塔组合 | 系数1失守波次 | 技能独立系数失守波次 | 60能量参考 |',
               '| --- | --- | --- | --- |'])
    for profile in primary['profiles']:
        cells = []
        for condition in ['factor1', 'skillFactors', 'neutral']:
            xs = sorted([r for r in primary['runs'] if r['profile'] == profile and r['condition'] == condition], key=lambda r: r['seed'])
            cells.append('／'.join(ending(r['wave'], r['terminal']) for r in xs))
        md.append('| ' + profile_name(profile) + ' | ' + ' | '.join(cells) + ' |')
    md.extend(['', '同一路线的混合组合能量暴露：按每塔实际在场时长加权。各组生存时长/等级不同，低能量占比不能直接当单技能伤害净效应。', '',
               '| 塔 | 平均能量（系数1→技能系数） | <40能量占比 | 0能量占比 | 射程受限占比 |',
               '| --- | ---: | ---: | ---: | ---: |'])
    for r in primary_exposure:
        a, b = r['before'], r['after']
        md.append(f'| {NAMES[r["key"]]} | {a["mean_energy"]:.1f}→{b["mean_energy"]:.1f} | {pct(a["below40"])}→{pct(b["below40"])} | {pct(a["zero"])}→{pct(b["zero"])} | {pct(a["range_blocked"])}→{pct(b["range_blocked"])} |')
    md.extend(['', '为减少生存时长差异，再统一截取所有36组都已完整经历的W1–10。时间加权的前10波能量表现如下；等级仍随真实击杀成长变化，不是锁等级实验。', '',
               '| 塔 | 前10波平均能量（系数1→技能系数） | 前10波零能量时间占比 |',
               '| --- | ---: | ---: |'])
    for r in primary_prefix:
        a, b = r['before'], r['after']
        md.append(f'| {NAMES[r["key"]]} | {a["mean_energy"]:.1f}→{b["mean_energy"]:.1f} | {pct(a["zero"])}→{pct(b["zero"])} |')
md.extend(['', '## 三地图与慢操作的完整结果', '',
           '完整90组逐局结果见同名前缀campaigns.csv；各塔分地图、条件的能量暴露见summary.json。三张地图Boss接入程度不同，不跨地图排名Boss强度。', '',
           '## 版本与复核', '',
           '相对历史基线发生变化的运行时文件：' + '、'.join(changed) + ('。仅技能能耗折算及相关注释配置变化；采集期间源码保持不变。' if SKILL_MODE else '。没有配置文件变化。'), '',
           f'复跑：`node tools/collect-six-tower-energy.cjs fixed {args.tag}` 与 `node tools/collect-six-tower-energy.cjs moving {args.tag}`，完成后运行 `python tools/report-six-tower-energy-retest.py --tag {args.tag} --baseline {args.baseline or chr(34)+chr(34)}`。', '',
           f'输出前缀：{STEM}；fixed.json/CSV、moving.json/CSV、moving-raw.json.gz、routes.csv、growth.csv、campaigns.csv、summary.json、comparison.png。历史原文件不覆盖。', '',
           '这是离线战斗逻辑与能耗测算，未测真机帧率、温度、真人操作/胜率或穷举技能构筑。随机种子数量有限，不将微小差异宣称为统计显著。', ''])
if primary:
    md.extend(['强化普攻36组补测复跑：`node tools/collect-primary-energy-retest.cjs`；需先完成补测再生成skill-factors报告。补测输出primary.json、primary-raw.json.gz；报告输出primary-campaigns.csv、primary-energy.csv和primary-energy.png。', ''])
if SKILL_MODE:
    cutoff = md.index('## 测量口径')
    md = ['# 六塔平衡复测：每技能独立能耗系数', '',
          '日期：2026-11-10。基于V1.18.9之后的本地工作区，对比上轮“仅统一扣费规则”的after-fee结果。当前每个配置技能激活后各提供一次系数，分支升级不额外累计，默认每技能0.8；没有全局统一折扣。尚未发布新版本。', '',
          '本轮完成336组固定靶、90组原路线移动对照，并补36组强化普攻移动测试，共462组。只写tools/docs，不再调整游戏数值；历史报告与数据保留。', '',
          '## 结论与下一步', '',
          '先看真实移动供能与固定正常能量参考，再判断是否需要更改某个技能系数。费用降低不等于固定低能量档DPS必然同步提升；供能跨过20/40/90阈值时才可能出现明显变化。', '',
          '| 塔 | 强化路线正常档请求能量/秒前→后 | 有限供能单体DPS前→后 |',
          '| --- | ---: | ---: |'] + [
          f'| {NAMES[r["key"]]}·{r["label"]} | {r["before_boss_asked"]:.3f}→{r["after_boss_asked"]:.3f} | {r["before_boss_finite"]:.0f}→{r["after_boss_finite"]:.0f} |'
          for r in routes if (r['key'], r['route']) in {('fire','steady'),('ice','steady'),('poison','alternate'),('electric','steady'),('boomerang','steady'),('cannon','alternate')}] + ['',
          '所有60能量固定靶参考伤害逐例与上轮一致，说明未改正常档伤害能力。有限供能下，冰锥与剧毒路线更易积累高能量加成；多重火球和连锁仍可能停留在60%伤害平台。强化后是否过强还要看移动覆盖与控制，不能只按大体型不死靶排名。', '',
          '**下一步建议：先保留这版系数和基础攻击，定位火塔多重火球／大火球、炮塔重炮／双管在W15–20的供能与Boss卡点。电塔先保留0.8观察，冰／毒／回旋镖暂不继续降费。**', '',
          '前10波的零能量时间已明显减少，火／炮的压力更多集中在中后段。下一轮应先按波段拆分强化收费、实际命中和Boss伤害，再只对相关技能进行系数试算；如比较0.8、0.75、0.7候选，需同时检查是否使前10波过强。此处是后续试验建议，尚未写入游戏配置。', '',
          '不要把整局总伤或失守波次解释成单塔独立强度，也不直接按固定靶给基础攻击统一增减。各组合在场时长和等级会变化；低于40能量占比可能因存活更久反而升高，应同时看零能量占比和实际推进。', '',
          '独立参数已记录在fixed/moving数据的skillEnergyFactors中；未配置的其他技能不会自动折算。此轮直接比较“无折算”与“每技能独立折算”，没有把短暂的全局八折版本当作历史基线。', ''] + md[cutoff:]
    md = [line.replace('所以跨轮差异主要来自扣费/空放/快照/免耗修复，不能归功于消除异常复活。',
                       '跨轮都已使用出手前快照与空放修复，当前对比主要考察新增的技能能耗系数。') for line in md]
(DOCS / (STEM + '-analysis.md')).write_text('\n'.join(md), encoding='utf-8')

# 静态对比图便于查看和导出；数值与完整报告使用同一summary。
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
import numpy as np

font = Path('C:/Windows/Fonts/msyh.ttc')
if font.exists():
    font_manager.fontManager.addfont(str(font))
    plt.rcParams['font.family'] = font_manager.FontProperties(fname=str(font)).get_name()
plt.rcParams['axes.unicode_minus'] = False
fig, axes = plt.subplots(1, 2, figsize=(16, 9), gridspec_kw={'width_ratios': [1.12, 1]})
fig.patch.set_facecolor('#f5f7fa')
labels = [NAMES[r['key']] + ' · ' + r['label'].split('／')[0] for r in routes]
y = np.arange(12)
colors = ['#a1abb9', '#21867a']
for ax, scenario, title in zip(axes, ['boss', 'dense'], ['单体DPS', '12只密集目标总DPS']):
    old = [r[f'before_{scenario}_finite'] for r in routes]
    new = [r[f'after_{scenario}_finite'] for r in routes]
    ax.barh(y - 0.18, old, 0.34, color=colors[0], label='技能折算前' if SKILL_MODE else '修复前')
    ax.barh(y + 0.18, new, 0.34, color=colors[1], label='每技能独立系数' if SKILL_MODE else '统一扣费后')
    ax.set_yticks(y, labels if scenario == 'boss' else [''] * 12, fontsize=10)
    ax.invert_yaxis()
    ax.set_title(title + '（统一供能0.7/秒）', fontsize=14, pad=16)
    ax.grid(axis='x', alpha=0.16)
    ax.set_axisbelow(True)
    ax.set_xlim(0, max(old + new) * 1.22)
    for i, value in enumerate(new):
        ax.text(value + max(old + new) * .014, i + .18, f'{value:,.0f}', va='center', fontsize=9, color='#155d54')
    for edge in ['top', 'right', 'left']:
        ax.spines[edge].set_visible(False)
    ax.tick_params(axis='y', length=0)
    ax.legend(loc='lower right', frameon=False)
fig.suptitle('六塔平衡复测 · 每技能独立能耗系数' if SKILL_MODE else '六塔平衡复测 · 先看供能后的真实输出', fontsize=20, fontweight='bold', y=.98)
fig.text(.5, .035, 'Lv13 · 每塔两条路线 · 种子41/123均值 · 固定靶不死、不移动、无护甲\n单体与群体分开比较；不含控制、击杀传染和实际存活价值，不能直接视为综合强度排名。', ha='center', fontsize=11, color='#4e5b6c')
fig.tight_layout(rect=(0, .09, 1, .94), w_pad=2)
fig.savefig(DOCS / (STEM + '-comparison.png'), dpi=130)
plt.close(fig)
if primary:
    fig, axes = plt.subplots(1, 2, figsize=(13, 6.5))
    fig.patch.set_facecolor('#f5f7fa')
    y = np.arange(6)
    for ax, groups, title in zip(axes, [primary_prefix, primary_exposure],
                                ['统一前10波：零能量时间占比', '整局：零能量时间占比']):
        a = [r['before']['zero'] * 100 for r in groups]
        b = [r['after']['zero'] * 100 for r in groups]
        ax.barh(y - .18, a, .34, color=colors[0], label='各技能系数设为1')
        ax.barh(y + .18, b, .34, color=colors[1], label='各技能独立0.8')
        ax.set_yticks(y, [NAMES[r['key']] for r in primary_exposure])
        ax.invert_yaxis()
        ax.set_xlim(0, 55)
        ax.set_title(title, pad=16)
        for i, value in enumerate(b):
            ax.text(value + .7, i + .18, f'{value:.1f}%', va='center', color='#155d54')
        ax.grid(axis='x', alpha=.16)
        ax.set_axisbelow(True)
        for edge in ['top', 'right', 'left']:
            ax.spines[edge].set_visible(False)
        ax.tick_params(axis='y', length=0)
    fig.legend(*axes[0].get_legend_handles_labels(), loc='lower center', bbox_to_anchor=(.5, .14), ncol=2, fontsize=10, frameon=False)
    fig.suptitle('真实三消供能 · 前期改善明显，中后段仍有压力', fontsize=18, fontweight='bold', y=.98)
    fig.text(.5, .04, '花园每2秒操作 · 36组移动对照 · 种子41/123 · 无圣物\n六种四塔组合按各塔实际在场时长加权；各组等级/整局存活时长不同，不能当作单塔强弱排名。', ha='center', fontsize=10, color='#4e5b6c')
    fig.tight_layout(rect=(0, .22, 1, .93), w_pad=2)
    fig.savefig(DOCS / (STEM + '-primary-energy.png'), dpi=140)
    plt.close(fig)
print(json.dumps(dict(fixed=336, moving=90, primary=36 if primary else 0, pairedChecks=moving['pairedChecks'], crossRoundPairs=cross_pairs,
                      crossRoundSteps=cross_steps, changedRuntime=len(changed), report=str(DOCS / (STEM + '-analysis.md')))))
