"""汇总火/冰六种子配对回放、候选取舍及终点燃烧地面实际收益；不覆盖历史报告。"""
from pathlib import Path
import csv
import gzip
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
files = ['nearest-primary', 'current-primary', 'candidate-primary', 'fire-primary',
         'ice-aim-primary', 'current-ground', 'candidate-ground', 'fire-ground']
data = {key: json.loads(gzip.decompress((DOCS / f'fire-ice-{key}.json.gz').read_bytes())) for key in files}
for key, item in data.items():
    assert item['passiveReplayChecked'] and item['frozenRuntime'], key
    assert len(item['runs']) == (12 if key == 'ice-aim-primary' else 6 if key.endswith('ground') else 36)

final = data['fire-primary']
drift = [f for f, digest in final['sourceHashes'].items()
         if hashlib.sha256((ROOT / f).read_bytes()).hexdigest() != digest]
assert not drift, drift
assert final['policy']['fire']['trajectoryAim'] and final['policy']['fire']['geometryScore']
assert not final['policy']['ice']['trajectoryAim'] and not final['policy']['ice']['geometryScore']
changed = [f for f, h in final['sourceHashes'].items() if data['current-primary']['sourceHashes'].get(f) != h]
assert set(changed) == {'js/combat/trajectory-aim.js', 'js/combat/targeting.js', 'js/combat/towers/fire.js',
                        'js/combat/towers/ice.js', 'js/config/targeting.js'}, changed
assert set(data['current-primary']['sourceHashes']) <= set(final['sourceHashes'])

metrics = ['launched', 'finished', 'hit', 'emptyRay', 'motionRisk', 'launchOpportunityLost',
           'collisionNoDamage', 'focusGone', 'staticOpportunity', 'movingOpportunity',
           'effectiveDamage', 'hitGrounds', 'endpointGrounds', 'hitGroundDamage', 'endpointGroundDamage']
rows = []
aggregate = []
for mode, item in data.items():
    for run in item['runs']:
        for r in run['observations']['detail']:
            assert r['launched'] == r['finished'] + r['pending']
            assert r['finished'] == sum(r[k] for k in ['hit', 'emptyRay', 'motionRisk', 'launchOpportunityLost', 'collisionNoDamage'])
            rows.append(dict(mode=mode, seed=run['seed'], profile=run['profile'], terminal=run['terminal'], **r))
    for key in ['fire', 'ice']:
        for segment in ['W1-14', 'W15-19', 'W20']:
            rs = [r for r in rows if r['mode'] == mode and r['key'] == key and r['segment'] == segment]
            values = {k: sum(r[k] for r in rs) for k in metrics}
            aggregate.append(dict(mode=mode, key=key, segment=segment, **values,
                                  hitRate=values['hit'] / max(1, values['finished'])))
