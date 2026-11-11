"""花园后半段单一版本验收：新8组完整回放与旧16组前40波失败复用，明确真机边界。"""
from pathlib import Path
import gzip
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
PROFILES = {'elements': '火冰毒电', 'no_ice': '火毒电炮', 'wind_control': '冰毒电镖',
            'artillery_control': '火冰电炮', 'summon_control': '火冰毒炮', 'wind_artillery': '火冰镖炮'}


def read(name):
    return json.loads(gzip.decompress((DOCS / f'{name}.json.gz').read_bytes()))


def key(r):
    return r['route'], r['profile'], r['seed']


def passed(r):
    return r['wave'] == 60 and r['terminal'] in ['victory', 'window_complete']


old = read('garden-full60')
new = read('garden-late-rebalance')
early = read('garden-attack-stats')
assert new['passiveReplayChecked'] and not new['liveChanges']
assert len(new['runs']) == 8 and len(new['reused']) == 16
assert new['reused'] == old['reused']
for file, digest in new['sourceHashes'].items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
index = {key(r): r for r in old['runs']}
assert {key(r) for r in new['runs']} == set(index)
for r in new['runs']:
    assert [w for w in r['waves'] if w['wave'] <= 40] == [w for w in index[key(r)]['waves'] if w['wave'] <= 40]
    if passed(r):
        assert r['observations']['finalEncounter']['finished']
        assert r['observations']['finalEncounter']['finalVictory']
early_index = {key(r): r for r in early['runs']}
reused = [early_index[key(r)] for r in new['reused']]
all_old = old['runs'] + reused
all_new = new['runs'] + reused
assert len({key(r) for r in all_new}) == 24


def aggregate(rs):
    return dict(cases=len(rs), reached40=sum(r['wave'] >= 40 for r in rs),
                reached50=sum(r['wave'] >= 50 for r in rs), reached60=sum(r['wave'] >= 60 for r in rs),
                passed60=sum(passed(r) for r in rs), timeCaps=sum(r['terminal'] == 'time_cap' for r in rs))


rows = []
for r in new['runs']:
    b = index[key(r)]
    rows.append(dict(route=r['route'], profile=r['profile'], seed=r['seed'], oldWave=b['wave'], newWave=r['wave'],
                     oldTerminal=b['terminal'], newTerminal=r['terminal'], passed60=passed(r),
                     levels=r['levels'], relicCount=sum(r['runRelics'].values()),
                     finalEncounter=r['observations']['finalEncounter']))
summary = dict(date='2026-11-10', sourceHashes=new['sourceHashes'], changedSources=new['changedSources'],
               parameters=new['parameters'], old=aggregate(all_old), new=aggregate(all_new),
               newFullRuns=8, reusedUnchangedFailures=16, before40ExactReplay=True,
               deviceValidation=False, rows=rows)
