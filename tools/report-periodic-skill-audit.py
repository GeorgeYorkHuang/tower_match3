"""第一轮收尾：电冰周期技能的真实命中与辅助收益；只有一版极光候选，未采用。"""
from pathlib import Path
import gzip
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
OWNERS = {'球形闪电': 'electric', '雷暴': 'electric', '极光电击': 'electric', '冰花': 'ice', '冬珠': 'ice'}


def read(name):
    return json.loads(gzip.decompress((DOCS / f'{name}.json.gz').read_bytes()))


def outcome(data):
    return dict(runs=len(data['runs']), reached40=sum(r['wave'] >= 40 for r in data['runs']),
                passed40=sum(r['terminal'] == 'window_complete' for r in data['runs']))


base = read('periodic-skill-audit')
candidate = read('aurora-budget-candidate')
assert base['sourceHashes'] == candidate['sourceHashes']
assert base['passiveFullReplayChecked'] and candidate['passiveReplayChecked'] and candidate['reproducedBaseline']
assert not base['liveChanges'] and not candidate['liveChanges']
assert len(base['runs']) == len(candidate['runs']) == 12
for file, digest in base['sourceHashes'].items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
for d in [base, candidate]:
    for r in d['runs']:
        assert r['field'] == 'ancient' and r['route'] == 'secondary'
        for skill, tower in OWNERS.items():
            actual = r['damage'].get(tower, {}).get('skill', {}).get(skill, 0)
            observed = sum(c['effectiveDamage'] for c in r['observations']['periodic']['casts'] if c['skill'] == skill)
            assert abs(actual - observed) < 1e-5, (skill, actual, observed)


def metrics(data, skill):
    all_casts = [c for r in data['runs'] for c in r['observations']['periodic']['casts'] if c['skill'] == skill and 25 <= c['wave'] <= 39]
    cs = [c for c in all_casts if c['complete']]
    count = len(cs)
    return dict(skill=skill, casts=len(all_casts), completed=count,
                emptyCompleted=sum(c['hitEvents'] == 0 for c in cs),
                meanTargets=sum(c['uniqueTargets'] for c in cs) / max(1, count),
                meanDamage=sum(c['effectiveDamage'] for c in cs) / max(1, count),
                meanEnergy=sum(c['energyBefore'] for c in cs) / max(1, count),
                pulses=sum(c['pulses'] for c in cs), nonemptyPulses=sum(c['pulsesWithHits'] for c in cs),
                pulseHits=sum(c['pulseHits'] for c in cs), trailHits=sum(c['trailHits'] for c in cs))


rows = [metrics(base, skill) for skill in OWNERS]
storm = [c for r in base['runs'] for c in r['observations']['periodic']['casts'] if c['skill'] == '雷暴' and 25 <= c['wave'] <= 39]
assert all(c['uniqueTargets'] == min(c['inRange'], c['desiredTargets']) for c in storm)
storm_coverage = dict(casts=len(storm), fullTargetCasts=sum(c['uniqueTargets'] == c['desiredTargets'] for c in storm),
                      desiredTargets=sum(c['desiredTargets'] for c in storm), actualTargets=sum(c['uniqueTargets'] for c in storm))
utility = {k: sum(r['observations']['periodic']['utility'][k] for r in base['runs'])
           for k in base['runs'][0]['observations']['periodic']['utility']}
flower = [c for r in base['runs'] for c in r['observations']['periodic']['casts'] if c['skill'] == '冰花' and 25 <= c['wave'] <= 39 and c['complete'] and not c['hitEvents']]
assert all(c['spawnedObjects'] > 0 for c in flower), 'No-hit flowers must have actually generated delayed effects'
summary = dict(date='2026-11-10', sourceHashes=base['sourceHashes'], gameNumericalChanges=False,
               round1Complete=True, adoptedCandidate=None, skillMetrics=rows, stormCoverage=storm_coverage,
               utility=utility, baseline=outcome(base), candidate=outcome(candidate),
               candidateParameters=candidate['parameters'], candidateAurora=metrics(candidate, '极光电击'))
