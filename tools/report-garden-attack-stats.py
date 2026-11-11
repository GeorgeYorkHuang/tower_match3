"""记录直接提高攻击配置后的花园结果，原共用增伤报告仅作为历史参照。"""
from pathlib import Path
import gzip
import hashlib
import json
import statistics

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'


def read(name):
    return json.loads(gzip.decompress((DOCS / f'{name}.json.gz').read_bytes()))


def aggregate(rs):
    return dict(runs=len(rs), passed20=sum(r['clearedWaves'] >= 20 for r in rs),
                reached40=sum(r['wave'] >= 40 for r in rs),
                passed40=sum(r['terminal'] == 'window_complete' for r in rs),
                timeCaps=sum(r['terminal'] == 'time_cap' for r in rs),
                medianEndWave=statistics.median(r['wave'] for r in rs))


data = read('garden-attack-stats')
old = read('garden-entry-native')
assert len(data['runs']) == 24 and all(r['field'] == 'ancient' for r in data['runs'])
assert data['passiveReplayChecked'] and not data['liveChanges']
for file, digest in data['sourceHashes'].items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
assert 'towerDamageMultiplier' not in (ROOT / 'js/config/combat-common.js').read_text(encoding='utf-8')
assert 'towerDamageMultiplier' not in (ROOT / 'js/combat/damage.js').read_text(encoding='utf-8')
baseline = dict(fire=(22.4, 8, 35), ice=(21.12, 6.4, 24), poison=(23.04, 7.2, 16),
                electric=(24, 7.2, 30), boomerang=(14.56, 7.2, 26), cannon=(28.8, 8, 60))
names = dict(fire='火塔', ice='冰塔', poison='毒塔', electric='电塔', boomerang='回旋镖塔', cannon='炮塔')
rows = []
for key, (base, growth, shot) in baseline.items():
    cfg = data['towers'][key]
    assert abs(cfg['baseDps'] - base * 1.2) < 1e-10
    assert abs(cfg['perLv'] - growth * 1.2) < 1e-10
    assert abs(cfg['attackCost'] - shot / 60) < 1e-10
    rows.append(dict(key=key, name=names[key], baseDps=cfg['baseDps'], perLvDps=cfg['perLv'],
                     initialAttack=round(cfg['baseDps'] * cfg['atkInterval'], 8),
                     perLvAttack=round(cfg['perLv'] * cfg['atkInterval'], 8),
                     attackCost=cfg['attackCost']))
summary = dict(date='2026-11-10', sourceHashes=data['sourceHashes'], sharedDamageMultiplier=False,
               towers=rows, previous=aggregate(old['runs']), current=aggregate(data['runs']),
               method=data['method'])
(DOCS / 'garden-attack-stats-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
md = ['# 六塔攻击配置调整：移除共用结算增伤', '',
      '日期：2026-11-10。当前采用直接提高塔攻击配置的方式；此前garden-entry报告中的共用1.2增伤已经移除。', '',
      '## 实际修改', '',
      '- 删除共用伤害倍率及其结算代码，不保留隐藏乘区。',
      '- 六塔`baseDps`和`perLv`直接增加20%，1–13级基础攻击曲线同比提高。配置保存在`js/config/towers.js`；原字段以DPS存储，单次攻击=该DPS×基础攻击间隔。',
      '- 普攻、攻击力派生技能、灼烧/中毒等正常读取新攻击，不再在每次扣血时额外乘20%。固定伤害或固定百分比扣血保持原规则，天赋固定加攻击也不被额外统一放大。',
      '- 攻速、射程、基础攻击费用、技能独立能耗系数、经验及Boss参数本轮保持；花园W40仍为本体108000、每分身34560。', '',
      '| 塔 | 一级单次基础攻击（原→现） | 基础DPS | 每级DPS成长 |',
      '| --- | ---: | ---: | ---: |']
for r in rows:
    md.append(f'| {r["name"]} | {baseline[r["key"]][2]:g}→{r["initialAttack"]:g} | {r["baseDps"]:g} | {r["perLvDps"]:g} |')
md += ['', '一级基础攻击指正常能量档、无技能/圣物/天赋等增益、无目标减伤时的单次基础值。', '',
       '## 验证', '',
       '- 六塔在Lv1/4/8/13的基础攻击、技能伤害源、攻击费用检查通过；火塔42攻击对应每秒8.4的基础灼烧，保持20%攻击/秒。直接传入100伤害打25%减伤目标扣75血，没有额外共用加成。',
       '- 原塔伤害规则、209组周期能量边界、72组组合收费、44组强化发射与52组技能系数、25组射程快照、索敌与落点检查通过。',
       '- 仅圣坛花园24组完整回放，从W1至清理W40或首次失守；真实一星局内圣物、无商店/红卡/天赋盘，仍用两套路线、六种四塔组合、两种子、每2秒操作。没有重测后两图。', '',
       '| 配置 | 通过W20 | 到达W40 | 通过W40 | 终止波中位 |', '| --- | ---: | ---: | ---: | ---: |']
for label, r in [('此前共用结算增伤（已撤销）', summary['previous']), ('当前直接提高攻击', summary['current'])]:
    md.append(f'| {label} | {r["passed20"]}/24 | {r["reached40"]}/24 | {r["passed40"]}/24 | {r["medianEndWave"]:.1f} |')
md += ['', '攻击配置也参与发射前索敌和在途软预估，因此不能预先承诺与旧共用增伤版逐帧结果相同。两者按各自原生参数分别回放，旧结果保留为历史数据。样本通过数不是玩家胜率；本轮未评估W41–60，尚未真机复测。', '',
       '复跑：`node tools/collect-garden-attack-stats.cjs`、`node tools/test-entry-balance.cjs`、`python tools/report-garden-attack-stats.py`。', '']
(DOCS / 'garden-attack-stats-analysis.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(previous=summary['previous'], current=summary['current'], towers=rows), ensure_ascii=False))