(DOCS / 'garden-late-rebalance-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False
fig, ax = plt.subplots(figsize=(9, 5.2))
for i, (name, label, color) in enumerate([('old', '调整前', '#9ca4ad'), ('new', '本次单版调整', '#56877a')]):
    values = [summary[name][k] for k in ['reached50', 'reached60', 'passed60']]
    x = [j + (i - .5) * .32 for j in range(3)]
    ax.bar(x, values, .29, color=color, label=label)
    for at, value in zip(x, values):
        ax.text(at, value + .35, f'{value}/24', ha='center', fontsize=11)
ax.set_xticks(range(3), ['到达W50', '到达W60', '通关60波'])
ax.set_ylim(0, 14); ax.set_yticks(range(0, 15, 2)); ax.legend()
ax.grid(axis='y', alpha=.15); ax.spines[['top', 'right']].set_visible(False)
ax.set_title('圣坛花园后半段调整｜一星圣物，无商店/红卡天赋', pad=20)
fig.text(.5, .03, '8组从开局完整复测，16组未受影响的前40波失败复用；样本结果不等于真人胜率，尚待真机验收。', ha='center', fontsize=9)
fig.subplots_adjust(top=.83, bottom=.17); fig.savefig(DOCS / 'garden-late-rebalance-overview.png', dpi=160, facecolor='white'); plt.close(fig)

md = ['# 圣坛花园后半段：单版调整与离线验收', '',
      '日期：2026-11-10。已落地本版，只测试圣坛花园；没有继续扩大降费、增伤或极光候选。', '',
      '## 修改内容', '',
      '| 项目 | 调整 |', '| --- | --- |',
      '| 花园W41–59敌群生命 | 相对原等级表，W41为100%，线性过渡到W59的70%；W50为85% |',
      '| W60薇拉本体 | 1800000→240000 |',
      '| W60每只召唤怪 | 11000→2400；仍每10秒3只 |', '',
      '花园区间倍率在出生时统一应用一次，涵盖普通怪、精英、小Boss及其出生在区间内的召唤物；不会在后续波次重新缩放存活怪。W1–40、W60及更后波不应用此区间倍率。W60使用独立本体和召唤配置，避免对2400生命再乘70%。', '',
      '塔基础攻击/成长、技能伤害、攻速、射程、能耗及Boss战较高收费保持；敌人攻击、护甲、移速和数量保持。W60三阶段70%/35%阈值、38%起始/58%上限减伤、每6秒4%城墙裂痕及随从投放机制保持。W60理论召唤新增原始血量从3300/秒降到720/秒。', '',
      '仅花园配置增加血量曲线；共享怪物等级表未改，熔岩/霜风/深渊/测试战场倍率保持1，没有跑后两图平衡回放。出生、普通波次参考血量和Run波末计算使用同一个倍率；动态小Boss召唤沿用原有追加流程。', '',
      '## 完整回放结果', '',
      '对原来通过W40的8组重新从W1自然推进至W60或首次失守；其余16组在W40前或W40失守，变更未覆盖该阶段，因此复用原失败。两套固定路线、六种四塔组合、两种子、每2秒操作；真实一星局内圣物，无商店、红卡、天赋盘、重掷/复活、额外注入资源。', '',
      '| 24组样本汇总 | 调整前 | 调整后 |', '| --- | ---: | ---: |']
for metric, label in [('reached50', '到达W50'), ('reached60', '到达W60'), ('passed60', '通关60波')]:
    md.append(f'| {label} | {summary["old"][metric]}/24 | {summary["new"][metric]}/24 |')
md += ['', '到达不等于清理该波。通关要求原生终极Boss完成标记、finalVictory和采集终止状态一致；时间上限不是通关。此结果不是玩家胜率，未包含二/三星圣物成长。', '',
       '![调整前后](garden-late-rebalance-overview.png)', '',
       '| 路线/构筑/种子 | 调整前 | 调整后 |', '| --- | --- | --- |']
for r in rows:
    route = '强化普攻' if r['route'] == 'primary' else '周期/驻场'
    result = '通关60波' if r['passed60'] else f'W{r["newWave"]}失守' if r['newTerminal'] == 'wall_broken' else f'W{r["newWave"]}·{r["newTerminal"]}'
    md.append(f'| {route}·{PROFILES[r["profile"]]}·{r["seed"]} | W{r["oldWave"]}失守 | {result} |')
md += ['', '## 回归与边界', '',
       '- 8组前40波逐波记录均与调整前完全一致；观察器被动对照通过。塔攻击和技能能耗配置没有修改。',
       '- 新增预算回归通过：W40/41/50/59/60/61边界、地图隔离、初始计划/真实出生/普通波次结算倍率一致、动态出生只缩放一次、Vera原生240000生命与每批7200召唤生命、阶段阈值和裂痕80伤害。',
       '- 既有塔伤害、209组周期能量边界、72组组合计费、44组强化发射/52组独立系数、25组射程快照、索敌与落点、W2宝箱与切波能量守恒检查通过。',
       '- 当前源码相对调整前仅5个JS文件改变：config.js、config/bosses.js、新增config/field-balance.js、run.js、wave.js。此前未提交改动均保留，未上传Git。',
       '- 离线检查和本版回归已完成；真机帧率、发热和操作体验尚未验收。本版不以少量固定路线样本宣称首关所有构筑已完全平衡，不继续盲目追加候选，先用真机验证这一版。', '',
       '## 配置入口与复跑', '',
       '- 花园区间生命：`js/config.js`的`FIELDS.ancient.lateEnemyHp`；计算函数`js/config/field-balance.js`。',
       '- W60本体/召唤：`js/config/bosses.js`的`altar_vera.hp`与`summonHp`。',
       '- `node tools/test-garden-late-rebalance.cjs`、`node tools/collect-garden-late-rebalance.cjs`、`python tools/report-garden-late-rebalance.py`。', '']
(DOCS / 'garden-late-rebalance-analysis.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps(dict(old=summary['old'], new=summary['new'], rows=rows), ensure_ascii=False))
