"""比较组合计费修正前后：相同伤害参考、真实三消供能及逐局推进，保留上一轮原始数据。"""
from pathlib import Path
from collections import defaultdict
import csv
import gzip
import hashlib
import json
import math
import statistics

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
NAMES = dict(fire='火塔', ice='冰塔', poison='毒塔', electric='电塔', boomerang='回旋镖', cannon='炮塔')

def load(tag, mode):
    return json.loads(gzip.decompress((DOCS / f'six-tower-{tag}-{mode}.json.gz').read_bytes()))

def csv_write(name, rows):
    with (DOCS / name).open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)

old_fixed, new_fixed = load('current', 'fixed'), load('budget-fix', 'fixed')
old_moving, new_moving = load('current', 'primary'), load('budget-fix', 'primary')
assert len(old_fixed['runs']) == len(new_fixed['runs']) == 144
assert len(new_moving['runs']) == 48 and new_moving['passiveReplayChecked']
assert new_fixed['sourceHashes'] == new_moving['sourceHashes']
assert new_fixed['routes'] == old_fixed['routes'] == new_moving['routes'] == old_moving['routes']
assert new_fixed['skillEnergyFactors'] == old_fixed['skillEnergyFactors']
changed = [f for f, h in new_fixed['sourceHashes'].items() if old_fixed['sourceHashes'].get(f) != h]
assert changed == ['js/combat/attack-energy.js'], changed
for file, digest in new_fixed['sourceHashes'].items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file

fixed_id = lambda r: tuple(r[k] for k in ['key', 'route', 'level', 'scenario', 'seed'])
old_lookup = {fixed_id(r): r for r in old_fixed['runs']}
fixed_checks = []
for r in new_fixed['runs']:
    before = old_lookup[fixed_id(r)]
    assert math.isclose(r['dps'], before['dps'], rel_tol=1e-9, abs_tol=1e-7), fixed_id(r)
    if r['key'] not in ['ice', 'boomerang'] or r['route'] == 'secondary':
        assert math.isclose(r['askedPerSecond'], before['askedPerSecond'], abs_tol=1e-7), fixed_id(r)
    fixed_checks.append(dict(key=r['key'], route=r['route'], level=r['level'], scenario=r['scenario'], seed=r['seed'],
                             beforeDps=before['dps'], afterDps=r['dps'],
                             beforeAskedPerSecond=before['askedPerSecond'], afterAskedPerSecond=r['askedPerSecond']))

old_budget = json.loads((DOCS / 'six-tower-current-attack-budget.json').read_text(encoding='utf-8'))
new_budget = json.loads((DOCS / 'six-tower-budget-fix-attack-budget.json').read_text(encoding='utf-8'))
assert len(old_budget['rows']) == len(new_budget['rows']) == 18
for before, after in zip(old_budget['rows'], new_budget['rows']):
    assert before['key'] == after['key'] and before['choices'] == after['choices'] and before['stage'] == after['stage']
    assert before['projectileCount'] == after['projectileCount'] and before['maxTargetsPerProjectile'] == after['maxTargetsPerProjectile']
    assert math.isclose(before['projectileDamageFactor'], after['projectileDamageFactor'], abs_tol=1e-9)
    assert before['configuredFactor'] == after['configuredFactor']