with (DOCS / 'fire-ice-trajectory.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)

def stats(mode, key, segment='W15-19'):
    return next(r for r in aggregate if r['mode'] == mode and r['key'] == key and r['segment'] == segment)

clears = {key: sum(r['terminal'] == 'window_complete' for r in item['runs']) for key, item in data.items()}
ground = {}
for label in ['current', 'fire']:
    rs = [r for r in rows if r['mode'] == label + '-ground' and r['key'] == 'fire']
    ground[label] = {k: sum(r[k] for r in rs) for k in ['hitGrounds', 'endpointGrounds', 'hitGroundDamage', 'endpointGroundDamage']}
    ground[label]['peakGrounds'] = max(r['peakGrounds'] for r in rs)

summary = dict(date='2026-11-10', savedRuns=sum(len(x['runs']) for x in data.values()), changedRuntime=changed,
               sourceHashes=final['sourceHashes'], passiveReplayChecked=True, sourceDrift=drift,
               aggregate=aggregate, clears=clears, ground=ground,
               decision='Enable fire prelaunch intercept and discrete-ray scoring. Leave ice switches off; no stable benefit proven.')
(DOCS / 'fire-ice-trajectory-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

md = ['# 火、冰弹道命中专项', '', '日期：2026-11-10。V1.18.9后本地工作区；未上传版本。', '',
      '## 本轮决定', '',
      '火塔启用发射前移动预判和实际离散射线评分：侧弹之间的空隙不再当成有效覆盖。发射后仍是固定直线，保留原弹数、射程、飞行时长、碰撞半径、直接伤害和C燃烧地面。', '',
      '冰塔继续使用上一轮方案。其预判/离散评分已做对照，但完整候选没有稳定收益；两个开关在正式配置中保持关闭，后续可以分别验证，不直接推广到正式体验。', '',
      '没有修改基础攻击、攻速、技能伤害倍率、能耗系数、Boss收费、炮弹固定落点或其落空溅射规则。', '',
      '## 方法与样本边界', '',
      '花园、六种四塔阵容、每2秒普通三消、无圣物/天赋/商店，到W20全歼或首次破防。种子41/123/307/911/2027/4093。每个完整方案36组，包含火/冰的阵容各30组；不是单塔独立DPS对比。', '',
      '保存174组回放：就近对照36、上一轮方案36、火冰完整候选36、最终仅火塔启用36、仅冰预判小样本12，以及火球C三种配置各6组。全部通过完整原生回放的被动观察器对照；数据保存固定源码快照哈希和实际policy设置。配置在独立采集进程内切换，不写存档、不修改磁盘游戏配置。', '',
      '“就近对照”仅把火/冰主目标及小冰锥分配改回按距离排序，其他四塔、炮弹落点和在途软避让保持现版。它不是完整回滚上一版，因此不与历史after-range数据混为同一对照。', '',
      '计数按发射波段归属，已结束才进入命中率分母，在途不算落空。命中指至少造成一次有效生命/护盾损失。火球地面后续伤害另外统计，不混进弹体命中率。', '',
      '## W15–19命中率', '',
      '| 方案 | 火：命中/结束 | 火命中率 | 冰：命中/结束 | 冰命中率 | W20全歼 |',
      '| --- | ---: | ---: | ---: | ---: | ---: |']
for label, title in [('nearest-primary', '仅火冰就近对照'), ('current-primary', '上一轮方案'),
                     ('candidate-primary', '火冰完整候选'), ('fire-primary', '最终：仅启用火塔调整')]:
    a, b = stats(label, 'fire'), stats(label, 'ice')
    md.append(f'| {title} | {a["hit"]}/{a["finished"]} | {a["hitRate"]:.1%} | '
              f'{b["hit"]}/{b["finished"]} | {b["hitRate"]:.1%} | {clears[label]}/36 |')
md += ['', '扩大样本后，“上一轮火冰选敌导致命中率稳定下降”的判断不成立：火塔当前方案优于就近对照，冰塔约持平。两种子上的小幅回落不能直接当作持续退化。', '',
       '最终方案火塔命中率从65.5%到66.8%，冰塔约90.1%保持；这只是本批离线构筑的结果，不代表统计显著或真人胜率提高。冰塔代码默认未启用新行为，但火塔改变会影响共同战场，因此冰塔观测数值仍可能变化。', '',
       '完整候选的冰塔命中率为89.6%；仅冰预判在前两种子的W15–19是90.5%对90.4%，幅度过小且样本有限，没有据此打开默认开关。', '',
       '## 上一轮方案的落空拆分', '',
       '| 塔 | 已结束弹体 | 无静态/移动几何机会 | 静态有机会、移动预测无机会 | 发射时有预测机会、最终未命中 |',
       '| --- | ---: | ---: | ---: | ---: |']
for key, title in [('fire', '火'), ('ice', '冰')]:
    r = stats('current-primary', key)
    md.append(f'| {title} | {r["finished"]} | {r["emptyRay"]} | {r["motionRisk"]} | {r["launchOpportunityLost"]} |')
md += ['',
       '这些是可重复核对的几何标签，不是严格因果判定。预测以发射时移速/状态为准；敌人被其他攻击击杀、随后减速/冻结/击退、路径遮挡等，都可能让发射时的机会消失。focusGone包含被本弹击杀的目标，不能直接作为“别人抢先击杀”的数量。', '',
       '火塔原评分把整个扇区当成连续覆盖，同时邻近敌人数很快达到评分上限；最终改为按真实火球数量、角度、半径和预计到达位置评价射线。冰塔的主要问题不是静态瞄准误差，本轮不通过扩大半径或增加伤害掩盖。', '',
       '## 火球C：终点地面单独归因', '',
       '使用多重火球C路线，3种子×火冰毒电/火冰毒炮，共6组。与A路线弹数和升级不同，不能用这组直接得出A/C强弱排名。观察器跟踪每枚火球生成的地面，按命中生成或射程终点生成，归因后续实际生命/护盾伤害；已做两类区域重叠、真实伤害及完全被动性回归。', '',
       '| 方案 | 命中生成 | 终点生成 | 命中地面有效伤害 | 终点地面有效伤害 | 同时存在峰值 |',
       '| --- | ---: | ---: | ---: | ---: | ---: |']
for label, title in [('current', '上一轮'), ('fire', '最终火塔方案')]:
    r = ground[label]
    md.append(f'| {title} | {r["hitGrounds"]} | {r["endpointGrounds"]} | {r["hitGroundDamage"]:.1f} | '
              f'{r["endpointGroundDamage"]:.1f} | {r["peakGrounds"]} |')
md += ['',
       '终点地面确实能造成伤害，但本批总贡献较小。统计在全歼/破防时停止，未把结束后尚存的地面假设成未来收益。数量峰值只代表当前C路线，不保证极高攻速、齐射及其他地图的最坏情况。', '',
       '## 验证和复跑', '',
       '- `node tools/test-fire-ice-trajectory.cjs`：5类斜向快怪真实碰撞对照、固定飞行方向、原弹数/伤害/费用、冻结/缠绕/减速/地图移速接口、Boss驻足线、实际射线空隙。冰塔预判用例通过不代表正式默认启用。',
       '- `node tools/test-fire-ice-observer.cjs`：命中/终点区域实际伤害归因，费用/伤害统计/区域寿命完全一致。',
       '- 原伤害、25组射程快照、六塔选敌/炮弹落点、44+52组独立能耗系数、209组周期能量临界和真实移动回放采集回归通过。',
       '- `node tools/benchmark-fire-ice-targeting.cjs` 为桌面Node参考；新增评分只在发射前运行，候选仍限16个，移速在一轮选敌内复用。该计时不能替代手机帧率和温度测试。',
       '- 采集：`node tools/collect-fire-ice.cjs current`、`nearest`、`candidate`、`fire`；C路线增加参数 `ground`。冰单独预判：`node tools/collect-fire-ice.cjs ice-aim primary 41,123`。',
       '- 报告：`python tools/report-fire-ice.py`。CSV提供每个种子/阵容/波段原始计数，summary.json保存汇总，JSON.gz无损保存完整回放指标以减少仓库体积。历史24组报告不覆盖。', '',
       '尚未完成真机弹道观感、帧率和温度验证。本轮不宣称六塔整体平衡完成；下一阶段应结合真实供能、实际伤害/能量、零能量时间和成长曲线做统一比较。', '']
(DOCS / 'fire-ice-trajectory.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(savedRuns=summary['savedRuns'], changed=changed, sourceDrift=drift,
                      fire=stats('fire-primary', 'fire')['hitRate'], ice=stats('fire-primary', 'ice')['hitRate'], ground=ground), ensure_ascii=False))
