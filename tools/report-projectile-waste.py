"""射程快照修复结果与六塔目标死亡空耗审计；不改游戏参数。"""
from pathlib import Path
import csv
import hashlib
import json

ROOT=Path(__file__).resolve().parents[1]
DOCS=ROOT/'docs'
data=json.loads((DOCS/'projectile-waste-after-range.json').read_text(encoding='utf-8'))
before=json.loads((DOCS/'wave15-20-diagnosis.json').read_text(encoding='utf-8'))
assert len(data['runs'])==24 and data['passiveReplayChecked']
for file,digest in data['sourceHashes'].items():
    assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==digest
changed=[file for file,digest in data['sourceHashes'].items() if before['sourceHashes'][file]!=digest]
assert set(changed)=={'js/combat/attacks.js','js/combat.js','js/combat/towers/fire.js','js/combat/towers/ice.js'},changed
assert not any(file.startswith('js/config/') for file in changed),'Boss收费和技能参数必须保持'
names=dict(fire='火塔',ice='冰塔',poison='毒塔',electric='电塔',boomerang='回旋镖',cannon='炮塔')
rows=[]
for route in ['native','primary']:
    for segment in ['W1-14','W15-19','W20']:
        for key in names:
            xs=[r for run in data['runs'] if run['route']==route for r in run['observations']['rows']
                if r['key']==key and r['segment']==segment]
            counts={k:sum(r[k] for r in xs) for k in ['launched','finished','hit','deadTargetMiss','trajectoryMiss','otherMiss','pending','deadFocusFinished']}
            assert counts['launched']==counts['finished']+counts['pending']
            assert counts['finished']==sum(counts[k] for k in ['hit','deadTargetMiss','trajectoryMiss','otherMiss'])
            rows.append(dict(route=route,segment=segment,key=key,**counts,
                             kinds='/'.join(sorted({r['kind'] for r in xs})),
                             deadMissFraction=counts['deadTargetMiss']/max(1,counts['finished']),
                             hitFraction=counts['hit']/max(1,counts['finished'])))