run_id = lambda r: tuple(r[k] for k in ['field', 'seed', 'profile', 'cadence'])
baseline = {run_id(r): r for r in old_moving['runs'] if r['condition'] == 'normal'}
assert len(baseline) == 48 and set(baseline) == {run_id(r) for r in new_moving['runs']}
comparisons = []
prefix_steps = full_prefixes = 0
wave_rows = []
for after in new_moving['runs']:
    before = baseline[run_id(after)]
    count = 0
    for a, b in zip(before['moves'], after['moves']):
        if a['board'] != b['board'] or a['move'] != b['move']: break
        count += 1
    common = min(len(before['moves']), len(after['moves']))
    prefix_steps += count; full_prefixes += count == common
    comparisons.append(dict(field=after['field'], seed=after['seed'], profile=after['profile'], cadence=after['cadence'],
        beforeWave=before['wave'], afterWave=after['wave'], beforeTerminal=before['terminal'], afterTerminal=after['terminal'],
        beforeSeconds=before['seconds'], afterSeconds=after['seconds'], beforeCleared=before['clearedWaves'], afterCleared=after['clearedWaves'],
        sharedPrefix=count, sharedLength=common))
    for label, run in [('before', before), ('after', after)]:
        assert math.isclose(sum(w['seconds'] for w in run['waves']), run['totals']['seconds'], abs_tol=1e-6)
        for w in run['waves']:
            segment = 'W1-10' if w['wave'] <= 10 else 'W11-19' if w['wave'] < 20 else 'W20' if w['wave'] == 20 else 'W21-39' if w['wave'] < 40 else 'W40+'
            for key, t in w['towers'].items():
                asked = t['requestedAttackEnergy'] + t['requestedSkillEnergy']
                paid = t['actualAttackEnergy'] + t['actualSkillEnergy']
                assert paid <= asked + 1e-6 and t['zeroSeconds'] <= w['seconds'] + 1e-6
                wave_rows.append(dict(version=label, field=run['field'], seed=run['seed'], profile=run['profile'], cadence=run['cadence'],
                    wave=w['wave'], segment=segment, key=key, seconds=w['seconds'], asked=asked, paid=paid,
                    damage=w['damage'].get(key, {}).get('total', 0), zeroSeconds=t['zeroSeconds'], lowSeconds=t['lowSeconds'],
                    energySeconds=t['energySeconds'], matchEnergy=t['matchEnergy'], refillEnergy=t['refillEnergy']))

groups = defaultdict(list)
for r in wave_rows:
    groups[tuple(r[k] for k in ['version', 'field', 'cadence', 'segment', 'key'])].append(r)
energy = []
for identity, rows in groups.items():
    out = dict(zip(['version', 'field', 'cadence', 'segment', 'key'], identity))
    out.update({k: sum(r[k] for r in rows) for k in ['seconds', 'asked', 'paid', 'damage', 'zeroSeconds', 'lowSeconds', 'energySeconds', 'matchEnergy', 'refillEnergy']})
    time = max(out['seconds'], 1e-9)
    out.update(runs=len({(r['seed'], r['profile']) for r in rows}), meanEnergy=out['energySeconds'] / time,
        zeroFraction=out['zeroSeconds'] / time, lowFraction=out['lowSeconds'] / time, dps=out['damage'] / time,
        askedPerSecond=out['asked'] / time, paidPerSecond=out['paid'] / time,
        damagePerAsked=out['damage'] / out['asked'] if out['asked'] else None)
    energy.append(out)

def cell(version, key):
    return next(r for r in energy if r['version'] == version and r['field'] == 'ancient' and r['cadence'] == 2 and r['segment'] == 'W11-19' and r['key'] == key)

outcomes = dict(later=sum(r['afterWave'] > r['beforeWave'] for r in comparisons),
                same=sum(r['afterWave'] == r['beforeWave'] for r in comparisons),
                earlier=sum(r['afterWave'] < r['beforeWave'] for r in comparisons))
csv_write('six-tower-budget-fix-fixed.csv', fixed_checks)
csv_write('six-tower-budget-fix-campaigns.csv', comparisons)
csv_write('six-tower-budget-fix-energy.csv', energy)
summary = dict(date='2026-11-10', fixedRuns=144, movingRuns=48, projectileAuditCases=18,
               changedRuntime=changed, sourceHashes=new_fixed['sourceHashes'], damageReferenceChecks=144,
               sharedPrefixSteps=prefix_steps, completeSharedPrefixes=full_prefixes, outcomes=outcomes,
               energy=energy, fixed=fixed_checks, comparisons=comparisons)
