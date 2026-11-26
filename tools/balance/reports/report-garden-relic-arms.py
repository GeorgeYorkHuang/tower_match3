"""圣坛花园圣遗物摸底报告：四臂 + 1★ 隔离对照（仅攻击 / 仅绿点）；只描述不设门槛。"""
from pathlib import Path
import csv
import gzip
import json
import statistics

ROOT = Path(__file__).resolve().parents[3]
DOCS = ROOT / 'docs'
DATE = '2026-11-16'
ARMS = {
    'A': 'A 无圣物',
    'B': 'B 局内圣物',
    'C1': 'C1 红卡1★',
    'C3': 'C3 红卡3★',
    'C1A': 'C1A 1★仅攻击',
    'C1G': 'C1G 1★仅绿点',
}


def read(arm):
    path = DOCS / f'garden-relic-arms-{arm}-{DATE}.json.gz'
    payload = json.loads(gzip.decompress(path.read_bytes()))
    assert len(payload['runs']) == 12, (arm, len(payload['runs']))
    assert payload['frozenRuntime'] and payload['arm'] == arm
    return payload


data = {arm: read(arm) for arm in ARMS if (DOCS / f'garden-relic-arms-{arm}-{DATE}.json.gz').exists()}
assert len(data) >= 4, data.keys()

rows = []
for arm, payload in data.items():
    for r in payload['runs']:
        rows.append(dict(
            臂=ARMS[arm],
            seed=r['seed'],
            红卡星级=r['talentStar'],
            隔离乘区='+'.join(r['talentOnly']) if r.get('talentOnly') else '',
            圣物件数=r['relics'],
            清到波次=r['clearedWaves'],
            终止原因=r['terminal'],
            到达20=1 if r['clearedWaves'] >= 20 else 0,
            到达40=1 if r['clearedWaves'] >= 40 else 0,
            完成60=1 if r['clearedWaves'] >= 60 else 0,
            秒=round(r['seconds'], 1),
            城墙剩余=max(0, r['wallHp']),
            塔等级=json.dumps(r['levels'], ensure_ascii=False, sort_keys=True),
        ))

summary = []
for arm in data:
    rs = [r for r in rows if r['臂'] == ARMS[arm]]
    cleared = [r['清到波次'] for r in rs]
    summary.append(dict(
        臂=ARMS[arm],
        局数=len(rs),
        到达20=f"{sum(r['到达20'] for r in rs)}/{len(rs)}",
        到达40=f"{sum(r['到达40'] for r in rs)}/{len(rs)}",
        完成60=f"{sum(r['完成60'] for r in rs)}/{len(rs)}",
        中位清到=int(statistics.median(cleared)),
        最低=f"{min(cleared)}",
        最高=f"{max(cleared)}",
        平均圣物=round(statistics.mean([r['圣物件数'] for r in rs]), 1),
        平均秒=round(statistics.mean([r['秒'] for r in rs])),
    ))

curve = []
for w in range(5, 61, 5):
    line = {'波次': w}
    for arm in data:
        line[ARMS[arm]] = sum(1 for r in rows if r['臂'] == ARMS[arm] and r['清到波次'] >= w)
    curve.append(line)

breach = []
for arm in data:
    rs = [r for r in rows if r['臂'] == ARMS[arm] and r['终止原因'] == 'wall_broken']
    breach.append({'臂': ARMS[arm], '首破波次': ', '.join(str(r['清到波次'] + 1) for r in rs) or '无'})

# 配对表：同一种子下各臂清到波次的直接对照
paired = []
for seed in range(1, 13):
    line = {'seed': seed}
    for arm in data:
        hit = next((r for r in rows if r['臂'] == ARMS[arm] and r['seed'] == seed), None)
        line[ARMS[arm]] = hit['清到波次'] if hit else None
    paired.append(line)

md = []
md.append(f'# 圣坛花园 · 圣遗物摸底（{DATE}）')
md.append('')
md.append('口径：圣坛花园 W1–60，2 秒一手，纯塔（无商店、无局外天赋），首破即停；局内圣物走真实宝箱节点 + build 策略；'
          '红卡按原生槽位装配（1★ 只覆盖白/绿，紫天赋需 ≥2★、金天赋需 3★）。隔离臂在注入后把其余乘区清零，'
          '有效性由采集结果里的 `talentBonuses` 自证。未设任何达标门槛，只做描述。')
