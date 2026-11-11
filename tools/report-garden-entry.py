"""圣坛花园首版平衡报告：区分条件回放与完整24组验收，保留旧源码基线。"""
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
                medianEndWave=statistics.median(r['wave'] for r in rs),
                timeCaps=sum(r['terminal'] == 'time_cap' for r in rs))


baseline = [r for route in ['primary', 'secondary'] for r in read(f'relic-only-{route}-build')['runs'] if r['field'] == 'ancient']
damage = read('relic-intervention-damage20')
native = read('garden-entry-native')
assert native['candidateExactReplayChecked'] and native['passiveReplayChecked'] and not native['liveChanges']
assert len(native['runs']) == 24 and all(r['field'] == 'ancient' for r in native['runs'])
for file, digest in native['sourceHashes'].items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
key = lambda r: (r['route'], r['seed'], r['profile'])
garden = [r for r in damage['runs'] if r['field'] == 'ancient']
indexed = {key(r): r for r in garden}
assert len(indexed) == 24
candidates = []
for pct in [50, 30, 20]:
    d = read(f'garden-entry-boss{pct}')
    assert d['sourceHashes'] == damage['sourceHashes'] and not d['liveChanges']
    assert d['reproducedDamage20'] and d['passiveReplayChecked']
    assert {key(r) for r in d['runs']} == {key(r) for r in garden if r['wave'] == 40}
    assert len(d['runs']) == 10 and len(d['unchanged']) == 14
    for r in d['runs']:
        old = indexed[key(r)]
        assert [w for w in r['waves'] if w['wave'] < 40] == [w for w in old['waves'] if w['wave'] < 40]
        assert r['observations']['entries'] == old['observations']['entries']
    candidates.append(dict(bossHpPercent=pct, bodyHp=d['bodyHp'], twinHp=d['twinHp'],
                           conditional=aggregate(d['runs']),
                           complete24=aggregate(d['runs'] + [r for r in garden if r['wave'] < 40])))
groups = [('原值', baseline), ('只加20%伤害', garden), ('已落地首版', native['runs'])]
summary = dict(date='2026-11-10', scope='Only garden, naturally unlocked1star in-battle relics, no shop/red/talents; six four-tower groups,two routes,two seeds,2s operation.',
               sourceHashes=native['sourceHashes'], oldSourceHashes=damage['sourceHashes'],
               changedGameSources=native['changedSources'], damageMultiplier=native['damageMultiplier'],
               bossHp=native['bossHp'], twinHp=native['bossHp'] * .32,
               candidateRuns=30, nativeRuns=24, candidates=candidates,
               aggregates=[dict(label=label, **aggregate(rs)) for label, rs in groups])
