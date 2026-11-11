"""比较射程修复基线与六塔选敌/落点实现，保留历史数据并生成独立报告。"""
from pathlib import Path
import csv
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
before = json.loads((DOCS / 'projectile-waste-after-range.json').read_text(encoding='utf-8'))
after = json.loads((DOCS / 'projectile-waste-after-targeting.json').read_text(encoding='utf-8'))
names = dict(fire='火塔', ice='冰塔', poison='毒塔', electric='电塔', boomerang='回旋镖', cannon='炮塔')
ui_files = {'js/game/render.js', 'js/game/input/menu-actions.js'}
changed = [f for f, h in after['sourceHashes'].items() if before['sourceHashes'].get(f) != h]
drift = [f for f, h in after['sourceHashes'].items() if hashlib.sha256((ROOT / f).read_bytes()).hexdigest() != h]
assert not set(drift) - ui_files, drift
assert after['frozenRuntime'] and after['passiveReplayChecked']
assert before['routes'] == after['routes']
assert len(before['runs']) == len(after['runs']) == 24
assert {f for f in changed if f.startswith('js/config/')} == {'js/config/targeting.js'}
assert all(f.startswith('js/combat') or f in ui_files or f == 'js/config/targeting.js' for f in changed), changed

counts = ['launched', 'finished', 'hit', 'deadTargetMiss', 'trajectoryMiss', 'otherMiss', 'pending', 'deadFocusFinished']
rows = []
for route in ['native', 'primary']:
    for segment in ['W1-14', 'W15-19', 'W20']:
        for key in names:
            row = dict(route=route, segment=segment, key=key)
            for label, data in [('before', before), ('after', after)]:
                items = [r for run in data['runs'] if run['route'] == route
                         for r in run['observations']['rows'] if r['segment'] == segment and r['key'] == key]
                n = {c: sum(r[c] for r in items) for c in counts}
                assert n['launched'] == n['finished'] + n['pending']
                assert n['finished'] == sum(n[c] for c in ['hit', 'deadTargetMiss', 'trajectoryMiss', 'otherMiss'])
                row.update({label + '_' + c: v for c, v in n.items()})
                row[label + '_deadMissFraction'] = n['deadTargetMiss'] / max(1, n['finished'])
                row[label + '_hitFraction'] = n['hit'] / max(1, n['finished'])
            rows.append(row)