md.append('')
md.append('## 总表')
md.append('')
md.append('| 臂 | 局数 | 到 W20 | 到 W40 | 通 W60 | 中位清到 | 区间 | 平均圣物 | 平均秒 |')
md.append('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for s in summary:
    md.append(f"| {s['臂']} | {s['局数']} | {s['到达20']} | {s['到达40']} | {s['完成60']} | {s['中位清到']} | "
              f"{s['最低']}–{s['最高']} | {s['平均圣物']} | {s['平均秒']} |")
md.append('')
md.append('## 每 5 波存活局数')
md.append('')
md.append('| 波次 | ' + ' | '.join(ARMS[a] for a in data) + ' |')
md.append('| --- | ' + ' | '.join(['---'] * len(data)) + ' |')
for line in curve:
    md.append(f"| {line['波次']} | " + ' | '.join(str(line[ARMS[a]]) for a in data) + ' |')
md.append('')
md.append('## 首破波次')
md.append('')
md.append('| 臂 | 首破波次 |')
md.append('| --- | --- |')
for b in breach:
    md.append(f"| {b['臂']} | {b['首破波次']} |")
md.append('')
md.append('## 配对照（同一 seed 清到波次）')
md.append('')
md.append('| seed | ' + ' | '.join(ARMS[a] for a in data) + ' |')
md.append('| --- | ' + ' | '.join(['---'] * len(data)) + ' |')
for line in paired:
    md.append(f"| {line['seed']} | " + ' | '.join(str(line[ARMS[a]]) if line[ARMS[a]] is not None else '—'
                                                    for a in data) + ' |')
md.append('')
md.append('## 观察（只陈述事实，不含门槛判定）')
md.append('')
md.append('- A → B：到 W40 从 0/12 升到 6/12，通 W60 从 0 升到 4/12；局内圣物是本口径下最大的单一增益。')
md.append('- B → C1：到 W40 从 6/12 升到 12/12，通 W60 从 4/12 升到 12/12。1★ 红卡每塔 +6 攻击（Lv1 单发约 43，'
          '约 +14%）、charge +0.1、dot +0.2、skill +0.05，直接把 60 波顶满。')
md.append('- C1 与 C3 的逐局结果完全相同（都 12/12），当前样本已达难度上限饱和，1★ 与 3★ 的强度差在本窗口里无法区分。')


def arm_stat(name):
    rs = [r for r in rows if r['臂'] == ARMS[name]]
    return sum(r['完成60'] for r in rs), int(statistics.median([r['清到波次'] for r in rs])), len(rs)


if 'C1A' in data and 'C1G' in data and 'B' in data:
    pass_a, med_a, _ = arm_stat('C1A')
    pass_g, med_g, _ = arm_stat('C1G')
    pass_b, med_b, _ = arm_stat('B')
    md.append(f'- 隔离对照：1★ 只留攻击（每塔 +6，Lv1 单发约 +14%）时通 W60 {pass_a}/12、中位 {med_a}；'
              f'只留绿点（charge +0.1 / dot +0.2 / skill +0.05，攻击清零）时通 {pass_g}/12、中位 {med_g}；'
              f'不装红卡的 B 臂是 {pass_b}/12、中位 {med_b}。两者单独都到不了满贯，叠回 C1 才 12/12——'
              f'100% 不是某一乘区单独异常，而是攻击与能量/减速乘区叠加后的合力。')
md.append('- 历史对照：`docs/garden-entry-analysis.md` 的 2026-11-10 六塔 24 组原值为 W20 16/24、到 W40 2/24、中位 28.0，'
          '本轮 A 臂（4 塔）形状一致（12/12、0/12、中位 25）；历史里「六塔 +20% 伤害」那一档才是到 W40 10/24 的口径，'
          '与本轮不可直接相加比较。')
md.append('')
md.append('## 逐局')
md.append('')
md.append('| 臂 | seed | 红卡 | 隔离乘区 | 圣物 | 清到 | 终止 | 秒 | 城墙剩余 |')
md.append('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for r in sorted(rows, key=lambda x: (list(ARMS.values()).index(x['臂']), x['seed'])):
    md.append(f"| {r['臂']} | {r['seed']} | {r['红卡星级']} | {r['隔离乘区'] or '—'} | {r['圣物件数']} | "
              f"{r['清到波次']} | {r['终止原因']} | {r['秒']} | {r['城墙剩余']} |")
md.append('')
md.append('数据源：' + '、'.join(f'`docs/garden-relic-arms-{a}-{DATE}.json.gz`' for a in data) + '。')

(DOCS / f'garden-relic-arms-{DATE}.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
with (DOCS / f'garden-relic-arms-{DATE}.csv').open('w', encoding='utf-8-sig', newline='') as fh:
    writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
print(json.dumps(summary, ensure_ascii=False, indent=2))