(DOCS / 'garden-entry-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False
fig, ax = plt.subplots(figsize=(9, 5.5))
for i, (label, metric, color) in enumerate([('通过W20', 'passed20', '#537e72'), ('到达W40', 'reached40', '#81a8bb'), ('通过W40', 'passed40', '#c58d40')]):
    x = [j + (i - 1) * .25 for j in range(3)]
    values = [r[metric] for r in summary['aggregates']]
    ax.bar(x, values, .23, color=color, label=label)
    for at, value in zip(x, values): ax.text(at, value + .35, str(value), ha='center', fontsize=11)
ax.set_xticks(range(3), [r['label'] for r in summary['aggregates']])
ax.set_ylim(0, 27); ax.set_yticks(range(0, 25, 6)); ax.set_ylabel('样本数，每组24个')
ax.grid(axis='y', alpha=.15); ax.spines[['top', 'right']].set_visible(False)
ax.legend(loc='upper left', bbox_to_anchor=(0, -.09), ncol=3)
ax.set_title('圣坛花园｜一星局内圣物，无商店、无红卡天赋', pad=20)
fig.text(.5, .025, '已落地首版：六塔伤害结算×1.2，W40本体/分身生命均为原20%。样本结果不等于真人胜率。', ha='center', fontsize=9)
fig.subplots_adjust(bottom=.23, top=.85); fig.savefig(DOCS / 'garden-entry-overview.png', dpi=160, facecolor='white'); plt.close(fig)

md = ['# 圣坛花园入门难度：首版调整与验收', '',
      '日期：2026-11-10。本轮已修改游戏代码，并使用实际参数完成24组完整回放验收。仅测试圣坛花园，未重测熔岩矿场和霜风峡谷。', '',
      '## 已落地参数', '',
      '- `js/config/combat-common.js`：`towerDamageMultiplier = 1.2`，六塔来源进入共用伤害结算时增加20%，覆盖该路径的普攻、技能和持续伤害。',
      '- 不提高基础攻击配置或发射伤害快照，避免普攻倍率计费跟着增加；实际费用、各技能0.8折算、经验门槛和经验奖励保持。Boss转阶段溢出进入已结算路径，不重复叠加。',
      '- 固定百分比扣血等原本绕开共用伤害入口的机制保持原口径，不宣称所有扣血路径均增加20%。在途伤害仍为原来的软预估，本轮不叠加索敌调整。',
      '- 花园W40迦尔文本体540000→108000，两个分身各172800→34560；共鸣和幸存回血按各自最大血量计算，也自然同比降低。',
      '- 分裂阈值60%、护甲、本体/分身移速、攻城伤害、共鸣层数、回响减速及小怪配置保持。W20、W60 Boss参数未改。',
      '- 六塔增伤是共用规则，会影响其他战场；后两图的敌人配置、环境规则、出怪数量和Boss接入本轮未改。以后单独用地图强化与敌人设计建立难度递进。', '',
      '## 为什么同步调整本体与分身', '',
      '上轮只降低本体生命而保留原分身，不足以降低整场Boss预算。本轮固定六塔伤害增加20%，分别将本体与分身生命一起缩放为原50%、30%、20%；只重放原伤害组自然到达W40的10组，另外14组提前失守，W40参数不可能改变它们此前的结果。', '',
      '| Boss生命保留比例 | 本体 | 每个分身 | 到达W40的10组中通过 | 折回完整24组通过 |',
      '| --- | ---: | ---: | ---: | ---: |']
for r in candidates:
    md.append(f'| {r["bossHpPercent"]}% | {r["bodyHp"]:.0f} | {r["twinHp"]:.0f} | {r["conditional"]["passed40"]}/10 | {r["complete24"]["passed40"]}/24 |')
md += ['', '采用20%档作为首版候选：原本分裂前需打掉216000生命，现为43200；加上两只分身，整场最低净生命损失预算从561600降到112320，未包含护甲、护盾、小怪和回血。保留机制挑战，先移除过高的生命门槛。大幅削减是对原54万预算的校准，不代表已证明全关卡需要同样减血。', '',
       '## 实际游戏参数验收', '',
       '随后取消所有离线增伤/Boss注入，使用正式参数从W1完整重放全部24组。每组逐项对照原伤害组或对应Boss候选，结果一致，确认没有再额外乘一次增益。', '',
       '| 版本 | 通过W20 | 到达W40 | 完整清理W40 | 终止波中位 |', '| --- | ---: | ---: | ---: | ---: |']
for r in summary['aggregates']:
    md.append(f'| {r["label"]} | {r["passed20"]}/24 | {r["reached40"]}/24 | {r["passed40"]}/24 | {r["medianEndWave"]:.1f} |')
md += ['', '![花园对照图](garden-entry-overview.png)', '',
       '这是首版改善，不是“首关已经平衡完成”。仍有14/24组在W40之前失守；能到达W40的10组中4组通过。尤其周期/驻场路线仍有压力，不能只靠进一步削Boss血量解决W29–39的失败。', '',
       '下一轮应继续只测花园，按失败构筑拆分W25–39的供能、普攻与周期/驻场技能输出，再复测W41–60。W60未在本轮采集，不能宣称已经完成60波通关平衡。', '',
       '## 验证与范围', '',
       '- 新增30组条件候选回放、24组正式参数完整回放，另有完整复现及观察器被动检查。没有新跑后两张地图。',
       '- 所有候选W40之前的逐波结果和入场快照与伤害组一致；正式24组与各自候选完整结果一致。',
       '- 一星局内圣物经正常掉落、入盘、开箱和三选一获得，无商店、红卡、天赋盘、局外加成、重掷和复活。两种子、两套固定路线、六种四塔组合，每2秒操作，不是最优构筑搜索或真人胜率。',
       '- 六塔来源、直接/持续伤害、护甲、收费隔离、真实分裂溢出回归通过；原伤害规则、209组周期能量边界、72组组合收费、独立技能系数、25组射程快照、索敌与落点回归通过。实际扣血断言已纳入共用1.2增益，原技能和弹体倍率断言保留。',
       '- 当前JS源码与候选旧快照仅3个文件不同：`js/config/combat-common.js`、`js/combat/damage.js`、`js/config/bosses.js`。本轮未覆盖或还原此前其他修改，未提交Git，尚未真机复测。',
       '- 最新可复跑：`node tools/collect-garden-entry-native.cjs`、`node tools/test-entry-balance.cjs`、`python tools/report-garden-entry.py`。候选采集工具要求旧源码哈希，以防用新参数重算并覆盖历史对照。', '']
(DOCS / 'garden-entry-analysis.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(candidates=candidates, aggregates=summary['aggregates']), ensure_ascii=False))