with (DOCS/'projectile-waste-after-range.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)

old_repro=json.loads((DOCS/'wave15-20-fire-range-repro.json').read_text(encoding='utf-8'))
new_repro=json.loads((DOCS/'wave15-20-fire-range-after-fix.json').read_text(encoding='utf-8'))
assert old_repro[0]['actualDamage']==0 and new_repro[0]['actualDamage']>0
assert old_repro[0]['fee']==new_repro[0]['fee']
assert old_repro[1]['actualDamage']==new_repro[1]['actualDamage']

profiles={'elements':'火冰毒电','artillery_control':'火冰电炮','summon_control':'火冰毒炮','wind_artillery':'火冰镖炮'}
comparisons=[]
for run in data['runs']:
    if run['route']!='primary' or run['profile'] not in profiles:continue
    old=next(r for r in before['runs'] if r['condition']=='normal' and r['seed']==run['seed'] and r['profile']==run['profile'])
    comparisons.append(dict(profile=run['profile'],seed=run['seed'],
                            beforeClear=old['terminal']=='window_complete',afterClear=run['terminal']=='window_complete',
                            beforeWall=old['wallHp'],afterWall=run['wallHp']))
assert len(comparisons)==8
summary=dict(date=data['date'],counts=24,sourceHashes=data['sourceHashes'],changedRuntime=changed,
             passiveReplayChecked=True,rows=rows,reproBefore=old_repro,reproAfter=new_repro,w20=comparisons)
(DOCS/'projectile-waste-after-range-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')

md=['# 普攻射程快照修复与六塔弹道空耗', '',
    '日期：2026-11-10。基于当前V1.18.9后的本地工作区；未发布新版本。', '',
    '## 已完成的修复', '',
    '- 普攻找到目标时立即记录射程，并显式传给多重火球、多重冰锥、冰穿刺及小冰锥候选分配。扣费、借能和返能不会再改变该轮已经锁定的弹道长度。',
    '- 同次齐射的所有追加批次共用该射程；独立触发未传快照时仍读当前射程，不留跨帧/跨局共享状态。下一次普攻按新能量正常缩程，无目标不收费、不发射。',
    '- 没有调整Boss收费、技能预估目标数、能耗系数、基础攻击、射速或伤害系数。Boss仍沿用现有按预期群体能力计费的规则。', '',
    '原复现场景：目标距离500，出手前能量1.0528、射程562.857、费用2.1056。修复前扣到0后弹道400、伤害0；修复后弹道562.857、伤害62.8452。60能量参考伤害104.742保持不变；费用也保持不变。', '',
    '验证：tools/test-attack-range-snapshot.cjs共25组真实碰撞/跨档测试，另覆盖齐射、下一发短射程、飞行中补能、未穿透小冰锥远目标分配、原本超射程不出手。修复前证据repro.json保留，修复后另存after-fix.json。', '',
    '## 空耗是否主要在炮塔', '',
    '**炮塔在本批清怪阶段最突出，但不是炮塔独有。普通锁定火、冰、毒、电弹都走同一个resolveShot检查：到达时原目标已死/移出敌人列表则不结算，也不会再找目标。**', '',
    '炮塔普攻基础飞行1.5秒，火/冰/毒1秒，电0.5秒。炮塔慢弹加上双管/追炮集中打同一目标，更容易在到达前被其他攻击抢先击杀；毒塔较快的发射节奏也容易连续锁定同一目标。两者是从代码机制推断的原因，表格是本批观测，不作为穷举所有构筑后的排名。', '',
    '多重火球、冰锥/穿透是沿途碰撞，原方向目标死亡后仍能打到路径上的其他敌人；回旋镖沿轨迹扫敌也可命中其他目标。它们仍可能因路径没有敌人而空打，只是不属于“锁定目标死了就直接取消伤害”这一类。连消转弹还有重新索敌机制，此表不混入。', '',
    '## 24组真实移动回放', '',
    '花园、每2秒普通三连、无圣物/天赋/商店，种子41/123；六种四塔阵容×原路线/强化普攻路线×两种子，共24组，W20全歼或首次破防即停。只统计由真实attackOnce生成的弹体，排除周期技能、命中免费子弹、三消额外攻击与连消转弹。',
    '观察器已做完整原生回放被动对照；每组验证“已发射＝已结束＋在途”，“已结束＝命中＋目标死亡落空＋轨迹落空＋其他”。命中指至少造成一次有效生命/护盾损失。在途弹体不记为落空，按发射波段统计结局。', '',
    '**原路线W15–19：原目标提前死亡导致的落空占已结束普攻弹体比例。**原路线火/冰是普通锁定弹，炮塔为普通普攻＋召唤路线；各塔组合/时长/等级不同，不能视为公平单塔排名。', '',
    '| 塔 | 目标提前死亡落空 | 已结束弹体 | 比例 |',
    '| --- | ---: | ---: | ---: |']
for row in rows:
    if row['route']=='native' and row['segment']=='W15-19':
        md.append(f'| {names[row["key"]]} | {row["deadTargetMiss"]} | {row["finished"]} | {row["deadMissFraction"]:.1%} |')
md.extend(['', '**强化普攻路线W15–19：**火塔换多重火球，冰塔换冰锥/穿透/碎冰，毒塔换剧毒传染，炮塔换重炮双管；同样只统计原目标死亡直接落空。', '',
           '| 塔 | 目标提前死亡落空比例 | 已结束弹体命中率 | 沿途/轨迹未命中次数 |',
           '| --- | ---: | ---: | ---: |'])
for row in rows:
    if row['route']=='primary' and row['segment']=='W15-19':
        md.append(f'| {names[row["key"]]} | {row["deadMissFraction"]:.1%} | {row["hitFraction"]:.1%} | {row["trajectoryMiss"]} |')
md.extend(['', 'W20进入长血Boss阶段后，目标较少提前死亡。原路线普通弹的该项落空率降为火6.7%、冰4.3%、毒5.0%、电1.9%、炮4.4%；强化路线炮塔为6.9%。这说明本项空耗集中在清怪/抢尾刀阶段，不能用清怪阶段落空比例推算Boss战损失。', '',
           '## 射程修复后同8组W20表现', '',
           '以下与上一轮28组专项中的真实供能基线比较；本轮同时修复了冰锥/穿透的同类射程问题，不能将全部提升归于火塔。没有补入固定能量或改动Boss收费。', '',
           '| 阵容·种子 | 修复前 | 修复后 |',
           '| --- | --- | --- |'])
for r in comparisons:
    a=f'击败，墙{r["beforeWall"]:.0f}' if r['beforeClear'] else '失守'
    b=f'击败，墙{r["afterWall"]:.0f}' if r['afterClear'] else '失守'
    md.append(f'| {profiles[r["profile"]]}·{r["seed"]} | {a} | {b} |')
md.extend(['', '## 当前决定与后续边界', '',
           'Boss收费按用户确认保留，不按Boss时的实际溅射人数调整。炮塔或其他塔目标死亡后的弹道行为此次没有修改。',
           '如果继续处理空耗，建议先讨论炮弹目标死亡后保持最后落点爆炸，还是在飞行中重新索敌；两者会改变清怪覆盖与能效。普通火/冰/毒/电锁定弹是否一并处理也需明确范围，不能只改通用resolveShot后让全部塔行为默默变化。',
           '复跑：node tools/test-attack-range-snapshot.cjs；node tools/repro-fire-energy-range.cjs；node tools/collect-projectile-waste.cjs；python tools/report-projectile-waste.py。',
           '数据：projectile-waste-after-range.json、CSV、summary.json。历史W15–20诊断及其旧源码哈希保留。未进行真机帧率/温度和真人胜率测试。', ''])
(DOCS/'projectile-waste-after-range.md').write_text('\n'.join(md),encoding='utf-8')
print(json.dumps(dict(runs=24,changed=changed,passiveReplay=True,
                      w20Before=sum(r['beforeClear'] for r in comparisons),w20After=sum(r['afterClear'] for r in comparisons))))