(DOCS / 'periodic-skill-audit-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
md = ['# 收尾第一轮：电冰周期技能命中与辅助贡献', '',
      '日期：2026-11-10。只测试圣坛花园周期/驻场路线12组，六种四塔组合×两种子，真实一星圣物，无商店/红卡/天赋。正式参数未修改。', '',
      '## 口径与完整性', '',
      '- 逐次记录施法、实际命中与原生伤害统计；雷球持续对象和冰花延迟结算保留施法归属。全部12局五项技能的逐施法伤害合计与原生统计一致，没有漏记或重复记账。',
      '- 每局完整回放以及原有能量/时间线观察均逐项复现旧基线，观察器未改变战斗。',
      '- 以下仅选W25–39施放、结束前已完整结算的施法。窗口最后几次可能在W40完成；未完成持续对象不计空放。均值涉及不同等级、圣物、能量和投入，不是技能强度排名或玩家胜率。', '',
      '| 技能 | 完整施法数 | 完整施法零命中 | 每次平均不同目标 | 每次平均有效伤害 | 施法前平均能量 |',
      '| --- | ---: | ---: | ---: | ---: | ---: |']
for r in rows:
    md.append(f'| {r["skill"]} | {r["completed"]} | {r["emptyCompleted"]} | {r["meanTargets"]:.2f} | {r["meanDamage"]:.1f} | {r["meanEnergy"]:.1f} |')
ball = rows[0]
md += ['', '## 电系：不是整次技能失效', '',
       f'- 球形闪电：{ball["nonemptyPulses"]}/{ball["pulses"]}次雷球脉冲有命中（{ball["nonemptyPulses"]/ball["pulses"]:.1%}），共{ball["pulseHits"]}次脉冲目标命中、{ball["trailHits"]}次电痕命中；没有完整施法全程零命中。约39%单球脉冲打空与随机漂移/局部覆盖有关，不能把每次脉冲都当作对满范围敌人命中。',
       f'- 雷暴：{storm_coverage["fullTargetCasts"]}/{storm_coverage["casts"]}次施法打满配置目标上限；实际{storm_coverage["actualTargets"]}个目标，配置上限合计{storm_coverage["desiredTargets"]}个。每次都符合min(出手前射程内存活目标数,配置上限)，未发现明明有足够合法目标却少打的情况。',
       '- 极光电击：没有零命中施法，但本路线选B增伤，主弧80%攻击起、分叉40%主弧，每8秒基础周期耗3能量，实际单次平均收益明显低于另外两项。较低能量同时压低伤害、缩短射程、拉长冷却，但这不是所有电塔技能都该统一增加基础攻击的证据。',
       '- 技能射程按当前inTowerRange的纵向口径验收；没有把普攻欧氏距离选敌规则强行改到周期技能上。', '',
       '## 冰系：伤害以外的收益', '',
       f'- W25–39实际冰墙吸收合计{utility["shieldAbsorbed"]:.2f}伤害，有效到期回血{utility["wallHeal"]:.0f}。同一观察窗到期的名义回血为{utility["nominalExpiryHeal"]:.0f}，满血上限等使有效回血只有{utility["wallHeal"]/utility["nominalExpiryHeal"]:.1%}；并非漏发。',
       f'- 冰缓覆盖移动敌人{utility["iceSlowMovingEnemySeconds"]:.1f}敌人秒、城墙前敌人{utility["iceSlowSiegeEnemySeconds"]:.1f}敌人秒。麻痹使城墙前敌人停止攻击的观察时间合计{utility["paralyzedSiegeEnemySeconds"]:.1f}敌人秒；后者是所有来源的状态观测，不能全部记作某个电系技能的独占收益。',
       '- 当前路线选冰花B、冬珠C、冰墙C，没有选择“冰冻”技能或冬珠A减速；所以不能把本路线伤害/控制表现推广到全部冰塔构筑。',
       f'- 冰花有{len(flower)}/289次完整施法未命中。每次都已生成0.8秒延迟效果，最终范围内无存活目标；需要与瞬发技能区分，不能把这些记录判为技能没有生成。', '',
       '## 只验证一版极光候选，然后结束本轮', '',
       '进程内候选：主弧80%→120%攻击，B仍每级加20个百分点，分叉40%→60%主弧。费用3、周期8秒、射程、麻痹和其余技能保持。没有写入正式游戏文件。', '',
       '| 完整周期路线 | 到达W40 | 通过W40 |', '| --- | ---: | ---: |',
       f'| 当前原版 | {summary["baseline"]["reached40"]}/12 | {summary["baseline"]["passed40"]}/12 |',
       f'| 极光候选 | {summary["candidate"]["reached40"]}/12 | {summary["candidate"]["passed40"]}/12 |', '',
       '本批候选没有保住原通过样本，因此不采用。少量种子下出手、击杀、随机候选和构筑会联动变化，不能据此断言“加伤害会变弱”；同样没有足够依据发布这版参数。', '',
       '**第一轮检查结束。**已完成实际命中与冰系辅助收益核对，不继续扩大降费或极光候选。下一步直接进入第二轮完整W1–60，重点检查后半段与最终Boss；目前攻击和能耗、W40参数继续保持。', '',
       '验证：`node tools/test-periodic-skill-audit.cjs`覆盖真实雷球命中/空脉冲、挂起对象、原生扣血统计、极光出手前纵向射程与能量临界；12组旧回放和原观察器逐项一致；12组候选通过无修改基线复现及观察器被动检查。复跑：`node tools/collect-periodic-skill-audit.cjs`、`node tools/collect-aurora-budget.cjs`、`python tools/report-periodic-skill-audit.py`。', '']
(DOCS / 'periodic-skill-audit-analysis.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(round1Complete=True, skills=rows, storm=storm_coverage, utility=utility,
                      baseline=summary['baseline'], candidate=summary['candidate'], adopted=None), ensure_ascii=False))