(DOCS / 'six-tower-budget-fix-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

def fixed_ask(data, key):
    return statistics.mean(r['askedPerSecond'] for r in data['runs'] if r['route'] == 'primary' and r['key'] == key and r['level'] == 13 and r['scenario'] == 'boss')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
fonts = {f.name for f in font_manager.fontManager.ttflist}
for font in ['Microsoft YaHei', 'SimHei', 'SimSun', 'Noto Sans CJK SC']:
    if font in fonts: plt.rcParams['font.sans-serif'] = [font]; break
plt.rcParams['axes.unicode_minus'] = False
fig, axes = plt.subplots(1, 2, figsize=(13, 6.8), gridspec_kw={'wspace': .38})
for index, (label, data, color) in enumerate([('修正前', old_fixed, '#99a5af'), ('修正后', new_fixed, '#278779')]):
    y = [i + (index - .5) * .3 for i in range(6)]
    asks = [fixed_ask(data, key) for key in NAMES]
    energies = [cell('before' if index == 0 else 'after', key)['meanEnergy'] for key in NAMES]
    for ax, values, places in [(axes[0], asks, 2), (axes[1], energies, 1)]:
        ax.barh(y, values, height=.27, color=color, label=label)
        for at, value in zip(y, values): ax.text(value + (.035 if ax == axes[0] else .6), at, f'{value:.{places}f}', va='center', fontsize=9)
for ax in axes:
    ax.set_yticks(range(6), list(NAMES.values())); ax.invert_yaxis(); ax.grid(axis='x', alpha=.16)
    ax.spines[['top', 'right']].set_visible(False)
axes[0].set_xlim(0, 4.7); axes[0].set_title('Lv13强化路线：请求能量/秒'); axes[0].set_xlabel('固定60能量参考；两种子均值')
axes[1].set_xlim(0, 112); axes[1].set_title('花园W11–19：平均能量'); axes[1].set_xlabel('真实三消供能，2秒操作')
axes[0].legend(loc='lower right')
fig.suptitle('组合计费修正前后｜正常能量档伤害保持不变', fontsize=16, y=.96)
fig.text(.5, .035, '实战为不同四塔构筑加权观测，不能当作单塔独立强度排名。', ha='center', fontsize=10)
fig.subplots_adjust(top=.86, bottom=.15)
fig.savefig(DOCS / 'six-tower-budget-fix-overview.png', dpi=160, facecolor='white'); plt.close(fig)

md = ['# 冰锥/穿刺、多镖计费修正与复测', '', '日期：2026-11-10。V1.18.9后本地工作区；未发布新版本。', '',
      '## 已实施', '',
      '唯一修改的游戏文件为js/combat/attack-energy.js；基础攻击、成长、技能伤害/弹数/碰撞、各技能独立能耗系数均保持。', '',
      '- 冰锥：多重弹数/伤害倍率与穿透预期倍率相乘。继续使用原60%额外目标占用预估，不根据本次实际敌人数临时重算价格。再乘每个已激活技能自己的系数，各一次；分支升级不多叠折扣。',
      '- 多镖：按实际同轮每枚相同倍率求总和，取消计费独有的逐枚递减。多镖初学时费用略降，高等级原漏算部分补齐；不是所有阶段都涨价。',
      '- 同步核对圣物追加：普通/小冰锥都计入实际追加弹数，穿透计入追加次数；多镖圣物追加数量不会额外增加基础衰减，与发射代码一致。没有新加圣物折扣或重复命中收费。',
      '- 只在出手时扣一次。缺能继续释放并扣光剩余能量，本次伤害仍用扣费前快照；穿透、碎冰、往返扫敌不补扣。Boss沿用预期群体能力收费，不按单目标打折。', '',
      '## 费用示例', '',
      '| 构筑 | 修正前费用倍率 | 修正后费用倍率 | 基础普攻费×倍率：前→后 |',
      '| --- | ---: | ---: | ---: |',
      '| 小冰锥C3＋穿刺A3 | 1.152 | 3.9168 | 0.4608→1.56672 |',
      '| 多镖A3 | 1.248 | 2.08 | 0.5408→0.90133 |', '',
      '这是预期输出计费，不保证每发命中满目标。冰锥示例：18×10%×(1＋60%×4)×0.8×0.8；多镖示例：5×52%×0.8。两个0.8来自两项独立配置，不是全局常数。', '',
      '## 验证范围', '',
      '144组固定60能量参考全部与上一轮伤害逐项一致；其他四塔及周期/驻场路线的请求费用也逐项一致。18组实际发射核对确认初始弹数、倍率、穿透上限不变。', '',
      '新增72组真实弹体计费/碰撞回归，覆盖合法分支组合、缺能与临界能量、圣物追加、独立参数修改、穿透/碎冰/回程不补扣；原44＋52组独立系数、209组周期能量边界、25组射程快照、伤害及六塔选敌/炮弹落点回归通过。', '',
      '## 三消供能对比', '',
      '本轮新跑48组受影响的强化路线：三图×两种子×六种四塔组合，花园另测4秒操作；全部使用三消及原全局技能供能，不增加自动回能。对照上一轮相同48组正常供能，不把周期路线旧数据计为本轮新回放，也没有重跑移动中的固定60能量组。', '',
      f'共同棋盘操作前缀共{prefix_steps}步；{full_prefixes}/48对在双方共同长度内完全一致。能量变化会影响清怪、经验和敌人状态，因此整局伤害不是单塔纯因果比较。排除圣物/天赋/商店/局外星级；这不是完整玩家养成或真人胜率。', '',
      '| 塔 | W11–19平均能量：前→后 | 零能时间：前→后 | 请求能量/秒：前→后 | 有效伤害/请求能量：前→后 |',
      '| --- | ---: | ---: | ---: | ---: |']
for key in NAMES:
    a, b = cell('before', key), cell('after', key)
    md.append(f'| {NAMES[key]} | {a["meanEnergy"]:.1f}→{b["meanEnergy"]:.1f} | {a["zeroFraction"]:.1%}→{b["zeroFraction"]:.1%} | '
              f'{a["askedPerSecond"]:.2f}→{b["askedPerSecond"]:.2f} | {a["damagePerAsked"]:.0f}→{b["damagePerAsked"]:.0f} |')
md += ['', '上表只含花园、2秒操作、W11–19，按含该塔的构筑在场时间加权。各塔样本数、等级、协同和目标不同；未修改费用的塔也会因共同战场变化而改变观测值。', '',
       '![修正前后概览](six-tower-budget-fix-overview.png)', '',
       '## 推进和取舍', '',
       f'48组同场景结果：失守波后移{outcomes["later"]}组、不变{outcomes["same"]}组、前移{outcomes["earlier"]}组。修正规则不是保证胜率上升；第一处补齐计费会降低冰塔维持高能量的能力，随后应据真实能量暴露判断是否需要单独调低相关技能系数。', '',
       '| 场景 | 修正前失守波中位 | 修正后失守波中位 |', '| --- | ---: | ---: |']
for field, cadence, title in [('ancient', 2, '花园2秒'), ('lava', 2, '熔岩2秒'), ('frost', 2, '霜风2秒'), ('ancient', 4, '花园4秒')]:
    rs = [r for r in comparisons if r['field'] == field and r['cadence'] == cadence]
    md.append(f'| {title} | {statistics.median(r["beforeWave"] for r in rs):.1f} | {statistics.median(r["afterWave"] for r in rs):.1f} |')
md += ['',
       '只比较首次破防/同一采样上限，走到某波不等于击败该波。高等级完整技能组和后期生存仍需结合局内圣物与玩家选牌验证；没有直接削冰塔伤害或给火/炮补伤害。', '',
       '## 复跑', '',
       '- `node tools/test-combined-attack-budget.cjs`。',
       '- `node tools/collect-six-tower-current.cjs fixed budget-fix`；`node tools/collect-six-tower-current.cjs primary budget-fix normal`。',
       '- `node tools/audit-current-attack-budget.cjs budget-fix`；`python tools/report-attack-budget-fix.py`。',
       '- 历史current前缀数据保持原样，新数据使用budget-fix前缀；源码哈希只允许attack-energy.js变化。未真机验证温度、帧率和实际操作体验。', '']
(DOCS / 'six-tower-budget-fix-analysis.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(fixed=144, moving=48, damageUnchanged=144, changed=changed, outcomes=outcomes,
                     prefixSteps=prefix_steps, completePrefixes=full_prefixes,
                     garden={key: {'before': cell('before', key)['meanEnergy'], 'after': cell('after', key)['meanEnergy']} for key in NAMES}), ensure_ascii=False))
