"""完整60波收尾：8组从W1延伸回放与16组相同源码下的早期失败组合，区分到达和通关。"""
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


base = read('garden-attack-stats')
data = read('garden-full60')
assert data['sourceHashes'] == base['sourceHashes'] and data['passiveReplayChecked'] and not data['liveChanges']
for file, digest in data['sourceHashes'].items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
index = {key(r): r for r in base['runs']}
assert len(data['runs']) == 8 and len(data['reused']) == 16
assert {key(r) for r in data['runs']} == {key(r) for r in base['runs'] if r['terminal'] == 'window_complete'}
for r in data['runs']:
    assert r['field'] == 'ancient'
    assert [w for w in r['waves'] if w['wave'] < 40] == [w for w in index[key(r)]['waves'] if w['wave'] < 40]
for r in data['reused']:
    b = index[key(r)]
    assert (r['wave'], r['terminal']) == (b['wave'], b['terminal']) and b['terminal'] == 'wall_broken'
all_runs = data['runs'] + [index[key(r)] for r in data['reused']]
assert len({key(r) for r in all_runs}) == 24
passed60 = [r for r in data['runs'] if r['terminal'] in ['victory', 'window_complete'] and r['wave'] == 60]
summary = dict(date='2026-11-10', sourceHashes=data['sourceHashes'], gameNumericalChanges=False,
               newFullRuns=8, reusedEarlierFailures=16, totalCases=24,
               reached40=sum(r['wave'] >= 40 for r in all_runs), passed40=8,
               reached50=sum(r['wave'] >= 50 for r in all_runs),
               reached60=sum(r['wave'] >= 60 for r in all_runs), passed60=len(passed60),
               timeCaps=sum(r['terminal'] == 'time_cap' for r in all_runs), lateRuns=[], boss60=[])
for r in data['runs']:
    summary['lateRuns'].append(dict(route=r['route'], profile=r['profile'], seed=r['seed'], wave=r['wave'],
                                    terminal=r['terminal'], seconds=r['seconds'], levels=r['levels'],
                                    relicCount=sum(r['runRelics'].values())))
    if r['wave'] != 60:
        continue
    w = r['waves'][-1]
    members = w['boss']['members'] or []
    hp = sum(max(0, e['hp']) for e in members)
    maximum = sum(e['maxHp'] for e in members)
    assert maximum > 0
    entry = r['observations']['lateBoss'][0]
    summary['boss60'].append(dict(route=r['route'], profile=r['profile'], seed=r['seed'],
                                  waveSeconds=w['seconds'], phase=w['boss']['phase'], hp=hp, maxHp=maximum,
                                  remainingFraction=hp / maximum, wallAtEntry=entry['wallHp'],
                                  levelsAtEntry=entry['levels'], cardsAtEntry=sum(entry['relics'].values()),
                                  totalWaveDamage=sum(d['total'] for d in w['damage'].values()),
                                  note='Wave damage includes adds and remaining prior-wave enemies; not Boss DPS.'))