with (DOCS / 'projectile-waste-after-targeting.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)

clears = {}
for route in ['native', 'primary']:
    clears[route] = {label: sum(r['terminal'] == 'window_complete' for r in data['runs'] if r['route'] == route)
                     for label, data in [('before', before), ('after', after)]}
summary = dict(date=after['date'], runs=24, changedRuntime=changed, sourceDrift=drift,
               sourceHashes=after['sourceHashes'], frozenRuntime=True,
               liveChanges=after['liveChanges'], passiveReplayChecked=True, rows=rows, w20Clear=clears)
(DOCS / 'projectile-waste-after-targeting-summary.json').write_text(
    json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

md = [
    '# 六塔分工选敌、炮弹固定落点与火球落地', '',
    '日期：2026-11-10。基于V1.18.9后的本地工作区；本次未发布版本。', '',
    '## 实现规则', '',
    '| 塔 | 发射前的目标偏好 |',
    '| --- | --- |',
    '| 火 | 多重火球朝向能覆盖更多敌人的扇区，大火球优先敌群；普通弹仍重视前线威胁。 |',
    '| 冰 | 优先靠前、快且未受控的敌人；穿刺重视一条路径可覆盖的敌人数，小冰锥循环分配不同候选。 |',
    '| 毒 | 优先未中毒、毒层较少的敌人，同时兼顾前线和剩余血量。 |',
    '| 电 | 重视前线、密集敌群和未受控目标。 |',
    '| 回旋镖 | 优先能覆盖多目标的路径，追加镖尽量分散目标和方向；目标不足时允许集中。 |',
    '| 炮 | 优先密集敌群和相对耐打的目标，减少慢弹去抢残血。 |', '',
    '这些都是可调的软偏好。临近防线的紧急目标优先；没有硬性“一怪只能被一座塔攻击”的限制，只有一个Boss时仍可集火。', '',
    '选敌参数集中于 `js/config/targeting.js`。只在选敌时评分，最多保留16个靠前候选做群体/路径评价，避免每帧对全部怪做两两计算。', '',
    '### 在途伤害软避让', '',
    '从本轮实际生成的弹体登记原始伤害，预估到达时间、护甲和可信度；仅当已有弹体早于本次攻击到达，且保守预估足以消灭目标时，降低该目标的选敌评分。普通锁定弹按75%预估，散射按55%，同轮散射对同一目标最多预估一枚。', '',
    '不把溅射、持续伤害、连锁子弹或回旋镖全程扫敌当成保证伤害。预估不修改血量，不扣额外能量，也不保证命中。弹体完成、目标死亡、重开后自然释放，没有跨局预留。', '',
    '### 炮弹固定落点', '',
    '- 普通炮弹、双管/追炮和齐射炮弹在发射前，根据原目标移动预判固定落点；画面和逻辑使用同一点，飞行中不重新索敌、不折线转向。',
    '- 到点时原目标仍在命中范围：保持原直伤，原溅射排除主目标，避免主目标再吃一次溅射。',
    '- 原目标死亡或已经离开：在固定落点只结算原范围、原倍率的溅射；不把旁边敌人补成新的直击主目标，不退能、不重扣。',
    '- 命中累计、过热和双管命中返能仍要求原目标实际命中；落地溅射不会伪造一次直接命中。碎裂弹、炮火支援等独立技能保持各自原弹道。', '',
    '### 多重火球C燃烧地面', '',
    '每枚火球保持原直线碰撞，命中时留下燃烧地面；未命中则飞完本次射程后，在终点留下地面。原目标提前死亡不会令火球立即消失或在半途凭空生成地面。每枚最多一次，战场边缘限制在有效区域内，无C分支不生成。', '',
    '沿用原40px范围、原C分支持续时间、原攻击伤害×15%每秒；不增加直接伤害、不再次收费，持续结束正常清理。', '',
    '**基础攻击、射速、技能伤害系数、13项独立能耗系数和Boss收费均未调整。**相对上一轮基线，原有配置文件哈希全部保持，唯一新增配置为选敌偏好。', '',
    '## 同口径24组回放', '',
    '对比 `projectile-waste-after-range.json` 与 `projectile-waste-after-targeting.json`。花园、每2秒一次普通三消、无圣物/天赋/商店；六种四塔阵容×两组路线×种子41/123。运行到W20全歼或首次破防。只观察真实attackOnce发射的弹体，不混入周期技能、免费命中子弹、三消额外攻击和连消转弹。', '',
    '观察器做了完整被动回放对照，并验证已发射＝已结束＋在途、已结束＝命中＋各类落空；在途不算落空。按发射波段统计结局，命中是至少造成一次有效生命/护盾损失。', '',
    '新采集在独立Node进程使用固定内存源码快照，保存全量源码哈希。相对基线另有已有的菜单/图鉴入口UI改动（render、menu-actions），已核对未改变战场布局或战斗调度；它们不属于本次战斗实现。采集期间磁盘变化见JSON的liveChanges。历史数据和报告保持原样。', '',
    '### W15–19原路线', '',
    '| 塔 | 原目标死亡且无有效伤害：之前→之后 | 已结束弹体：之前→之后 | 有效命中率：之前→之后 |',
    '| --- | ---: | ---: | ---: |',
]
for row in rows:
    if row['route'] == 'native' and row['segment'] == 'W15-19':
        md.append(f'| {names[row["key"]]} | {row["before_deadMissFraction"]:.1%}→{row["after_deadMissFraction"]:.1%} | '
                  f'{row["before_finished"]}→{row["after_finished"]} | {row["before_hitFraction"]:.1%}→{row["after_hitFraction"]:.1%} |')
md += ['', '### W15–19强化普攻路线', '',
       '| 塔 | 原目标死亡且无有效伤害：之前→之后 | 已结束弹体：之前→之后 | 有效命中率：之前→之后 |',
       '| --- | ---: | ---: | ---: |']
for row in rows:
    if row['route'] == 'primary' and row['segment'] == 'W15-19':
        md.append(f'| {names[row["key"]]} | {row["before_deadMissFraction"]:.1%}→{row["after_deadMissFraction"]:.1%} | '
                  f'{row["before_finished"]}→{row["after_finished"]} | {row["before_hitFraction"]:.1%}→{row["after_hitFraction"]:.1%} |')
md += ['',
       '强化路线：火为多重火球/大火球，冰为多重小冰锥/穿刺/碎冰，毒为剧毒/瘟疫/毒爆，炮为重炮/双管/碎裂弹；详细分支保存在JSON的routes。阵容和战斗时长不同，不作为公平单塔DPS排名。', '',
       '**炮塔的“命中”包含原目标死亡后挽回的溅射收益，不代表直接命中率提高到同样水平。**火/冰散射、回旋镖不会因原目标死亡自动取消沿途碰撞，因此其目标死亡落空为0也不代表没有轨迹空打。', '',
       '火球和冰锥强化路线的轨迹命中率本轮略有下降，不能称六塔所有指标同时改善；选敌朝向和几何轨迹还需要结合真机观察。该采集不统计火球终点地面未来造成的持续伤害，也不能据此判断C燃烧地面的完整收益。', '',
       '| 路线 | W20全歼：之前 | W20全歼：之后 |',
       '| --- | ---: | ---: |',
       f'| 原路线 | {clears["native"]["before"]}/12 | {clears["native"]["after"]}/12 |',
       f'| 强化普攻路线 | {clears["primary"]["before"]}/12 | {clears["primary"]["after"]}/12 |', '',
       '这是两种子、固定三消节奏的离线回放，不能当作真人胜率或已经完成六塔平衡。尚未真机验证帧率、温度及弹道观感。', '',
       '## 验证与复跑', '',
       '- `node tools/test-targeting-and-landings.cjs`：六塔偏好、紧急/唯一目标、到达先后、预估释放、散射保守预估、多镖分散、固定炮弹直伤/溅射/双管/一次爆炸/不退能、落空不触发返能；火球命中/死亡后终点落地/每枚一次/无C/原DPS/到期清理。',
       '- 原伤害回归 `test-tower-damage-rules.cjs`；能耗独立系数 `test-attack-energy-discount.cjs`（44+52组）；射程快照 `test-attack-range-snapshot.cjs`（25组）；统一扣费 `test-tower-energy-rules.cjs`（209组周期能量临界用例及普攻等回归）均通过。',
       '- 移动回放采集、能耗观察器、风痕/召唤驻场预算、局内圣物节奏和破防结算回归通过。',
       '- 重新采集：`node tools/collect-projectile-waste.cjs after-targeting`；生成本报告：`python tools/report-targeting-and-landings.py`。不要用旧报告脚本覆盖历史射程修复基线。', '',
       '数据：projectile-waste-after-targeting.json、CSV、summary.json。', '']
(DOCS / 'targeting-and-landings.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(runs=24, changed=changed, sourceDrift=drift, w20Clear=clears), ensure_ascii=False))