(DOCS / 'garden-full60-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False
fig, ax = plt.subplots(figsize=(9, 5))
labels = ['通过W20', '到达W40', '通过W40', '到达W50', '到达W60', '通关60波']
values = [24, summary['reached40'], 8, summary['reached50'], summary['reached60'], summary['passed60']]
ax.bar(range(6), values, color=['#75958a', '#86a0b6', '#527d76', '#a4a1b5', '#c6a069', '#ad7068'])
for i, value in enumerate(values):
    ax.text(i, value + .4, f'{value}/24', ha='center', fontsize=11)
ax.set_xticks(range(6), labels); ax.set_ylim(0, 27); ax.set_yticks(range(0, 25, 6))
ax.set_title('圣坛花园完整60波｜一星圣物，无商店/红卡天赋', pad=20)
ax.grid(axis='y', alpha=.15); ax.spines[['top', 'right']].set_visible(False)
fig.text(.5, .025, '8组从开局延伸回放；16组源码一致的既有早期失败复用。固定路线与两种子样本，不是真人胜率。', ha='center', fontsize=9)
fig.subplots_adjust(top=.83, bottom=.17); fig.savefig(DOCS / 'garden-full60-overview.png', dpi=160, facecolor='white'); plt.close(fig)

md = ['# 收尾第二轮：圣坛花园完整60波复测', '',
      '日期：2026-11-10。本轮正式游戏参数未改；只测圣坛花园。六塔基础攻击/成长+20%、原0.8技能系数、W40本体108000/分身34560保持。', '',
      '## 口径', '',
      '- 24组当前基线里，通过W40的8组重新从W1自然推进到清理W60或首次失守；其余16组在W40前或W40已失守，源码一致，因此复用原失败。没有把这些16组冒充新的完整回放。',
      '- 同样两套固定路线、六种四塔组合、两种子、每2秒操作；正常一星圣物获取，无商店、红卡、天赋盘、重掷/复活、注入经验/能量/卡片。W40后奖励正常领取，再继续构筑，不从W40空降满级塔。',
      '- 8组W40之前逐波结果与旧基线完全一致；新增完整回放观察器被动对照通过。3600秒上限不是通关，结果无时间上限样本。', '',
      '## 24组样本的推进', '',
      f'- 通过W20：24/24；到达W40：{summary["reached40"]}/24；通过W40：8/24。',
      f'- 到达W50：{summary["reached50"]}/24；到达W60：{summary["reached60"]}/24；通关60波：{summary["passed60"]}/24。', '',
      '到达某波不等于清理该波。样本不是完整构筑搜索或真人胜率，也未包含二/三星圣物养成。', '',
      '![完整60波推进](garden-full60-overview.png)', '',
      '| 路线/构筑/种子 | 终止波 | 结果 | 终止塔等级 | 已获取圣物张数 |',
      '| --- | ---: | --- | --- | ---: |']
for r in summary['lateRuns']:
    route = '强化普攻' if r['route'] == 'primary' else '周期/驻场'
    levels = ' / '.join(f'{k}:{v}' for k, v in r['levels'].items())
    md.append(f'| {route}·{PROFILES[r["profile"]]}·{r["seed"]} | {r["wave"]} | 失守 | {levels} | {r["relicCount"]} |')
md += ['', '## W60：两组都还在一阶段', '',
       '| 构筑/种子 | 入场墙血 | 入场等级 | 入场圣物数 | 本波时间 | 失守时阶段 | Boss剩余生命 |',
       '| --- | ---: | --- | ---: | ---: | ---: | ---: |']
for r in summary['boss60']:
    md.append(f'| {PROFILES[r["profile"]]}·{r["seed"]} | {r["wallAtEntry"]:.0f} | {r["levelsAtEntry"]} | {r["cardsAtEntry"]} | {r["waveSeconds"]:.1f}秒 | {r["phase"]} | {r["hp"]:.0f}/{r["maxHp"]:.0f}（{r["remainingFraction"]:.1%}） |')
md += ['',
       '代码核对：薇拉本体180万血、初始38%减伤，降至70%生命才进入二阶段，所以一阶段需打掉54万净生命。两组失守前分别只打掉约14.6万和19.6万，尚未触发二/三阶段，因此不能用后续58%护甲、裂坛城墙扣血解释本批一阶段失守。', '',
       '第一阶段还每10秒召唤3只各11000生命的小怪，单看新增原始血量就是3300/秒，未含护甲、初始随从与前波残怪。两组本波总伤害约65.9万/81.1万包含小怪，不能当作Boss本体单体伤害。', '',
       'W40整场最低净生命门槛为43200本体阶段损失+2×34560分身=112320；W60本体180万已是其约16倍，尚未计召唤等额外压力。塔在后半段只自然成长到约9–10级，未达到“每塔13级全分支满”。这说明W60预算与当前自然成长需要重新匹配，不能只以满级固定靶DPS判断首关能过。', '',
       '## 收尾决定', '',
       '**前两轮检查完成，当前版本仍未达到首关通关平衡。**本轮没有继续叠加全塔攻击，也没有采用先前降费或极光候选。需要集中设计一版W41–60敌群成长及W60本体/召唤预算，再进入最后的修改后回归和真机验收。', '',
       '不能只削W60本体：8组中已有6组在W47–59失守；即便到达W60，持续召唤也占据很大清怪预算。应把普通敌群成长、Boss生命、随从与召唤作为同一版后半段预算校准，保留Boss机制与已确定的收费规则。', '',
       '尚未操作真实手机，不能宣称已验收帧率、发热或真人操作体验。先让离线后半段预算达到可评估状态，再由真实设备完成最后一轮验收。', '',
       '复跑：`node tools/collect-garden-full60.cjs`、`python tools/report-garden-full60.py`。原始数据保留逐波能量/伤害、升级、完整圣物候选与W60每5秒Boss/城墙/构筑快照。', '']
(DOCS / 'garden-full60-analysis.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps({k: v for k, v in summary.items() if k not in ['sourceHashes']}, ensure_ascii=False))
